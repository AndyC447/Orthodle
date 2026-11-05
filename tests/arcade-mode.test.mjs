import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function load(path, globals = {}, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', ...Object.keys(globals), code)(name => imports[name] ?? require(name), exports, ...Object.values(globals))
  return exports
}

test('Arcade mode defaults on and persists independently of night mode', () => {
  const stored = new Map()
  const root = { dataset: { theme: 'dark' } }
  const appearance = load('../lib/appearance.ts', {
    window: { dispatchEvent() {}, localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) } },
    document: { documentElement: root },
  })
  assert.equal(appearance.readArcadeMode(), true)
  appearance.setArcadeMode(false)
  assert.equal(root.dataset.arcade, 'off')
  assert.equal(appearance.readArcadeMode(), false)
  assert.equal(root.dataset.theme, 'dark')
  appearance.setArcadeMode(true)
  assert.equal(appearance.readArcadeMode(), true)
})

test('Arcade mode still switches when browser storage is blocked', () => {
  const root = { dataset: {} }
  const appearance = load('../lib/appearance.ts', {
    window: { dispatchEvent() {}, localStorage: { getItem() { throw Error('Blocked') }, setItem() { throw Error('Blocked') } } },
    document: { documentElement: root },
  })
  assert.equal(appearance.readArcadeMode(), true)
  assert.doesNotThrow(() => appearance.setArcadeMode(false))
  assert.equal(root.dataset.arcade, 'off')
})

test('theme action names the destination: Regular theme in arcade, Arcade theme in regular', () => {
  let enabled = true, menuCloses = 0
  const saved = []
  const { ArcadeModeToggle } = load('../components/ArcadeModeToggle.tsx', {}, {
    react: { useEffect() {}, useState: () => [enabled, value => { enabled = value }] },
    '@/lib/appearance': { setArcadeMode: value => saved.push(value) },
  })
  const render = () => ArcadeModeToggle({ onToggle: () => { menuCloses++ } })
  let button = render()
  assert.equal(button.props['aria-label'], 'Regular theme')
  assert.match(renderToStaticMarkup(button), /<span>Regular theme<\/span>/)
  assert.equal(button.props.role, undefined)
  assert.equal(button.props['aria-checked'], undefined)
  button.props.onClick()
  button = render()
  assert.equal(button.props['aria-label'], 'Arcade theme')
  assert.match(renderToStaticMarkup(button), /<span>Arcade theme<\/span>/)
  button.props.onClick()
  assert.equal(render().props['aria-label'], 'Regular theme')
  assert.deepEqual(saved, [false, true])
  assert.equal(menuCloses, 2)
})

test('Arcade keeps readable body and form text with pixel branding, without altering regular or admin typography', () => {
  const css = readFileSync(new URL('../app/bone-arcade.css', import.meta.url), 'utf8')
  assert.match(css, /:root\[data-arcade="on"\] \.bone-arcade\[data-arcade-surface\]\s*\{[^}]*font-family: "Orthodle Plex", sans-serif;/)
  assert.match(css, /:is\(\.font-serif, input, button, textarea, select\)\s*\{\s*font-family: "Orthodle Plex", sans-serif;/)
  assert.match(css, /:is\(\.orthodle-wordmark, \.orthodle-home-tab, \.orthodle-home-tab-active\)\s*\{\s*font-family: "Orthodle Pixel", monospace;/)
  assert.doesNotMatch(css, /\[data-arcade-surface\] \*\s*\{\s*font-family:/)
  const fontRules = [...css.matchAll(/([^{}]+)\{[^{}]*font-family:\s*([^;]+);[^{}]*\}/g)]
    .filter(match => !match[1].includes('@font-face'))
  assert.ok(fontRules.length > 0)
  for (const [, selector, font] of fontRules) {
    assert.ok(selector.includes(':root[data-arcade="on"]'))
    assert.ok(selector.includes('.bone-arcade[data-arcade-surface]'))
    assert.ok(['"Orthodle Pixel", monospace', '"Orthodle Plex", sans-serif'].includes(font))
  }
})

test('six clue squares reflect used and remaining guesses', () => {
  const { ClueProgress } = load('../components/ClueProgress.tsx')
  const html = renderToStaticMarkup(createElement(ClueProgress, { used: 4, total: 6, complete: false, won: false }))
  assert.equal((html.match(/data-state="used"/g) || []).length, 4)
  assert.equal((html.match(/data-state="remaining"/g) || []).length, 2)
  assert.match(html, /aria-label="2 of 6 guesses remaining"/)
})

test('a completed or missed case does not report unused guesses as available', () => {
  const { ClueProgress } = load('../components/ClueProgress.tsx')
  const solved = renderToStaticMarkup(createElement(ClueProgress, { used: 2, total: 6, complete: true, won: true }))
  assert.match(solved, /aria-label="Case solved"/)
  assert.equal((solved.match(/data-state="correct"/g) || []).length, 1)
  assert.doesNotMatch(solved, /data-state="remaining"/)
  const missed = renderToStaticMarkup(createElement(ClueProgress, { used: 6, total: 6, complete: true, won: false }))
  assert.match(missed, /aria-label="No guesses remaining"/)
})
