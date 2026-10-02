import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => mocks[name] ?? require(name), module, module.exports)
  return module.exports
}
const helpers = load('../lib/impact-examples.ts')
const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

test('selection validation and stable case links', () => {
  assert(helpers.validExampleSelection({ featured: id, anatomy: null, classification: other }))
  for (const invalid of [null, [], {}, { featured: 'bad', anatomy: null, classification: null }, { ...helpers.EMPTY_EXAMPLES, extra: id }]) {
    assert.equal(helpers.validExampleSelection(invalid), false)
  }
  const link = new URL(helpers.exampleCaseHref({ id, case_date: '2026-05-14', level: 'attending' }), 'https://example.test')
  assert.equal(link.searchParams.get('case'), id)
  assert.equal(link.searchParams.get('level'), 'attending')
  assert.equal(link.searchParams.get('date'), '2026-05-14')
})

test('save without sign-in rejects invalid cases and persists every slot', async () => {
  let saved = null
  const db = { from(table) {
    if (table === 'impact_examples') return { async upsert(rows) { saved = rows; return { error: null } } }
    return { select() { return this }, in(_column, ids) { this.ids = ids; return this }, async lte() { return { data: this.ids.filter(value => value === id).map(id => ({ id })), error: null } } }
  } }
  const route = load('../app/api/impact-examples/route.ts', {
    '@/lib/impact-examples': helpers,
    '@/lib/impact-examples-server': { IMPACT_EXAMPLES_TAG: 'impact-examples' },
    'next/cache': { revalidateTag: () => {} },
    '@/lib/utils': { todayISO: () => '2026-09-27' },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  const save = body => route.POST(new Request('https://example.test/api/impact-examples', { method: 'POST', body: JSON.stringify(body) }))
    assert.equal(saved, null)
    assert.equal((await save({ action: 'save', selection: {} })).status, 400)
    assert.equal((await save({ action: 'save', selection: { featured: id, anatomy: id, classification: null } })).status, 400)
    assert.equal((await save({ action: 'save', selection: { featured: other, anatomy: null, classification: null } })).status, 400)
    assert.equal((await save({ action: 'save', selection: { featured: id, anatomy: null, classification: null } })).status, 200)
    assert.deepEqual(saved, [{ slot: 'featured', case_id: id }, { slot: 'anatomy', case_id: null }, { slot: 'classification', case_id: null }])
})

test('server snapshot contains the saved selection and only published example cases', async () => {
  const db = { from(table) {
    if (table === 'impact_examples') return { select: async () => ({ data: [{ slot: 'featured', case_id: id }, { slot: 'anatomy', case_id: other }], error: null }) }
    return { select() { return this }, in() { return this }, async lte(_field, date) {
      assert.equal(date, '2026-10-02')
      return { data: [{ id, case_date: '2026-09-03', level: 'med_student', category: 'Trauma', prompt: 'Example' }], error: null }
    } }
  } }
  const server = load('../lib/impact-examples-server.ts', {
    'next/cache': { unstable_cache: fn => fn },
    '@/lib/impact-examples': helpers,
    '@/lib/utils': { todayISO: () => '2026-10-02' },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  const snapshot = await server.getCachedImpactExamples()
  assert.equal(snapshot.selection.featured, id)
  assert.equal(snapshot.selection.anatomy, null)
  assert.equal(snapshot.cases.length, 1)
})

test('examples render with the page and opened players survive collapse and reopen', () => {
  const state = [], effects = []
  let cursor = 0
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
    },
    useEffect(fn) { effects.push(fn) },
  }
  const code = ts.transpileModule(readFileSync(new URL('../components/ImpactExamples.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/components/EmbeddedCasePlayer': { EmbeddedCasePlayer: 'player' },
    '@/components/ImpactCasePicker': { ImpactCasePicker: 'picker' },
    '@/lib/impact-examples': helpers,
  }
  new Function('require', 'module', 'exports', code)(name => mocks[name], module, module.exports)
  const initialExamples = { selection: { featured: id, anatomy: null, classification: null }, cases: [{ id, case_date: '2026-09-03', level: 'med_student', category: 'Trauma' }] }
  const render = () => {
    cursor = 0
    const tree = module.exports.ImpactExamples({ initialExamples })
    // No client fetch should run for a server-provided snapshot.
    while (effects.length) assert.equal(effects.shift()(), undefined)
    return tree
  }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean)
    if (predicate(node)) return node
    return find(node.props?.children, predicate)
  }
  let tree = render()
  assert.equal(tree.type, 'section')
  const toggle = () => find(tree, node => node.props?.id === 'example-toggle-featured').props.onClick()
  assert.equal(find(tree, node => node.type === 'player'), undefined)
  toggle(); tree = render()
  assert.ok(find(tree, node => node.type === 'player'))
  toggle(); tree = render()
  assert.equal(find(tree, node => node.props?.role === 'region').props.hidden, true)
  assert.ok(find(tree, node => node.type === 'player'))
  toggle(); tree = render()
  assert.equal(find(tree, node => node.props?.role === 'region').props.hidden, false)
  assert.ok(find(tree, node => node.type === 'player'))
})
