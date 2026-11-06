import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function load(path, imports = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', code)(name => imports[name] || require(name), module, module.exports)
  return module.exports
}
const utils = load('../lib/utils.ts', { '@/lib/level-display': {} })
const types = load('../lib/question-type.ts')
const quiz = load('../lib/anatomy-quiz.ts', { '@/lib/utils': utils, './question-type': types })
const autocomplete = load('../lib/diagnosis-autocomplete.ts', { './utils': utils, './anatomy-quiz': quiz })
const { DraftAnswerChoices } = load('../components/DraftAnswerChoices.tsx', { '@/lib/diagnosis-autocomplete': autocomplete })

test('the unsaved answer and every plain synonym are immediately visible, selectable and deduplicated', () => {
  let selected
  const props = { answer: 'Lumbar compression fracture', synonyms: ['L3 Compression fracture', 'L3 compression fracture', '__question_type__:diagnosis', '__multi_select__:A'], onSelect: label => { selected = label } }
  const html = renderToStaticMarkup(React.createElement(DraftAnswerChoices, props))
  assert.match(html, /Draft answer &amp; synonyms/)
  assert.match(html, /Lumbar compression fracture/)
  assert.match(html, /L3 Compression fracture/)
  assert.equal((html.match(/<button/g) || []).length, 2)
  assert.doesNotMatch(html, /__question_type__|__multi_select__/)
  const buttons = DraftAnswerChoices(props).props.children[1].props.children
  buttons[1].props.onClick()
  assert.equal(selected, 'L3 Compression fracture')
  assert.ok(utils.isAcceptedGuess(selected, [props.answer, ...quiz.extractPlainSynonyms(props.synonyms)]))
})

test('editing or clearing a draft replaces its labels without retaining the previous preview choices', () => {
  const render = (answer, synonyms) => renderToStaticMarkup(React.createElement(DraftAnswerChoices, { answer, synonyms, onSelect: () => {} }))
  assert.match(render('Lumbar compression fracture', ['L3 Compression fracture']), /L3 Compression fracture/)
  const updated = render('Scaphoid fracture', ['Scaphoid waist fracture'])
  assert.match(updated, /Scaphoid waist fracture/)
  assert.doesNotMatch(updated, /L3|Lumbar/)
  assert.equal(render('', []), '')
})

test('the real builder hands its current unsaved answer and synonyms to the preview without database writes', () => {
  const source = read('../app/admin/page.tsx')
  const ast = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const functions = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ['buildPreviewCase', 'openCasePreview'].includes(node.name?.text)) functions.push(node.getText(ast))
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.equal(functions.length, 2)
  const state = Object.fromEntries(['category', 'prompt', 'imageUrl', 'imageUrl2', 'imageCredit', 'imageCredit2', 'imageFindings', 'clue1', 'clue2', 'clue3', 'clue4', 'clue5', 'clue6', 'teachingPoint', 'referenceLinks', 'learningImageUrl', 'learningImageCredit', 'learningImageCaption', 'learningImageUrl2', 'learningImageCredit2', 'learningImageCaption2'].map(key => [key, '']))
  const local = new Map(), session = new Map(), opened = []
  const context = vm.createContext({
    ...state, level: 'med_student', caseDate: '2026-12-01', answer: 'Brand new unsaved answer', synonyms: 'New draft alias, Another draft alias',
    answerSpecificity: 'off', imageRevealClue: 'none', imageRevealClue2: 'none', isChoiceQuestion: false, questionType: 'diagnosis',
    gptDraftProvenance: null, normalizedAnatomyCorrectChoices: [], ...types, ...quiz,
    draftSynonyms: (_provenance, value) => value.split(',').map(label => label.trim()).filter(Boolean),
    normalizeCreditValue: value => value || null, mergeTeachingPointAndReferences: value => value,
    ADMIN_CASE_PREVIEW_CACHE_KEY: 'preview',
    window: { localStorage: { setItem: (key, value) => local.set(key, value) }, sessionStorage: { setItem: (key, value) => session.set(key, value) }, open: (...args) => opened.push(args) },
    supabase: { from: () => assert.fail('Opening a preview must not query or write the case database') },
  })
  vm.runInContext(ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  context.openCasePreview()
  const first = JSON.parse(local.get('preview'))
  assert.equal(first.case.answer, 'Brand new unsaved answer')
  assert.deepEqual(quiz.extractPlainSynonyms(first.case.synonyms), ['New draft alias', 'Another draft alias'])
  assert.equal(session.get('preview'), local.get('preview'))
  assert.match(opened[0][0], /preview=1/)
  context.answer = 'Updated unsaved answer'
  context.synonyms = 'Updated draft alias'
  context.openCasePreview()
  const updated = JSON.parse(local.get('preview'))
  assert.deepEqual(autocomplete.getDiagnosisAutocompleteLabels(updated.case.answer, updated.case.synonyms), ['Updated unsaved answer', 'Updated draft alias'])
})

test('the accepted-label list is preview-only, stays out of quizzes, and uses the same draft as autocomplete', () => {
  const source = read('../app/page.tsx')
  assert.match(source, /isAdminPreview && dailyCase && \(\s*<DraftAnswerChoices answer=\{dailyCase.answer\} synonyms=\{dailyCase.synonyms\} onSelect=\{selectSuggestion\}/)
  const block = source.slice(source.indexOf('{!roundComplete && !isSurgicalAnatomyMode && ('), source.indexOf('<input', source.indexOf('{!roundComplete && !isSurgicalAnatomyMode && (')))
  assert.match(block, /DraftAnswerChoices/)
  assert.match(source, /getDiagnosisAutocompleteLabels\(dailyCase.answer, dailyCase.synonyms, answerOptions\)/)
  assert.match(source, /if \(previewCase\) \{\s*data = previewCase/)
  assert.match(source, /if \(event.key !== ADMIN_CASE_PREVIEW_CACHE_KEY\) return\s*setAdminPreviewRefreshTick/)
})
