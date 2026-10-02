import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../components/LiveStatNumber.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function harness(cached, reducedMotion = false) {
  const slots = [], effects = [], frames = new Map(), timers = new Map()
  const storage = new Map(cached === undefined ? [] : [['stat', String(cached)]])
  let cursor = 0, id = 0, animations = 0
  const react = {
    useState(initial) {
      const slot = cursor++
      if (!(slot in slots)) slots[slot] = initial
      return [slots[slot], value => { slots[slot] = value }]
    },
    useRef(initial) {
      const slot = cursor++
      if (!(slot in slots)) slots[slot] = { current: initial }
      return slots[slot]
    },
    useEffect(callback, deps) {
      const slot = cursor++
      const previous = slots[slot]
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
      effects.push(() => {
        previous?.cleanup?.()
        slots[slot] = { deps, cleanup: callback() }
      })
    },
  }
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    require: name => name === 'react' ? react : { jsx: (tag, props) => ({ tag, props }) },
    performance: { now: () => 0 },
    requestAnimationFrame: callback => { animations++; frames.set(++id, callback); return id },
    cancelAnimationFrame: key => frames.delete(key),
    window: {
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      matchMedia: () => ({ matches: reducedMotion }),
      setTimeout: callback => { timers.set(++id, callback); return id },
      clearTimeout: key => timers.delete(key),
    },
  })
  return {
    render(value, loading = false) {
      cursor = 0
      exports.LiveStatNumber({ value, loading, placeholder: null, cacheKey: 'stat' })
      while (effects.length) effects.shift()()
    },
    tick(time) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)) },
    settle() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()) },
    get display() { return slots[0] },
    get active() { return slots[1] },
    get animations() { return animations },
    get cache() { return storage.get('stat') },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
    get pending() { return frames.size + timers.size },
  }
}

test('cached number remains visible during initial load and failed refresh', () => {
  const h = harness(9481)
  h.render(0, true)
  assert.equal(h.display, 9481)
  h.render(0, true)
  assert.equal(h.display, 9481)
  assert.equal(h.animations, 0)
})

test('unchanged cached and refreshed values never animate', () => {
  const h = harness(9481)
  h.render(0, true)
  h.render(9481)
  h.render(9481, true)
  h.render(9481)
  assert.equal(h.display, 9481)
  assert.equal(h.animations, 0)
  assert.equal(h.active, false)
})

test('new values animate from the last displayed number and then stay still', () => {
  const h = harness(9481)
  h.render(9500)
  assert.equal(h.display, 9481)
  assert.equal(h.active, true)
  h.tick(550)
  assert.ok(h.display > 9481 && h.display < 9500)
  h.tick(1100)
  h.settle()
  assert.equal(h.display, 9500)
  assert.equal(h.active, false)
  const count = h.animations
  h.render(9500)
  assert.equal(h.animations, count)
  assert.equal(h.cache, '9500')
})

test('first real value without a cache is shown directly, without a placeholder count-up', () => {
  const h = harness()
  h.render(0, true)
  assert.equal(h.display, null)
  h.render(9500)
  assert.equal(h.display, 9500)
  assert.equal(h.animations, 0)
})

test('reduced motion shows changed numbers immediately', () => {
  const h = harness(9481, true)
  h.render(9500)
  assert.equal(h.display, 9500)
  assert.equal(h.animations, 0)
})

test('interrupted animation preserves confirmed data during refresh and cleans up timers', () => {
  const h = harness(9481)
  h.render(9500)
  h.tick(400)
  h.render(9500, true)
  assert.equal(h.display, 9500)
  assert.equal(h.pending, 0)
  h.render(9501)
  h.tick(1100)
  h.unmount()
  assert.equal(h.pending, 0)
})
