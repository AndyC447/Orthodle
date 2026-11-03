'use client'

import { useEffect, useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import { ARCADE_MODE_KEY, readArcadeMode, setArcadeMode } from '@/lib/appearance'

export function ArcadeModeToggle({ onToggle, className = 'orthodle-ui-menu-item flex w-full text-left' }: { onToggle?: () => void; className?: string }) {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    const sync = () => {
      const value = readArcadeMode()
      setEnabled(value)
      document.documentElement.dataset.arcade = value ? 'on' : 'off'
    }
    const changed = (event: Event) => setEnabled(Boolean((event as CustomEvent).detail.enabled))
    const stored = (event: StorageEvent) => {
      if (event.key === ARCADE_MODE_KEY || event.key === null) sync()
    }
    sync()
    window.addEventListener('storage', stored)
    window.addEventListener('orthodle:arcade-change', changed)
    return () => {
      window.removeEventListener('storage', stored)
      window.removeEventListener('orthodle:arcade-change', changed)
    }
  }, [])
  return (
    <button type="button" role="switch" aria-label="Arcade mode" aria-checked={enabled} className={className}
      onClick={() => { setArcadeMode(!enabled); setEnabled(!enabled); onToggle?.() }}>
      <span>Arcade mode</span>
      <Gamepad2 className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
