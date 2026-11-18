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

const { GuessHistory } = load('../components/GuessHistory.tsx')
const render = guesses => renderToStaticMarkup(React.createElement(GuessHistory, { guesses }))

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

test('guess history stays visible for diagnosis rounds after reveal and is not rendered for choice questions', () => {
  const player = read('../app/page.tsx')
  assert.match(player, /const isSurgicalAnatomyMode =\s*isChoiceQuestionCase\(dailyCase\)/)
  assert.match(player, /\{dailyCase && !isSurgicalAnatomyMode && \(\s*<GuessHistory guesses=\{guesses\} \/>\s*\)\}\s*\{!roundComplete && !isSurgicalAnatomyMode/)
  assert.doesNotMatch(read('../components/GuessHistory.tsx'), /fetch\(|supabase|localStorage/)
})
