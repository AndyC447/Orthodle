import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', ...Object.keys(globals), code)(
    exports, name => imports[name], ...Object.values(globals),
  )
  return exports
}

test('the shared archive catalog walks all pages and strips fields that the list never renders', async () => {
  const calls = []
  const newestDay = new Date().toISOString().slice(0, 10)
  const data = Array.from({ length: 501 }, (_, index) => ({
    id: String(index), case_date: '2026-10-01', level: 'med_student', answer: 'Fracture',
    category: 'Hand', synonyms: ['metadata'], clue_1: 'A clue', image_url: 'unused',
  }))
  const sourceTables = {
    cases: data,
    level_display_settings: [{ level: 'med_student', title: 'Daily Case' }],
    play_mode_settings: { no_anatomy_mode: true },
  }
  const cache = new Map()
  const route = load('../app/api/archive-catalog/route.ts', {
    'next/cache': { unstable_cache: callback => day => {
      if (!cache.has(day)) cache.set(day, callback(day))
      return cache.get(day)
    } },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/admin-dashboard': load('../lib/admin-dashboard.ts'),
    '@/lib/anatomy-quiz': { isAnatomyQuizCaseRecord: () => false, isChoiceQuestionCase: () => false },
    '@/lib/case-category': { normalizeCaseCategory: category => category },
    '@/lib/level-display': { normalizeLevelTitles: titles => titles },
    '@/lib/supabase': { supabase: { from(table) {
      calls.push(table)
      return {
        select() { return this }, eq() { return this }, gte() { return this }, order() { return this },
        lt(column, day) { assert.deepEqual([column, day], ['case_date', newestDay]); return this },
        async range(from, to) { return { data: sourceTables[table].slice(from, to + 1) } },
        async maybeSingle() { return { data: sourceTables[table] } },
        then(resolve) { resolve({ data: sourceTables[table] }) },
      }
    } } },
  })
  assert.equal((await route.GET(new Request('https://orthodle.com/api/archive-catalog?day=2999-01-01'))).status, 400)
  assert.deepEqual(calls, [])
  const request = new Request(`https://orthodle.com/api/archive-catalog?day=${newestDay}`)
  const result = await route.GET(request)
  assert.equal(result.status, 200)
  const snapshot = await result.json()
  assert.equal(snapshot.cases.length, 501)
  assert.deepEqual(snapshot.cases[0], {
    id: '0', case_date: '2026-10-01', level: 'med_student', answer: 'Fracture', category: 'Hand',
    isAnatomy: false, isChoice: false,
  })
  await route.GET(request)
  assert.deepEqual(calls.sort(), ['cases', 'cases', 'level_display_settings', 'play_mode_settings'].sort())
})

test('archive previews and the visible page share the in-flight catalog request', async () => {
  const calls = []
  const catalog = load('../lib/archive-catalog.ts', {}, {
    fetch: async url => { calls.push(url); return Response.json({ cases: [] }) },
  })
  const first = catalog.loadArchiveCatalog('2026-11-14')
  assert.equal(first, catalog.loadArchiveCatalog('2026-11-14'))
  await first
  await catalog.loadArchiveCatalog('2026-11-14')
  await catalog.loadArchiveCatalog('2026-11-15')
  assert.deepEqual(calls, ['/api/archive-catalog?day=2026-11-14', '/api/archive-catalog?day=2026-11-15'])
})

test('the play bootstrap sends canonical diagnoses, excluding quiz-only answers and raw case content', async () => {
  const rows = {
    cases: [
      { answer: 'Daily diagnosis', level: 'med_student', case_date: '2026-11-14', synonyms: ['case-specific alias'] },
      { answer: 'Quiz answer', level: 'med_student', case_date: '2026-11-12', isQuiz: true },
      { answer: 'Legacy anatomy answer', level: 'attending', case_date: '2026-10-01' },
      { answer: 'Both', level: 'med_student', case_date: '2026-11-10', isQuiz: true },
      { answer: 'Both', level: 'med_student', case_date: '2026-11-08' },
    ],
    diagnosis_choices: [
      { label: 'Quiz answer' }, { label: 'Legacy anatomy answer' }, { label: 'Custom diagnosis' },
    ],
    difficulty_taglines: [{ level: 'med_student', text: 'Newest' }, { level: 'med_student', text: 'Old' }],
    level_display_settings: [{ level: 'med_student', title: 'Daily Case' }],
  }
  const route = load('../app/api/play-bootstrap/route.ts', {
    'next/cache': { unstable_cache: fn => fn },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/admin-dashboard': load('../lib/admin-dashboard.ts'),
    '@/lib/anatomy-quiz': { isChoiceQuestionCase: row => row.isQuiz === true },
    '@/lib/utils': { normalizeAnswer: label => label.toLowerCase(), ORTHO_DIAGNOSIS_BANK: ['Built-in'] },
    '@/lib/supabase': { supabase: { from(table) {
      return {
        select() { return this }, lte() { return this }, order() { return this },
        async range(from, to) { return { data: rows[table].slice(from, to + 1) } },
        then(resolve) { resolve({ data: rows[table] }) },
      }
    } } },
  })
  assert.deepEqual(await (await route.GET()).json(), {
    answerOptions: ['Both', 'Built-in', 'Custom diagnosis', 'Daily diagnosis'],
    taglineByLevel: { med_student: 'NEWEST' },
    titleByLevel: { med_student: 'Daily Case' },
  })
})

test('background previews do not refresh ERAS stats or download personal archive guesses', () => {
  assert.match(source('../components/PublicImpactPage.tsx'), /useImpactStats\(!isPreview\)/)
  assert.match(source('../app/archive/page.tsx'), /isPreview \? \[\] : \(async/)
})

test('players restore only their guesses and request the shared case summary after finishing', () => {
  const player = source('../app/page.tsx')
  assert.match(player, /const statsCaseId = roundComplete && !isAdminPreview && !isEmbeddedExample/)
  assert.match(player, /from\('guesses'\)\s*\.select\('is_correct, guess_text'\)\s*\.eq\('case_id', data.id\)\s*\.eq\('session_id', sessionId\)/)
  assert.doesNotMatch(player, /refreshCommunityStats|from\('visits'\)/)
})

test('case summaries preserve the solve rate, first-try rate and common misses without raw player data', () => {
  const { buildCommunityStats } = load('../lib/community-case-stats.ts', {
    './anatomy-quiz': { isChoiceQuestionCase: () => false },
    './stats-exclusions': { filterExcludedSessionRows: (rows, excluded) => rows.filter(row => !excluded.has(row.session_id)) },
    './utils': { isAcceptedGuess: (guess, accepted) => accepted.includes(guess) },
  })
  assert.deepEqual(buildCommunityStats({ answer: 'Right' }, [{ session_id: 'visitor' }], [
    { session_id: 'one', is_correct: false, guess_text: 'Wrong' },
    { session_id: 'one', is_correct: true, guess_text: 'Right' },
    { session_id: 'two', is_correct: true, guess_text: 'Right' },
    { session_id: 'excluded', is_correct: false, guess_text: 'Ignored' },
  ], ['excluded']), {
    solveRate: 2 / 3 * 100,
    averageGuessesToSolve: 1.5,
    firstTrySolveRate: 50,
    mostCommonIncorrectGuess: 'Wrong',
    anatomyChoiceBreakdown: [],
  })
})
