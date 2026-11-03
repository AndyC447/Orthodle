type BurstOrigin = { x: number; y: number }
let activeCleanup: (() => void) | null = null

export function burstThankYouConfetti(origin?: BurstOrigin): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body || document.visibilityState === 'hidden') return () => {}
  if (typeof window.matchMedia !== 'function') return () => {}
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (motion.matches) return () => {}
  const layer = document.createElement('div')
  if (typeof layer.animate !== 'function') return () => {}
  activeCleanup?.()

  const animations: Animation[] = []
  let timer: number | null = null
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (timer !== null) window.clearTimeout(timer)
    window.removeEventListener('pagehide', cleanup)
    window.removeEventListener('resize', cleanup)
    document.removeEventListener('visibilitychange', hidden)
    motion.removeEventListener?.('change', motionChanged)
    animations.forEach(animation => { void animation.finished.catch(() => {}); animation.cancel() })
    layer.remove()
    if (activeCleanup === cleanup) activeCleanup = null
  }
  const hidden = () => { if (document.visibilityState === 'hidden') cleanup() }
  const motionChanged = () => { if (motion.matches) cleanup() }
  activeCleanup = cleanup

  try {
    const width = window.innerWidth, height = window.innerHeight
    const x = Math.max(16, Math.min(width - 16, origin?.x ?? width / 2))
    const y = Math.max(16, Math.min(height - 16, origin?.y ?? height / 2))
    const count = width < 640 ? 24 : 36
    const colors = ['#5ce5cb', '#ffd447', '#3eac7d', '#ffab76', '#a6dcff', '#fff1b2']
    layer.dataset.thankYouConfetti = ''
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2147483000;contain:strict;'
    document.body.appendChild(layer)
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('span')
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      const distance = 0.5 + Math.random() * 0.5
      const dx = Math.cos(angle) * Math.min(width * 0.65, 370) * distance
      const dy = Math.sin(angle) * Math.min(height * 0.3, 230) * distance - 60
      const spin = (Math.random() - 0.5) * 900
      const size = 5 + Math.round(Math.random() * 3)
      particle.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${i % 3 === 0 ? size : size * 1.7}px;background:${colors[i % colors.length]};border-radius:${i % 5 === 0 ? '50%' : '1px'};will-change:transform,opacity;`
      layer.appendChild(particle)
      // Only compositor-friendly transforms and opacity animate; there is no floor bounce.
      animations.push(particle.animate([
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(0.5)', opacity: 1, offset: 0 },
        { transform: `translate3d(${dx * 0.65}px,${dy * 0.65 - 25}px,0) rotate(${spin * 0.4}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate3d(${dx}px,${dy + 80}px,0) rotate(${spin * 0.8}deg) scale(0.9)`, opacity: 0.9, offset: 0.7 },
        { transform: `translate3d(${dx * 1.15}px,${dy + 210}px,0) rotate(${spin}deg) scale(0.65)`, opacity: 0, offset: 1 },
      ], { duration: 820 + Math.random() * 220, delay: Math.random() * 40, easing: 'cubic-bezier(0.16, 0.6, 0.35, 1)', fill: 'both' }))
    }
    window.addEventListener('pagehide', cleanup)
    window.addEventListener('resize', cleanup)
    document.addEventListener('visibilitychange', hidden)
    motion.addEventListener?.('change', motionChanged)
    timer = window.setTimeout(cleanup, 1200)
    void Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup)
  } catch { cleanup() }
  return cleanup
}
