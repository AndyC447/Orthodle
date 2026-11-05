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
  assert.match(source, /\{showConfetti && \(\s*<div aria-hidden="true" className="orthodle-win-celebration pointer-events-none fixed/)
})

const arcade = postcss.parse(readFileSync(new URL('../app/bone-arcade.css', import.meta.url), 'utf8'))
const scope = ':root[data-arcade="on"] .bone-arcade[data-arcade-surface] .orthodle-win-celebration'
const pixel = `${scope} .orthodle-confetti-piece`
const value = (selector, property) => {
  let result
  arcade.walkRules(selector, rule => { result = rule.nodes.find(node => node.prop === property)?.value || result })
  return result
}

test('only Arcade uses square pixels and two explosion origins instead of regular falling confetti', () => {
  assert.equal(value(pixel, 'border-radius'), '0')
  assert.equal(value(pixel, 'width'), '6px')
  assert.equal(value(pixel, 'height'), '6px')
  assert.equal(value(pixel, 'background'), 'var(--pixel-confetti-color)')
  assert.equal(value(pixel, 'animation-name'), 'orthodle-arcade-confetti-burst')
  assert.equal(value(pixel, 'animation-duration'), '1200ms')
  assert.equal(value(pixel, 'animation-delay'), '0ms')
  assert.equal(value(pixel, 'left'), '32%')
  assert.equal(value(`${pixel}:nth-of-type(even)`, 'left'), '68%')
  assert.equal(value(`${pixel}:nth-of-type(even)`, '--pixel-confetti-color'), 'var(--arcade-yellow)')
  assert.equal(value(`${scope} :is(.orthodle-celebration-glow, .orthodle-celebration-sparkle)`, 'display'), 'none')
})

test('pixel bursts animate only transform and opacity, finish invisible and respect reduced motion', () => {
  let frames
  arcade.walkAtRules('keyframes', rule => { if (rule.params === 'orthodle-arcade-confetti-burst') frames = rule })
  assert.ok(frames)
  frames.walkDecls(decl => assert.ok(['transform', 'opacity'].includes(decl.prop)))
  assert.equal(frames.nodes.find(frame => frame.selector === '100%').nodes.find(decl => decl.prop === 'opacity').value, '0')
  let reduced
  arcade.walkAtRules('media', rule => {
    if (rule.params === '(prefers-reduced-motion: reduce)') rule.walkRules(pixel, item => { reduced = item })
  })
  assert.ok(reduced.nodes.some(decl => decl.prop === 'animation' && decl.value === 'none' && decl.important))
})

test('the original celebration and reveal behavior stay in place for regular theme', () => {
  assert.match(source, /const confettiPieces = Array.from\(\{ length: 44 \}/)
  assert.match(source, /animateSolvedAnswerRevealScroll\(window.innerWidth/)
  assert.match(source, /animateQuickTakeawayFollowScroll\(window.innerWidth/)
  assert.match(source, /triggerConfetti\(\)/)
  assert.match(source, /triggerSuccessPulse\(\)/)
  assert.match(source, /piece.shape === 'circle' \? '999px'/)
  assert.doesNotMatch(source, /CorrectAnswerCelebration|orthodle-correct-highlight|orthodle-correct-pixels/)
})
