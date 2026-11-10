export const ARCADE_MODE_KEY = 'orthodle_arcade_mode'

// Keep this resolver self-contained: the same function runs before paint and in client controls.
function resolveArcadeTheme(root: Pick<HTMLElement, 'dataset'>, storage: Storage | null) {
  let mode: string | null | undefined = root.dataset.arcadeTemporary
  if (!mode) {
    try { mode = storage?.getItem('orthodle_arcade_mode') } catch { /* Default to Regular. */ }
  }
  const enabled = mode === 'on'
  root.dataset.arcade = enabled ? 'on' : 'off'
  return enabled
}

export const ARCADE_THEME_BOOTSTRAP_SCRIPT = `
  (function () {
    var storage = null;
    try { storage = window.localStorage; } catch (e) {}
    (${resolveArcadeTheme.toString()})(document.documentElement, storage);
  })();
`

export function readArcadeMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  let storage: Storage | null = null
  try { storage = window.localStorage } catch { /* Browser privacy settings can block storage. */ }
  return resolveArcadeTheme(document.documentElement, storage)
}

export function setArcadeMode(enabled: boolean) {
  if (typeof document === 'undefined') return
  const { dataset } = document.documentElement
  const mode = enabled ? 'on' : 'off'
  dataset.arcade = mode
  try {
    window.localStorage.setItem(ARCADE_MODE_KEY, mode)
    delete dataset.arcadeTemporary
  } catch {
    // The setting still applies for this visit when storage is unavailable.
    dataset.arcadeTemporary = mode
  }
  window.dispatchEvent(new CustomEvent('orthodle:arcade-change', { detail: { enabled } }))
}
