import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function load(path, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(name => imports[name], exports)
  return exports
}
const utils = load('../lib/utils.ts')
const types = load('../lib/question-type.ts')
const quiz = load('../lib/anatomy-quiz.ts', { './question-type': types, '@/lib/utils': utils })
const { getDiagnosisAutocompleteLabels } = load('../lib/diagnosis-autocomplete.ts', { './utils': utils, './anatomy-quiz': quiz })

test('accepted synonyms are selectable labels rather than silently accepted inputs', () => {
  const synonyms = ['Thumb UCL Injury', "Skier's thumb"]
  const labels = getDiagnosisAutocompleteLabels('Stener lesion', synonyms)
  for (const query of ['thumb ucl', 'skier', 'stener']) {
    const options = labels.filter(label => utils.normalizeAnswer(label).includes(utils.normalizeAnswer(query)))
    assert.ok(options.length > 0)
    assert.ok(options.every(label => utils.isAcceptedGuess(label, ['Stener lesion', ...synonyms])))
  }
  assert.ok(labels.includes('Thumb UCL Injury'))
})

test('metadata, empty entries, and duplicate synonyms do not become player choices', () => {
  const synonyms = ['stener lesion', ' Thumb UCL Injury ', 'thumb ucl injury', '', '__multi_select__:A|B', ...types.withQuestionType([], 'diagnosis')]
  const original = [...synonyms]
  assert.deepEqual(getDiagnosisAutocompleteLabels('Stener lesion', synonyms), ['Stener lesion', 'Thumb UCL Injury'])
  assert.deepEqual(synonyms, original)
  assert.deepEqual(getDiagnosisAutocompleteLabels('Stener lesion', null), ['Stener lesion'])
})

test('L3 compression fracture is a selectable accepted synonym only for its own lumbar case', () => {
  const shared = ['Lumbar compression fracture', 'Scaphoid fracture']
  const lumbar = getDiagnosisAutocompleteLabels('Lumbar compression fracture', ['L3 Compression fracture'], shared)
  const wrist = getDiagnosisAutocompleteLabels('Scaphoid fracture', ['Scaphoid waist fracture'], shared)
  for (const query of ['L3', 'L3 Compression', 'L3 Compression fracture']) {
    const match = lumbar.filter(label => utils.normalizeAnswer(label).includes(utils.normalizeAnswer(query)))
    assert.deepEqual(match, ['L3 Compression fracture'])
    assert.ok(match.every(label => utils.isAcceptedGuess(label, ['Lumbar compression fracture', 'L3 Compression fracture'])))
    assert.equal(wrist.some(label => utils.normalizeAnswer(label).includes('l3')), false)
  }
  assert.ok(wrist.includes('Lumbar compression fracture'))
  assert.ok(wrist.includes('Scaphoid waist fracture'))
  assert.ok(!lumbar.includes('Scaphoid waist fracture'))
  assert.deepEqual(shared, ['Lumbar compression fracture', 'Scaphoid fracture'])
})

test('changing cases, clearing the case or editing synonyms never retains the previous case aliases', () => {
  const shared = ['Lumbar compression fracture', 'Stener lesion']
  const first = getDiagnosisAutocompleteLabels('Lumbar compression fracture', ['L3 Compression fracture'], shared)
  const second = getDiagnosisAutocompleteLabels('Lumbar compression fracture', ['L1 Compression fracture'], shared)
  const stener = getDiagnosisAutocompleteLabels('Stener lesion', ['Thumb UCL Injury'], shared)
  const cleared = getDiagnosisAutocompleteLabels(undefined, undefined, shared)
  assert.ok(first.includes('L3 Compression fracture'))
  for (const options of [second, stener, cleared]) assert.ok(!options.includes('L3 Compression fracture'))
  assert.ok(second.includes('L1 Compression fracture'))
  assert.ok(stener.includes('Thumb UCL Injury'))
  assert.deepEqual(cleared, shared)
})

test('shared choices remain deduplicated and a canonical answer used elsewhere stays globally available', () => {
  const shared = ['Stener lesion', 'Thumb UCL Injury', 'Thumb UCL injury']
  assert.deepEqual(getDiagnosisAutocompleteLabels('Stener lesion', ['thumb ucl injury', '__multi_select__:A|B', '__question_type__:diagnosis'], shared), ['Stener lesion', 'Thumb UCL Injury'])
  assert.deepEqual(shared, ['Stener lesion', 'Thumb UCL Injury', 'Thumb UCL injury'])
})

test('the player builds shared choices from main answers, merges only the active diagnosis case and invalidates old caches', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /PLAY_BOOTSTRAP_CACHE_KEY = 'orthodle_play_bootstrap_v6'/)
  const shared = source.slice(source.indexOf('const diagnosisCaseAnswers ='), source.indexOf('const anatomyOnlyAnswerSet ='))
  assert.match(shared, /\.map\(item => item.answer!\.trim\(\)\)/)
  assert.doesNotMatch(shared, /flatMap|getDiagnosisAutocompleteLabels/)
  const filter = source.slice(source.indexOf('const filteredAnswerOptions ='), source.indexOf('if (!showSuggestions)', source.indexOf('const filteredAnswerOptions =')))
  assert.match(filter, /dailyCase && !isChoiceQuestionCase\(dailyCase\)/)
  assert.match(filter, /getDiagnosisAutocompleteLabels\(dailyCase.answer, dailyCase.synonyms, answerOptions\)/)
  assert.match(filter, /\[answerOptions, dailyCase, guess\]/)
  assert.match(filter, /const startsWith = caseOptions.filter/)
  assert.match(filter, /const includes = caseOptions.filter/)
})
