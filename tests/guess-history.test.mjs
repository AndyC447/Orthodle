import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

function load(path, imports = {}) {
  const exports = {}
  const source = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', source)(name => imports[name] || require(name), exports)
  return exports
}

const quiz = load('../lib/anatomy-quiz.ts', {
  './question-type': load('../lib/question-type.ts'),
  '@/lib/utils': { normalizeAnswer: value => value.trim().toLowerCase() },
})
const { GuessHistory } = load('../components/GuessHistory.tsx', { '@/lib/anatomy-quiz': quiz })
const render = (guesses, quizChoices) => renderToStaticMarkup(React.createElement(GuessHistory, { guesses, quizChoices }))

test('the history takes up no room before the first attempt and keeps submitted guesses in order', () => {
  assert.equal(render([]), '')
  const html = render([
    { text: 'Wrist sprain', correct: false },
    { text: '   ', correct: false },
    { text: 'Smith fracture', correct: true },
  ])
  assert.match(html, /aria-label="Your guesses"/)
  assert.match(html, /Guess 1, incorrect: .*Wrist sprain.*Guess 2: .*Skipped.*Guess 3, correct: .*Smith fracture/)
  assert.equal((html.match(/<li /g) || []).length, 3)
  assert.match(html, /data-status="incorrect".*data-status="skipped".*data-status="correct"/)
})

test('quiz history shows all submitted choice labels without including unchosen answers', () => {
  for (const text of ['A, C', 'A|C']) {
    const html = render([{ text, correct: false }], ['A. Medial nerve', 'B) Lateral nerve', 'C: Deep nerve'])
    assert.match(html, /Medial nerve; Deep nerve/)
    assert.doesNotMatch(html, /Lateral nerve|>A[,|] C?</)
  }
})

test('history follows the existing round state before and after reveal instead of fetching guesses', () => {
  const player = read('../app/page.tsx')
  assert.match(player, /\{dailyCase && \(\s*<GuessHistory guesses=\{guesses\}[^>]+\/>\s*\)\}\s*\{!roundComplete && !isSurgicalAnatomyMode/)
  assert.doesNotMatch(read('../components/GuessHistory.tsx'), /fetch\(|supabase|localStorage/)
})
