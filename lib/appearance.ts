export const ARCADE_MODE_KEY = 'orthodle_arcade_mode'

// Keep this resolver self-contained: the same function runs before paint and in client controls.
function resolveArcadeTheme(root: Pick<HTMLElement, 'dataset'>, storage: Storage | null, cookie: string) {
  const key = 'orthodle_arcade_mode'
  const initialized = root.dataset.arcadeInitialized === '1'
  let enabled = initialized ? root.dataset.arcade === 'on' : /(?:^|;\s*)orthodle_session_id=[^;]+/.test(cookie)
  let saved: string | null = null
  try { saved = storage?.getItem(key) ?? null } catch { /* Use the current page or legacy visit marker. */ }
  if (saved === 'on' || saved === 'off') enabled = saved === 'on'
  else {
    if (!initialized && !enabled && storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const name = storage.key(i)
          if (name && name !== key && name.startsWith('orthodle_')) { enabled = true; break }
        }
      } catch { /* New visitors without accessible history receive the regular theme. */ }
    }
    try { storage?.setItem(key, enabled ? 'on' : 'off') } catch { /* The root retains the choice for this visit. */ }
  }
  root.dataset.arcade = enabled ? 'on' : 'off'
  root.dataset.arcadeInitialized = '1'
  return enabled
}

export const ARCADE_THEME_BOOTSTRAP_SCRIPT = `
  (function () {
    var storage = null, cookie = '';
    try { storage = window.localStorage; } catch (e) {}
    try { cookie = document.cookie; } catch (e) {}
    (${resolveArcadeTheme.toString()})(document.documentElement, storage, cookie);
  })();
`

export function readArcadeMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  let storage: Storage | null = null, cookie = ''
  try { storage = window.localStorage } catch { /* Browser privacy settings can block storage. */ }
  try { cookie = document.cookie || '' } catch { /* Storage can still identify a returning visitor. */ }
  return resolveArcadeTheme(document.documentElement, storage, cookie)
}

export function setArcadeMode(enabled: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.arcade = enabled ? 'on' : 'off'
  document.documentElement.dataset.arcadeInitialized = '1'
  try { window.localStorage.setItem(ARCADE_MODE_KEY, enabled ? 'on' : 'off') } catch {
    // The setting still applies for this visit when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent('orthodle:arcade-change', { detail: { enabled } }))
}
