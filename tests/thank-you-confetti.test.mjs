import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../lib/thank-you-confetti.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function harness({ width = 390, reduced = false, hidden = false, supported = true, failAt = 0 } = {}) {
  const timers = new Map(), animations = []
  let timerId = 0, animateCalls = 0
  class Element {
    constructor(tag) { this.tag = tag; this.style = {}; this.dataset = {}; this.attributes = {}; this.children = []; this.parent = null; if (!supported) this.animate = undefined }
    setAttribute(key, value) { this.attributes[key] = value }
    appendChild(child) { child.parent = this; this.children.push(child) }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null }
    animate(frames, options) {
      animateCalls++
      if (failAt && animateCalls === failAt) throw Error('Animations unavailable')
      let resolve, reject, settled = false
      const animation = { frames, options, cancelled: false,
        finished: new Promise((yes, no) => { resolve = yes; reject = no }),
        finish() { if (!settled) { settled = true; resolve() } },
        cancel() { this.cancelled = true; if (!settled) { settled = true; reject(Error('Cancelled')) } },
      }
      animations.push(animation)
      return animation
    }
  }
  const body = new Element('body')
  body.style.overflow = 'scroll'
  const motion = Object.assign(new EventTarget(), { matches: reduced })
  const window = Object.assign(new EventTarget(), {
    innerWidth: width, innerHeight: 844, matchMedia: () => motion,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId },
    clearTimeout(id) { timers.delete(id) },
  })
  const document = Object.assign(new EventTarget(), { body, visibilityState: hidden ? 'hidden' : 'visible', createElement: tag => new Element(tag) })
  const exports = {}
  new Function('exports', 'window', 'document', source)(exports, window, document)
  return {
    body, timers, animations, window, document, motion, burst: exports.burstThankYouConfetti,
    expire() { [...timers.values()].forEach(timer => timer.callback()) },
    hide() { document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')) },
  }
}

test('phone burst is limited to 24 particles, lasts about one second, and never blocks scrolling or clicks', () => {
  const h = harness()
  const cleanup = h.burst({ x: 195, y: 330 })
  assert.equal(h.body.children.length, 1)
  const layer = h.body.children[0]
  assert.equal(layer.attributes['aria-hidden'], 'true')
  assert.match(layer.style.cssText, /pointer-events:none/)
  assert.match(layer.style.cssText, /position:fixed/)
  assert.match(layer.style.cssText, /overflow:hidden/)
  assert.equal(layer.children.length, 24)
  assert.equal(h.body.style.overflow, 'scroll')
  for (const animation of h.animations) {
    assert.ok(animation.options.duration >= 820 && animation.options.duration <= 1040)
    assert.ok(animation.options.duration + animation.options.delay < 1100)
    assert.deepEqual([...new Set(animation.frames.flatMap(frame => Object.keys(frame)))].sort(), ['offset', 'opacity', 'transform'])
    assert.equal(animation.frames.at(-1).opacity, 0)
  }
  assert.equal([...h.timers.values()][0].delay, 1200)
  cleanup()
  assert.equal(h.body.children.length, 0)
  assert.equal(h.timers.size, 0)
  assert.ok(h.animations.every(animation => animation.cancelled))
})

test('desktop uses a bounded 36-particle burst and cleanup removes everything even if animations stall', () => {
  const h = harness({ width: 1440 })
  h.burst()
  assert.equal(h.animations.length, 36)
  h.expire()
  assert.equal(h.body.children.length, 0)
  assert.equal(h.timers.size, 0)
})

test('reduced-motion, background tabs, and unsupported animation APIs never create a burst', () => {
  for (const options of [{ reduced: true }, { hidden: true }, { supported: false }]) {
    const h = harness(options)
    assert.doesNotThrow(() => h.burst()())
    assert.equal(h.body.children.length, 0)
    assert.equal(h.animations.length, 0)
    assert.equal(h.timers.size, 0)
  }
})

test('animation completion removes the overlay without waiting for the fallback timer', async () => {
  const h = harness()
  h.burst()
  h.animations.forEach(animation => animation.finish())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.body.children.length, 0)
  assert.equal(h.timers.size, 0)
})

test('leaving the page, rotating the phone, hiding the tab, or enabling reduced motion clears an active burst', () => {
  for (const action of ['pagehide', 'resize', 'hide', 'reduce']) {
    const h = harness()
    h.burst()
    if (action === 'hide') h.hide()
    else if (action === 'reduce') { h.motion.matches = true; h.motion.dispatchEvent(new Event('change')) }
    else h.window.dispatchEvent(new Event(action))
    assert.equal(h.body.children.length, 0)
    assert.equal(h.timers.size, 0)
    assert.ok(h.animations.every(animation => animation.cancelled))
  }
})

test('repeated bursts never stack overlays, and cleanup is safe to call more than once', () => {
  const h = harness()
  const first = h.burst()
  const second = h.burst()
  assert.equal(h.body.children.length, 1)
  assert.ok(h.animations.slice(0, 24).every(animation => animation.cancelled))
  first()
  assert.equal(h.body.children.length, 1)
  second()
  second()
  assert.equal(h.body.children.length, 0)
  assert.equal(h.timers.size, 0)
})

test('a partial browser animation failure safely cleans up and never prevents closing the popup', async () => {
  const h = harness({ failAt: 4 })
  assert.doesNotThrow(() => h.burst())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.body.children.length, 0)
  assert.ok(h.animations.every(animation => animation.cancelled))
})

test('the animation helper is safe during server rendering', () => {
  const exports = {}
  new Function('exports', source)(exports)
  assert.doesNotThrow(() => exports.burstThankYouConfetti()())
})
