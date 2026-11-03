export const ARCADE_MODE_KEY = 'orthodle_arcade_mode'

export function readArcadeMode() {
  if (typeof window === 'undefined') return true
  try { return window.localStorage.getItem(ARCADE_MODE_KEY) !== 'off' } catch { return true }
}

export function setArcadeMode(enabled: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.arcade = enabled ? 'on' : 'off'
  try { window.localStorage.setItem(ARCADE_MODE_KEY, enabled ? 'on' : 'off') } catch {
    // The setting still applies for this visit when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent('orthodle:arcade-change', { detail: { enabled } }))
}
