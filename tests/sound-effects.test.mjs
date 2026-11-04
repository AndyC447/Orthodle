import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', ...Object.keys(globals), code)(name => imports[name] ?? require(name), exports, ...Object.values(globals))
  return exports
}

function harness({ enabled, blocked = false, writeBlocked = false, supported = true, deferred = false, denied = false, broken = false } = {}) {
  const stored = new Map(typeof enabled === 'boolean' ? [['orthodle_sound_effects', enabled ? 'on' : 'off']] : [])
  const contexts = [], timers = new Map(), resumes = []
  let timerId = 0, clock = 0
  class Param {
    constructor() { this.calls = [] }
    setValueAtTime(...args) { this.calls.push(['set', ...args]) }
    linearRampToValueAtTime(...args) { this.calls.push(['attack', ...args]) }
    exponentialRampToValueAtTime(...args) { this.calls.push(['release', ...args]) }
    cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]) }
    setTargetAtTime(...args) { this.calls.push(['fade', ...args]) }
  }
  class Context {
    constructor() { this.currentTime = 10; this.state = 'suspended'; this.destination = {}; this.oscillators = []; this.envelopes = []; this.suspends = 0; contexts.push(this) }
    resume() {
      if (denied) return Promise.reject(Error('Audio blocked'))
      if (deferred) return new Promise(resolve => resumes.push(() => { this.state = 'running'; resolve() }))
      this.state = 'running'
      return Promise.resolve()
    }
    suspend() { this.state = 'suspended'; this.suspends++; return Promise.resolve() }
    createOscillator() {
      if (broken) throw Error('No audio device')
      const oscillator = {
        frequency: new Param(), starts: [], stops: [], type: 'sine', disconnected: false,
        connect(node) { this.target = node }, start(at) { this.starts.push(at) }, stop(at) { this.stops.push(at) },
        disconnect() { this.disconnected = true },
      }
      this.oscillators.push(oscillator)
      return oscillator
    }
    createGain() {
      const envelope = { gain: new Param(), disconnected: false, connect(node) { this.target = node }, disconnect() { this.disconnected = true } }
      this.envelopes.push(envelope)
      return envelope
    }
  }
  const window = Object.assign(new EventTarget(), {
    AudioContext: supported ? Context : undefined,
    localStorage: {
      getItem(key) { if (blocked) throw Error('Blocked'); return stored.get(key) ?? null },
      setItem(key, value) { if (blocked || writeBlocked) throw Error('Blocked'); stored.set(key, value) },
    },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId },
    clearTimeout(id) { timers.delete(id) },
  })
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const engine = load('../lib/sound-effects.ts', {}, { window, document, Date: { now: () => clock } })
  return {
    engine, window, document, contexts, stored, timers,
    resume() { resumes.splice(0).forEach(resolve => resolve()) },
    advance(ms) { clock += ms },
    hide() { document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')) },
    storage(value) {
      if (value === null) stored.delete('orthodle_sound_effects'); else stored.set('orthodle_sound_effects', value)
      const event = new Event('storage'); Object.defineProperty(event, 'key', { value: 'orthodle_sound_effects' }); window.dispatchEvent(event)
    },
    idle() { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.callback()) },
  }
}

test('sounds are always available, but loading the page never starts audio', () => {
  const h = harness()
  h.engine.playSoundEffect('correct')
  assert.equal(h.contexts.length, 0)
  assert.equal(h.engine.setSoundEffects, undefined)
  assert.equal(h.engine.readSoundEffects, undefined)
  assert.equal(h.stored.get('orthodle_sound_effects'), undefined)
  assert.equal(h.stored.get('orthodle_arcade_mode'), undefined)
  assert.equal(h.stored.get('orthodle_theme'), undefined)
})

test('a first-time player gets sound on their first guess without manually enabling it', () => {
  const h = harness()
  assert.equal(h.stored.get('orthodle_sound_effects'), undefined)
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('correct')
  assert.equal(h.contexts[0].oscillators.length, 3)
})

test('old mute settings and blocked storage never disable sounds or alter saved browser data', () => {
  for (const options of [{ enabled: false }, { enabled: true }, { blocked: true }, { writeBlocked: true }]) {
    const h = harness(options)
    const previous = h.stored.get('orthodle_sound_effects')
    h.engine.prepareSoundEffects()
    h.engine.playSoundEffect('correct')
    assert.equal(h.contexts[0].oscillators.length, 3)
    assert.equal(h.stored.get('orthodle_sound_effects'), previous)
  }
})

test('correct, incorrect and celebration have distinct, quiet, short synthesized sounds', () => {
  for (const [effect, count, first] of [['correct', 3, 523.25], ['incorrect', 2, 329.63], ['celebration', 5, 523.25]]) {
    const h = harness({ enabled: true })
    h.engine.prepareSoundEffects()
    h.engine.playSoundEffect(effect)
    const audio = h.contexts[0]
    assert.equal(audio.oscillators.length, count)
    assert.equal(audio.oscillators[0].frequency.calls[0][1], first)
    for (const envelope of audio.envelopes) {
      const attack = envelope.gain.calls.find(call => call[0] === 'attack')
      assert.ok(attack[1] <= 0.035)
      assert.ok(envelope.gain.calls.some(call => call[0] === 'release' && call[1] === 0.0001))
    }
    assert.ok(Math.max(...audio.oscillators.flatMap(oscillator => oscillator.stops)) - audio.currentTime < 0.55)
    audio.oscillators.forEach(oscillator => oscillator.onended())
    assert.ok(audio.oscillators.every(oscillator => oscillator.disconnected))
    assert.ok(audio.envelopes.every(envelope => envelope.disconnected))
    h.idle()
    assert.equal(audio.state, 'suspended')
  }
})

test('stopping playback silences active voices and cancels pending mobile unlocks', async () => {
  const h = harness({ enabled: true })
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('celebration')
  const audio = h.contexts[0]
  h.engine.stopSoundEffects()
  assert.equal(audio.state, 'suspended')
  assert.ok(audio.oscillators.every(oscillator => oscillator.stops.length === 2))
  h.engine.playSoundEffect('correct')
  assert.equal(audio.oscillators.length, 5)
  const waiting = harness({ enabled: true, deferred: true })
  waiting.engine.prepareSoundEffects()
  waiting.engine.playSoundEffect('correct')
  waiting.engine.stopSoundEffects()
  waiting.resume()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(waiting.contexts[0].oscillators.length, 0)
})

test('sounds wait for the user-initiated mobile resume but never play a stale queued effect', async () => {
  const h = harness({ enabled: true, deferred: true })
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('correct')
  assert.equal(h.contexts[0].oscillators.length, 0)
  h.resume()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.contexts[0].oscillators.length, 3)
  const late = harness({ enabled: true, deferred: true })
  late.engine.prepareSoundEffects()
  late.engine.playSoundEffect('correct')
  late.advance(2000)
  late.resume()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(late.contexts[0].oscillators.length, 0)
})

test('a new sound replaces the previous one rather than stacking celebrations', () => {
  const h = harness({ enabled: true })
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('celebration')
  const audio = h.contexts[0]
  h.engine.playSoundEffect('incorrect')
  assert.equal(audio.oscillators.length, 7)
  assert.ok(audio.oscillators.slice(0, 5).every(oscillator => oscillator.stops.length === 2))
  assert.equal(h.contexts.length, 1)
  assert.equal(h.timers.size, 1)
})

test('idle audio resumes on the next tap, reuses one context, and supports the Safari-prefixed API', () => {
  const h = harness({ enabled: true })
  h.window.webkitAudioContext = h.window.AudioContext
  h.window.AudioContext = undefined
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('correct')
  h.idle()
  assert.equal(h.contexts[0].state, 'suspended')
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('incorrect')
  assert.equal(h.contexts.length, 1)
  assert.equal(h.contexts[0].state, 'running')
  assert.equal(h.contexts[0].oscillators.length, 5)
})

test('hiding the page or leaving silences active and pending sounds', () => {
  for (const action of ['hide', 'pagehide']) {
    const h = harness({ enabled: true })
    h.engine.prepareSoundEffects()
    h.engine.playSoundEffect('correct')
    if (action === 'hide') h.hide()
    else h.window.dispatchEvent(new Event('pagehide'))
    assert.equal(h.contexts[0].state, 'suspended')
    assert.equal(h.timers.size, 0)
  }
})

test('obsolete preferences from another tab cannot mute or restart the always-on sound effects', () => {
  const h = harness({ enabled: false })
  h.engine.prepareSoundEffects()
  h.engine.playSoundEffect('correct')
  h.storage('off')
  h.storage(null)
  assert.equal(h.contexts[0].state, 'running')
  assert.equal(h.contexts[0].oscillators.length, 3)
})

test('unsupported, denied and broken audio gracefully stay silent without breaking a case', async () => {
  for (const options of [{ supported: false }, { denied: true }, { broken: true }]) {
    const h = harness({ enabled: true, ...options })
    assert.doesNotThrow(() => { h.engine.prepareSoundEffects(); h.engine.playSoundEffect('correct') })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.contexts.flatMap(context => context.oscillators).length, 0)
  }
  const server = load('../lib/sound-effects.ts')
  assert.doesNotThrow(() => { server.prepareSoundEffects(); server.playSoundEffect('correct'); server.stopSoundEffects() })
})

test('public and group menus no longer expose sound controls but retain the visual theme toggles', () => {
  for (const file of ['../components/Header.tsx', '../app/groups/page.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /SoundEffectsToggle|Sound effects/)
    assert.match(source, /<ArcadeModeToggle/)
    assert.match(source, /Night mode/)
  }
})

test('fresh confirmed guesses play once; previews, reloads and failed submissions stay silent', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const submit = page.slice(page.indexOf('  async function submitGuess('), page.indexOf('    const nextMessage = `Not quite.'))
  assert.ok(submit.indexOf('prepareSoundEffects()') < submit.indexOf("fetch('/api/guess'"))
  assert.match(submit, /if \(!isAdminPreview && !isEmbeddedExample\) prepareSoundEffects\(\)/)
  assert.ok(submit.indexOf('playSoundEffect(') > submit.indexOf("setMessage('Could not check that guess"))
  assert.match(submit, /if \(!isAdminPreview && !isEmbeddedExample && window.location.pathname === '\/'\) \{\s*playSoundEffect\(data.correct \? 'correct' : 'incorrect'\)/)
  assert.equal((page.match(/playSoundEffect\(/g) || []).length, 1)
})
