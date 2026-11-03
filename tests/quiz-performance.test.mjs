import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function stats(results = []) {
  const storage = new Map([['orthodle_stats_v1', JSON.stringify({ results })]])
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../lib/utils.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'window', 'require', code)(exports, { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } }, name => {
    assert.equal(name, '@/lib/level-display')
    return { readCachedLevelTitles: () => ({ med_student: 'Daily Case', resident: 'Resident', attending: 'Anatomy Quiz' }) }
  })
  return exports
}
const result = (date, questionType, won, extras = {}) => ({
  key: `${date}:med_student:daily`, caseDate: date, level: 'med_student', isArchive: false,
  won, guessesUsed: 1, answer: 'Answer', category: 'Trauma', completedAt: `${date}T12:00:00Z`,
  ...(questionType ? { questionType } : {}), ...extras,
})

test('daily-slot anatomy and classification have separate accuracy, correct, and missed counts', () => {
  const api = stats([
    result('2026-10-01', 'anatomy', true), result('2026-10-02', 'anatomy', false),
    result('2026-10-03', 'classification', true), result('2026-10-04', 'classification', false), result('2026-10-05', 'classification', true),
    result('2026-10-06', 'diagnosis', true, { guessesUsed: 3 }),
    result('2026-09-01', 'classification', false, { isArchive: true }),
  ])
  const summary = api.getStatsSummary()
  assert.deepEqual([summary.anatomy.played, summary.anatomy.wins, summary.anatomy.losses, summary.anatomy.winRate], [2, 1, 1, 50])
  assert.deepEqual([summary.classification.played, summary.classification.wins, summary.classification.losses], [3, 2, 1])
  assert.equal(Math.round(summary.classification.winRate), 67)
  assert.equal(summary.guessDistribution[1], 0)
  assert.equal(summary.guessDistribution[3], 1)
  assert.equal(summary.averageGuessesInWins, 3)
})

test('older saved results are backfilled only when date, slot, and answer match', () => {
  const api = stats([result('2026-10-01', null, true), result('2026-10-02', null, false)])
  assert.equal(api.backfillGameResultTypes([
    { caseDate: '2026-10-01', level: 'med_student', answer: 'Answer', questionType: 'classification' },
    { caseDate: '2026-10-02', level: 'med_student', answer: 'Replaced case', questionType: 'anatomy' },
  ]), true)
  assert.equal(api.getStatsSummary().classification.wins, 1)
  assert.equal(api.getUnclassifiedGameResults().length, 1)
  assert.equal(api.backfillGameResultTypes([{ caseDate: '2026-10-01', level: 'med_student', answer: 'Answer', questionType: 'anatomy' }]), false)
})

test('legacy anatomy-slot results retain their existing stats until their type is known', () => {
  const api = stats([result('2026-06-01', null, false, { level: 'attending' })])
  assert.equal(api.getStatsSummary().anatomy.losses, 1)
  assert.equal(api.getStatsSummary().classification.played, 0)
})

test('recording a quiz stores its type without creating a duplicate completed game', () => {
  const api = stats([result('2026-10-01', null, true)])
  api.recordGameResult(result('2026-10-01', 'classification', true))
  const summary = api.getStatsSummary()
  assert.equal(summary.gamesPlayed, 1)
  assert.equal(summary.classification.wins, 1)
  assert.equal(summary.guessDistribution[1], 0)
})
