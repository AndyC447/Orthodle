import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function harness() {
  const slots = [], effects = [], timers = new Map(), navigations = []
  let cursor = 0, timerId = 0
  const router = { push: path => navigations.push(path), prefetch() {} }
  class Element {
    dataset = { sectionSwipeSurface: '/archive' }
    closest() { return null }
  }
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
  }
  react.useEffect = react.useLayoutEffect = (callback, deps) => {
    const index = cursor++
    const previous = slots[index]
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return
    const effect = { callback, deps, cleanup: null }
    slots[index] = effect
    effects.push(effect)
  }
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../hooks/useSectionSwipe.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  new Function('require', 'exports', 'window', 'sessionStorage', 'Element', 'HTMLElement', 'CustomEvent', 'setTimeout', 'clearTimeout', code)(
    name => name === 'react' ? react : { useRouter: () => router }, exports,
    { innerWidth: 390, matchMedia: () => ({ matches: false }), dispatchEvent() {} },
    { getItem: () => null, setItem() {}, removeItem() {} }, Element, Element,
    class CustomEvent { constructor(name, init) { this.detail = init.detail } },
    (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId },
    id => timers.delete(id),
  )
  const render = () => { cursor = 0; return exports.useSectionSwipe('/archive') }
  const flush = () => { while (effects.length) { const effect = effects.shift(); effect.cleanup = effect.callback() } }
  let handlers = render(); flush(); handlers = render(); flush()
  const touch = (x, y = 50) => ({ target: new Element(), touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })
  return {
    render, flush, touch, Element, timers, navigations,
    reactivate() {
      const mounted = slots.filter(slot => slot?.callback)
      mounted.forEach(effect => effect.cleanup?.())
      mounted.forEach(effect => { effect.cleanup = effect.callback() })
    },
  }
}

test('navigation waits for the outgoing transform and commits only once', () => {
  const h = harness()
  let swipe = h.render()
  swipe.onTouchStart(h.touch(300))
  swipe.onTouchMove(h.touch(150))
  swipe = h.render()
  swipe.onTouchEnd(h.touch(130))
  assert.deepEqual(h.navigations, [])
  assert.ok([...h.timers.values()].every(timer => timer.delay >= 320))
  swipe = h.render()
  swipe.onTransitionEnd({ propertyName: 'opacity', target: new h.Element() })
  assert.deepEqual(h.navigations, [])
  swipe.onTransitionEnd({ propertyName: 'transform', target: new h.Element() })
  swipe.onTransitionEnd({ propertyName: 'transform', target: new h.Element() })
  assert.deepEqual(h.navigations, ['/impact'])
  assert.equal(h.timers.size, 0)
})

test('reactivating a cached page resets the offscreen offset and permits another swipe', () => {
  const h = harness()
  let swipe = h.render()
  swipe.onTouchStart(h.touch(300))
  swipe.onTouchEnd(h.touch(100))
  assert.notEqual(h.render().offset, 0)
  h.reactivate()
  swipe = h.render()
  assert.equal(swipe.offset, 0)
  swipe.onTouchStart(h.touch(100))
  swipe.onTouchMove(h.touch(240))
  assert.ok(h.render().offset > 0)
})

test('vertical scrolling cancels navigation', () => {
  const h = harness()
  const swipe = h.render()
  swipe.onTouchStart(h.touch(300, 50))
  swipe.onTouchMove(h.touch(290, 150))
  swipe.onTouchEnd(h.touch(180, 220))
  assert.equal(h.render().offset, 0)
  assert.equal(h.timers.size, 0)
  assert.deepEqual(h.navigations, [])
})
