import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
function load(file, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', ...Object.keys(globals), code)(name => imports[name], exports, ...Object.values(globals))
  return exports
}
const types = load('../lib/question-type.ts')
const quiz = load('../lib/anatomy-quiz.ts', { './question-type': types, '@/lib/utils': { normalizeAnswer: value => value.trim().toLowerCase() } })
const readiness = load('../lib/case-readiness.ts', { './anatomy-quiz': quiz })
const complete = { date: '2026-11-01', category: 'Trauma', prompt: 'Prompt', answer: 'Answer', teaching: 'Useful explanation', images: ['https://example.com/image.png', ''], choices: ['Clue', '', '', '', '', ''], correctLetters: [], isChoice: false, replacing: false, revealSteps: ['none', 'none'] }

test('readiness only shows actionable problems, not completed items or new-answer warnings', () => {
  assert.deepEqual(readiness.getCaseReadiness(complete), [])
  assert.match(readiness.getCaseReadiness({ ...complete, images: ['', ''] })[0], /No case image/)
  assert.match(readiness.getCaseReadiness({ ...complete, replacing: true })[0], /confirm replacement/)
  assert.equal(readiness.hasTeachingContent('**<u>Clinical Pearl</u>**\n\n**Who**\n**Tx**'), false)
  assert.match(readiness.getCaseReadiness({ ...complete, teaching: '**Who**' })[0], /teaching point/)
})

test('quiz readiness validates choices without demanding diagnosis clues', () => {
  const input = { ...complete, isChoice: true, choices: ['Nerve A', 'Nerve B'], correctLetters: ['B'] }
  assert.deepEqual(readiness.getCaseReadiness(input), [])
  assert.equal(readiness.getCaseReadiness({ ...input, correctLetters: [] }).length, 1)
  assert.equal(readiness.getCaseReadiness({ ...input, choices: ['Nerve A', '', 'Nerve B'] }).length, 1)
  assert.match(readiness.getCaseReadiness({ ...complete, revealSteps: ['4', 'none'] })[0], /empty clue 4/)
})

function imageHarness() {
  let cursor = 0
  const values = [], effects = []
  const react = {
    useState: initial => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }] },
    useRef: () => ({ current: null }),
    useEffect: callback => effects.push(callback),
  }
  const timers = new Map()
  const module = load('../components/CaseImage.tsx', { react, 'react/jsx-runtime': jsx }, { window: { setTimeout: callback => { timers.set(1, callback); return 1 }, clearTimeout: id => timers.delete(id) } })
  const props = { src: 'https://example.com/image?signature=original', alt: 'Case image', onOpen() {}, className: 'h-[280px]' }
  const root = module.CaseImage(props)
  const render = () => { cursor = 0; effects.length = 0; return root.type(props) }
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []
  return { render, nodes, effects, timers, root, module, props }
}

test('images reserve space, load, fail, and retry without changing signed URLs or nesting buttons', () => {
  const h = imageHarness()
  let tree = h.render()
  assert.equal(tree.props['aria-busy'], true)
  assert.ok(tree.props.className.includes('h-[280px]'))
  const initial = h.nodes(tree).find(node => node.type === 'img')
  initial.props.onError()
  tree = h.render()
  const retry = h.nodes(tree).find(node => node.type === 'button' && node.props.children === 'Retry image')
  assert.ok(retry)
  retry.props.onClick({ stopPropagation() {} })
  tree = h.render()
  const nextImage = h.nodes(tree).find(node => node.type === 'img')
  assert.notEqual(nextImage.key, initial.key)
  assert.equal(nextImage.props.src, initial.props.src)
  nextImage.props.onLoad()
  tree = h.render()
  assert.equal(tree.props['aria-busy'], false)
  assert.equal(h.nodes(tree).find(node => node.type === 'button').props.disabled, false)
  for (const button of h.nodes(tree).filter(node => node.type === 'button')) assert.equal(h.nodes(button.props.children).filter(node => node.type === 'button').length, 0)
  assert.notEqual(h.root.key, h.module.CaseImage({ ...h.props, src: 'another-image' }).key)
})

test('stalled images expose retry and clean up their loading timeout', () => {
  const h = imageHarness()
  h.render()
  const cleanups = h.effects.map(effect => effect())
  h.timers.get(1)()
  assert.ok(h.nodes(h.render()).some(node => node.type === 'button' && node.props.children === 'Retry image'))
  for (const cleanup of cleanups) cleanup?.()
  assert.equal(h.timers.size, 0)
})

test('image dialog handles Escape, traps focus, locks background scrolling, and restores position', () => {
  let effect, closed = 0
  const handlers = new Map(), scrolls = []
  const document = { activeElement: null, body: { style: { position: '', top: '', width: '', overflow: '' } }, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) }
  class Element {
    isConnected = true
    focus() { document.activeElement = this }
    blur() { document.activeElement = null }
    matches() { return false }
    getClientRects() { return [{}] }
  }
  const opener = new Element(), close = new Element(), last = new Element()
  document.activeElement = opener
  const hook = load('../hooks/useImageDialog.ts', { react: { useRef: current => ({ current }), useEffect: callback => { effect = callback } } }, {
    document, HTMLElement: Element, window: { scrollY: 350, scrollTo: value => scrolls.push(value) },
  })
  const ref = hook.useImageDialog(true, () => closed++)
  ref.current = { querySelector: () => close, querySelectorAll: () => [close, last] }
  const cleanup = effect()
  assert.equal(document.activeElement, close)
  assert.equal(document.body.style.position, 'fixed')
  assert.equal(document.body.style.top, '-350px')
  handlers.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() {} })
  assert.equal(document.activeElement, last)
  handlers.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() {} })
  assert.equal(document.activeElement, close)
  handlers.get('keydown')({ key: 'Escape', preventDefault() {} })
  assert.equal(closed, 1)
  cleanup()
  assert.equal(document.body.style.position, '')
  assert.equal(document.activeElement, opener)
  assert.equal(scrolls[0].top, 350)
  assert.equal(handlers.size, 0)
})
