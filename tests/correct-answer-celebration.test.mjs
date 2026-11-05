import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'

const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const css = postcss.parse(source.match(/<style jsx global>\{`([\s\S]*?)`\}<\/style>/)[1])
const glowClasses = source.match(/className="(orthodle-celebration-glow [^"]+)"/)[1]

test('the celebration glow cannot match Arcade gradient-card utility selectors', () => {
  assert.doesNotMatch(glowClasses, /bg-\[/)
  assert.match(glowClasses, /rounded-full/)
  const arcade = postcss.parse(readFileSync(new URL('../app/bone-arcade.css', import.meta.url), 'utf8'))
  arcade.walkRules(rule => {
    if (rule.nodes.some(node => node.prop === 'background' && node.value === 'var(--arcade-panel)')) {
      assert.ok(!rule.selector.includes('.orthodle-celebration-glow'))
    }
  })
})

test('the celebration uses a transparent glow rather than an opaque popup in either theme', () => {
  const rules = []
  css.walkRules('.orthodle-celebration-glow', rule => rules.push(rule))
  assert.equal(rules.length, 1)
  const background = rules[0].nodes.find(node => node.prop === 'background')?.value
  assert.match(background, /^radial-gradient\(/)
  assert.match(background, /rgba\(239, 191, 72, 0\.22\)/)
  assert.match(background, /transparent 72%\)$/)
  const frames = []
  css.walkAtRules('keyframes', rule => {
    if (rule.params === 'orthodle-celebration-glow') frames.push(rule)
  })
  assert.equal(frames.length, 1)
  const finalFrame = frames[0].nodes.find(node => node.selector === '100%')
  assert.equal(finalFrame.nodes.find(node => node.prop === 'opacity').value, '0')
})

test('the win celebration stays decorative and does not intercept image or case interaction', () => {
  assert.match(source, /\{showConfetti && \(\s*<div aria-hidden="true" className="pointer-events-none fixed/)
})
