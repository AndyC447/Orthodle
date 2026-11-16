const HALF_DAY_MS = 12 * 60 * 60_000

export function impactRefreshWindow(now = Date.now()) {
  return Math.floor(now / HALF_DAY_MS)
}

export function impactRefreshWindowEnd(windowId: number) {
  return (windowId + 1) * HALF_DAY_MS
}
