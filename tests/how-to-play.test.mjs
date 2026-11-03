import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const exports = {}
const source = readFileSync(new URL('../components/HowToPlayDialog.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function('require', 'exports', code)(require, exports)
const html = renderToStaticMarkup(createElement(exports.HowToPlayDialog, { onDismiss() {} }))

test('initial how-to screen is limited to three short instructions and one primary action', () => {
  const initial = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '')
  const words = initial.replace(/<[^>]*>/g, ' ').trim().split(/\s+/)
  assert.ok(words.length <= 45, `Expected short introduction, got ${words.length} words`)
  assert.equal((initial.match(/<li\b/g) || []).length, 3)
  assert.match(initial, /Up to 6 guesses/)
  assert.match(initial, /Search for a diagnosis, select it, and guess/)
  assert.match(initial, /Each wrong guess reveals a new clue/)
  assert.match(initial, /Let’s play/)
  assert.doesNotMatch(html, /Archives|Groups|Welcome to Orthodle/)
})

test('quiz details stay collapsed but preserve the single-submission and multi-select guidance', () => {
  assert.match(html, /<details\s+class=/)
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[=\s>])/)
  assert.match(html, /<summary[^>]*>Quiz questions<\/summary>/)
  assert.match(html, /one submission/)
  assert.match(html, /select all that apply before submitting/)
})

test('shorter intro retains dialog labeling, Escape dismissal, close button and initial action focus', () => {
  assert.match(html, /aria-labelledby="how-to-title"/)
  assert.match(html, /aria-describedby="how-to-description"/)
  assert.match(html, /aria-label="Close how to play"/)
  assert.match(source, /onCancel=\{event => \{ event.preventDefault\(\); onDismiss\(\) \}\}/)
  assert.match(source, /autoFocus onClick=\{onDismiss\}/)
  assert.match(source, /document.body.style.overflow = previousOverflow/)
})
