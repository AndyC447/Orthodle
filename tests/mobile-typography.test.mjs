import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const css = postcss.parse(read('../app/globals.css'))

function sharedRule(selector) {
  let result
  css.walkRules(selector, rule => { result = rule })
  assert.ok(result, `Missing ${selector}`)
  assert.equal(result.parent.name, 'media')
  assert.equal(result.parent.params, '(max-width: 639px)')
  return Object.fromEntries(result.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
}

test('public typography follows a shared scale only on mobile', () => {
  assert.equal(sharedRule('.public-page-title')['font-size'], '22px')
  assert.equal(sharedRule('.public-section-title')['font-size'], '18px')
  assert.equal(sharedRule('.public-body')['font-size'], '13px')
  assert.equal(sharedRule('.public-label')['font-size'], '11px')
  assert.equal(sharedRule('.public-page-shell')['padding-inline'], '16px')
  assert.equal(sharedRule('.public-card').padding, '12px')
  assert.equal(sharedRule('.public-section')['margin-top'], '16px')
})

test('compact mobile controls retain touch size and prevent input auto-zoom', () => {
  assert.equal(sharedRule('.public-action')['min-height'], '44px')
  assert.equal(sharedRule('.public-page-shell :is(input, select, textarea)')['font-size'], '16px')
})

test('public pages use shared mobile spacing without changing the case player', () => {
  for (const file of ['archive', 'groups', 'stats', 'about', 'submit']) {
    const source = read(`../app/${file}/page.tsx`)
    assert.ok(source.includes('public-page-shell'), file)
    assert.ok(source.includes('public-page-title'), file)
  }
  assert.ok(read('../components/PublicImpactPage.tsx').includes('public-body'))
  assert.ok(!read('../app/page.tsx').includes('public-page-shell'))
})
