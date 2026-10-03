import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function load(path, mocks) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', code)(name => mocks[name], exports)
  return exports
}
const jsx = { jsx: (tag, props, key) => ({ tag, props, key }), jsxs: (tag, props, key) => ({ tag, props, key }) }
const records = ['newer', 'current', 'correct', 'exhausted', 'anatomy', 'local', 'pending'].map(id => ({
  id, case_date: '2026-05-19', level: id === 'anatomy' ? 'attending' : id === 'local' ? 'resident' : 'med_student',
}))
async function nextCase({ cases = records, guesses = [], completed = [], error = null, current = 'current' } = {}) {
  const state = [], effects = []
  let cursor = 0
  const component = load('../components/ArchiveCaseActions.tsx', {
    react: { useState: initial => { const slot = cursor++; state[slot] = initial; return [initial, value => { state[slot] = value }] }, useEffect: fn => effects.push(fn) },
    'react/jsx-runtime': jsx,
    'next/link': { default: 'a' },
    '@/lib/utils': { getCompletedCaseKeys: () => completed, getSessionId: () => 'session', todayISO: () => '2026-10-02' },
    '@/lib/anatomy-quiz': { isAnatomyQuizCaseRecord: item => item.id === 'anatomy' },
    '@/lib/supabase': { supabase: { from: table => {
      const query = { select() { return this }, gte() { return this }, lt() { return this }, eq() { return this }, order() { return this },
        range: async () => ({ data: table === 'cases' ? cases : guesses, error }) }
      return query
    } } },
  })
  component.ArchiveCaseActions({ currentId: current })
  effects.forEach(fn => fn())
  await new Promise(resolve => setImmediate(resolve))
  return state
}
test('next archive case skips current, server completions, exhausted anatomy, and local daily completions', async () => {
  const guesses = [{ case_id: 'correct', is_correct: true }, { case_id: 'anatomy', is_correct: false },
    ...Array.from({ length: 6 }, () => ({ case_id: 'exhausted', is_correct: false }))]
  const [href] = await nextCase({ guesses, completed: ['2026-05-19:resident:daily'] })
  assert.equal(new URL(href, 'https://test.local').searchParams.get('case'), 'pending')
})
test('next archive case wraps to newer cases', async () => {
  const [href] = await nextCase({ cases: [records[0], records[1]] })
  assert.equal(new URL(href, 'https://test.local').searchParams.get('case'), 'newer')
})
test('empty archive and network errors keep calendar return available without a broken next link', async () => {
  const [href, status] = await nextCase({ cases: [records[1]] })
  assert.equal(href, null)
  assert.match(status, /completed all/)
  const [errorHref, errorStatus] = await nextCase({ error: new Error('offline') })
  assert.equal(errorHref, null)
  assert.match(errorStatus, /Could not find/)
})
test('reset remounts only the embedded player and keeps its example URL', () => {
  const state = [], refs = []
  let cursor = 0, refCursor = 0
  const component = load('../components/EmbeddedCasePlayer.tsx', {
    react: {
      useState: initial => { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }] },
      useRef: initial => refs[refCursor++] ||= { current: initial }, useEffect() {},
    }, 'react/jsx-runtime': jsx,
  })
  const render = () => { cursor = 0; refCursor = 0; return component.EmbeddedCasePlayer({ src: '/?case=demo&embed=1', title: 'Example' }) }
  const before = render()
  const frameBefore = before.props.children.find(child => child?.tag === 'iframe')
  before.props.children[0].props.children.props.onClick()
  const frameAfter = render().props.children.find(child => child?.tag === 'iframe')
  assert.notEqual(frameAfter.key, frameBefore.key)
  assert.equal(frameAfter.props.src, '/?case=demo&embed=1')
})
