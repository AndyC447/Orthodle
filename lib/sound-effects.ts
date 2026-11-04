export type SoundEffect = 'correct' | 'incorrect' | 'celebration'

type Tone = { frequency: number; at: number; duration: number }
const effects: Record<SoundEffect, Tone[]> = {
  correct: [
    { frequency: 523.25, at: 0, duration: 0.1 },
    { frequency: 659.25, at: 0.085, duration: 0.1 },
    { frequency: 783.99, at: 0.17, duration: 0.18 },
  ],
  incorrect: [
    { frequency: 329.63, at: 0, duration: 0.09 },
    { frequency: 293.66, at: 0.07, duration: 0.12 },
  ],
  celebration: [
    { frequency: 523.25, at: 0, duration: 0.12 },
    { frequency: 659.25, at: 0.065, duration: 0.12 },
    { frequency: 783.99, at: 0.13, duration: 0.12 },
    { frequency: 1046.5, at: 0.195, duration: 0.18 },
    { frequency: 1318.51, at: 0.26, duration: 0.23 },
  ],
}

let context: AudioContext | null = null
let resuming: Promise<void> | null = null
let idleTimer: number | null = null
let generation = 0
let listening = false
const voices = new Set<{ oscillator: OscillatorNode; envelope: GainNode }>()

function stopVoices() {
  for (const voice of voices) {
    try {
      const now = context?.currentTime || 0
      voice.envelope.gain.cancelScheduledValues(now)
      voice.envelope.gain.setTargetAtTime(0, now, 0.003)
      voice.oscillator.stop(now + 0.015)
    } catch { /* A voice may already have ended. */ }
  }
  voices.clear()
}

export function stopSoundEffects() {
  generation++
  if (idleTimer !== null) { window.clearTimeout(idleTimer); idleTimer = null }
  stopVoices()
  if (context && context.state !== 'closed') {
    try { void context.suspend().catch(() => {}) } catch { /* Audio remains optional. */ }
  }
}

function listenForPageVisibility() {
  if (listening) return
  listening = true
  window.addEventListener('pagehide', stopSoundEffects)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopSoundEffects()
  })
}

function suspendWhenIdle(delay: number) {
  if (idleTimer !== null) window.clearTimeout(idleTimer)
  const currentGeneration = generation
  idleTimer = window.setTimeout(() => {
    idleTimer = null
    if (currentGeneration !== generation || !context || context.state === 'closed') return
    try { void context.suspend().catch(() => {}) } catch { /* Audio remains optional. */ }
  }, delay)
}

// Call during the actual tap/key press, before awaiting a guess request (important on mobile).
export function prepareSoundEffects() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || document.visibilityState === 'hidden') return
  try {
    listenForPageVisibility()
    if (!context || context.state === 'closed') {
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Audio) return
      context = new Audio({ latencyHint: 'interactive' })
    }
    if (context.state !== 'running') {
      const pending = context.resume().catch(() => {})
      resuming = pending
      void pending.finally(() => { if (resuming === pending) resuming = null })
    }
    suspendWhenIdle(15_000)
  } catch { /* Missing or blocked audio must never prevent playing a case. */ }
}

export function playSoundEffect(effect: SoundEffect) {
  if (!context || typeof document === 'undefined' || document.visibilityState === 'hidden') return
  const audio = context
  const requestGeneration = ++generation
  const requestedAt = Date.now()
  const play = () => {
    if (requestGeneration !== generation || Date.now() - requestedAt > 1500 || document.visibilityState === 'hidden' || audio !== context || audio.state !== 'running') return
    try {
      stopVoices()
      const start = audio.currentTime + 0.01
      for (const tone of effects[effect]) {
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        const voice = { oscillator, envelope }
        oscillator.type = effect === 'incorrect' ? 'sine' : 'triangle'
        oscillator.frequency.setValueAtTime(tone.frequency, start + tone.at)
        envelope.gain.setValueAtTime(0, start + tone.at)
        envelope.gain.linearRampToValueAtTime(effect === 'incorrect' ? 0.025 : 0.035, start + tone.at + 0.008)
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.at + tone.duration)
        oscillator.connect(envelope)
        envelope.connect(audio.destination)
        oscillator.onended = () => {
          voices.delete(voice)
          oscillator.disconnect()
          envelope.disconnect()
        }
        voices.add(voice)
        oscillator.start(start + tone.at)
        oscillator.stop(start + tone.at + tone.duration + 0.01)
      }
      const end = Math.max(...effects[effect].map(tone => tone.at + tone.duration))
      suspendWhenIdle(Math.ceil((end + 0.25) * 1000))
    } catch { stopSoundEffects() }
  }
  if (audio.state === 'running') play()
  else if (resuming) void resuming.then(play).catch(() => {})
}
