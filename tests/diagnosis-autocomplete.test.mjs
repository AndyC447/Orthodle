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
