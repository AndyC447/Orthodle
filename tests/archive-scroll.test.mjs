import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function harness(saved, { preview = false, loaded = false } = {}) {
  const slots = [], layout = [], scrolls = []
  const storage = new Map(saved === undefined ? [] : [['orthodle_archive_view_v1', typeof saved === 'string' ? saved : JSON.stringify(saved)]])
  const sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  const window = { scrollY: 490, scrollTo: value => scrolls.push(value), sessionStorage }
  const cases = [{ id: 'older', case_date: '2026-10-12', level: 'med_student', answer: 'Example answer', category: 'Sports' }]
  if (loaded) { slots[1] = cases; slots[2] = false }
  const titles = { med_student: 'Daily Case', resident: 'Resident', attending: 'Anatomy Quiz' }
  let cursor = 0
  const exports = {}
  const imports = {
    react: {
      useState(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value }] },
      useMemo: callback => callback(), useEffect() {}, useLayoutEffect: callback => layout.push(callback),
    },
    'react/jsx-runtime': { jsx: (tag, props) => ({ tag, props }), jsxs: (tag, props) => ({ tag, props }) },
    'next/link': { default: 'a' },
    '@/lib/case-category': { normalizeCaseCategory: value => value },
    '@/lib/archive-publication': { isPublicArchiveCase: () => true },
    '@/components/Header': { Header: 'header' }, '@/components/PublicFooter': { PublicFooter: 'footer' },
    '@/components/SectionNavigation': { SectionNavigation: 'nav', SectionSwipeContent: 'div' },
    '@/components/SectionPreviewContext': { useSectionPreview: () => preview },
    '@/lib/anatomy-quiz': { isAnatomyQuizCaseRecord: () => false, isChoiceQuestionCase: () => false },
    '@/lib/level-display': { DEFAULT_LEVEL_TITLES: titles },
    '@/lib/supabase': {},
    '@/lib/utils': { getSessionId: () => 'test-browser', todayISO: () => '2026-11-05' },
  }
  const source = ts.transpileModule(readFileSync(new URL('../app/archive/page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', 'window', 'sessionStorage', source)(name => imports[name], exports, window, sessionStorage)
  const render = () => { cursor = 0; layout.length = 0; return exports.default() }
  const mount = () => { render(); [...layout].forEach(callback => callback()); return render() }
  return {
    mount, render, slots, scrolls, storage,
    finishLoading() { slots[1] = cases; slots[2] = false; return mount() },
  }
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}

const previousView = { month: '2026-10', selectedDate: '2026-10-12', selectedCategory: 'Sports', answerQuery: 'sports', showOlderBonus: true, scrollY: 490 }

test('an old saved scroll position never moves the archive on initial entry or after loading finishes', () => {
  const h = harness(previousView)
  h.mount()
  assert.deepEqual(h.scrolls, [])
  h.finishLoading()
  assert.deepEqual(h.scrolls, [])
})

test('cached archives and hidden swipe previews never scroll the main page', () => {
  for (const preview of [false, true]) {
    const h = harness(previousView, { loaded: true, preview })
    h.mount()
    assert.deepEqual(h.scrolls, [])
  }
})

test('month, selected day and filters still restore, and opening a case no longer saves a page offset', () => {
  const h = harness(previousView, { loaded: true })
  const tree = h.mount()
  const all = nodes(tree)
  assert.ok(all.some(node => node.tag === 'input' && node.props.value === 'sports'))
  assert.ok(all.some(node => node.tag === 'select' && node.props.value === 'Sports'))
  assert.ok(all.some(node => node.tag === 'select' && node.props.value === '2026-10'))
  const caseLink = all.find(node => node.props?.href === '/?case=older&date=2026-10-12&level=med_student')
  assert.ok(caseLink)
  caseLink.props.onClick()
  const saved = JSON.parse(h.storage.get('orthodle_archive_view_v1'))
  assert.deepEqual(saved, { month: '2026-10', selectedDate: '2026-10-12', selectedCategory: 'Sports', answerQuery: 'sports', showOlderBonus: true })
  assert.deepEqual(h.scrolls, [])
})

test('missing or malformed saved views open normally without an automatic scroll', () => {
  for (const saved of [undefined, '{broken-json', { month: '1900-01', scrollY: 5000 }]) {
    const h = harness(saved)
    assert.doesNotThrow(() => h.mount())
    assert.deepEqual(h.scrolls, [])
  }
})
