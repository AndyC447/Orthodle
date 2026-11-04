'use client'

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { DEFAULT_SOUND_EFFECTS, SOUND_EFFECTS_KEY, SOUND_EFFECTS_EVENT, readSoundEffects, setSoundEffects, prepareSoundEffects } from '@/lib/sound-effects'

export function SoundEffectsToggle({ onToggle, className = 'orthodle-ui-menu-item flex w-full text-left' }: { onToggle?: () => void; className?: string }) {
  const [enabled, setEnabled] = useState(DEFAULT_SOUND_EFFECTS)
  useEffect(() => {
    const sync = () => setEnabled(readSoundEffects())
    const changed = (event: Event) => setEnabled(Boolean((event as CustomEvent).detail.enabled))
    const stored = (event: StorageEvent) => { if (event.key === SOUND_EFFECTS_KEY || event.key === null) sync() }
    sync()
    window.addEventListener('storage', stored)
    window.addEventListener(SOUND_EFFECTS_EVENT, changed)
    return () => {
      window.removeEventListener('storage', stored)
      window.removeEventListener(SOUND_EFFECTS_EVENT, changed)
    }
  }, [])
  const Icon = enabled ? Volume2 : VolumeX
  return (
    <button type="button" role="switch" aria-label="Sound effects" aria-checked={enabled} className={className}
      onClick={() => {
        const next = !enabled
        setSoundEffects(next)
        setEnabled(next)
        if (next) prepareSoundEffects()
        onToggle?.()
      }}>
      <span>Sound effects</span>
      <Icon className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
