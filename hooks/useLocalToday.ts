'use client'

import { useEffect, useState } from 'react'
import { todayISO } from '@/lib/utils'

/** Keep long-lived pages aligned with the same local day as the player. */
export function useLocalToday() {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const update = () => setToday(todayISO())
    update()
    const timer = window.setInterval(update, 30_000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return today
}
