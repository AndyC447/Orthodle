import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'

const css = postcss.parse(readFileSync(new URL('../app/bone-arcade.css', import.meta.url), 'utf8'))
const scope = ':root[data-arcade="on"] .bone-arcade[data-arcade-surface]'
const choice = `${scope} .orthodle-anatomy-choice`
const selected = `${choice}[aria-pressed="true"]:not(:disabled)`
const rule = selector => {
  const matches = []
  css.walkRules(item => { if (item.selectors.includes(selector)) matches.push(item) })
  assert.ok(matches.length, `Missing ${selector}`)
  return matches.at(-1)
}
const declaration = (selector, property) => rule(selector).nodes.find(item => item.prop === property)
const value = (selector, property) => declaration(selector, property)?.value
const color = variable => value(`${scope}`, variable)
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
const contrast = (one, two) => {
  const a = luminance(one), b = luminance(two)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test('the diagnosis suggestions ID cannot raise the specificity of every quiz choice', () => {
  assert.equal(value(choice, 'background'), 'var(--arcade-panel)')
  assert.equal(value(`${scope} #diagnosis-suggestions`, 'background'), 'var(--arcade-panel)')
  css.walkRules(item => {
    for (const selector of item.selectors) {
      assert.ok(!(selector.includes('.orthodle-anatomy-choice') && selector.includes('#diagnosis-suggestions')))
    }
  })
})

test('selected choices and their letter badges use contrasting mint and navy instead of the idle palette', () => {
  assert.equal(value(selected, 'background'), 'var(--arcade-mint)')
  assert.equal(value(selected, 'color'), 'var(--arcade-navy)')
  assert.equal(declaration(selected, 'background').important, true)
  assert.equal(declaration(selected, 'color').important, true)
  assert.equal(value(`${selected} .orthodle-anatomy-choice-badge`, 'background'), 'var(--arcade-navy)')
  assert.equal(value(`${selected} .orthodle-anatomy-choice-badge`, 'color'), 'var(--arcade-mint)')
  assert.equal(value(`${selected} .orthodle-anatomy-choice-label *`, 'color'), 'var(--arcade-navy)')
  assert.ok(contrast(color('--arcade-mint'), color('--arcade-navy')) >= 4.5)
  assert.ok(contrast(color('--arcade-mint'), color('--arcade-panel')) >= 3)
})

test('selected styling excludes submitted choices and does not mask correct or incorrect borders', () => {
  assert.equal(value(`${scope} .orthodle-anatomy-choice-correct`, 'border-color'), 'var(--arcade-mint)')
  assert.equal(value(`${scope} .orthodle-anatomy-choice-incorrect`, 'border-color'), '#ff947f')
  assert.ok(rule(selected).selector.includes(':not(:disabled)'))
})

test('a checkmark makes selection visible without relying on color, while regular theme stays unchanged', () => {
  assert.equal(value(`${scope} .orthodle-anatomy-choice-check`, 'display'), 'block')
  assert.equal(value(`${scope} .orthodle-anatomy-choice-check`, 'opacity'), '0')
  assert.equal(value(`${choice}[aria-pressed="true"] .orthodle-anatomy-choice-check`, 'opacity'), '1')
  const player = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(player, /aria-pressed=\{isChosenChoice\}/)
  assert.match(player, /<Check className="orthodle-anatomy-choice-check[^\n]*aria-hidden="true"/)
  const regular = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(regular, /\.orthodle-anatomy-choice-check \{ display: none; \}/)
})
