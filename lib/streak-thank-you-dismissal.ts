export const THANK_YOU_DISMISSED_EVENT = 'orthodle:thank-you-dismissed'
const dismissedThisVisit = new Set<string>()

export const thankYouDismissalKey = (campaignId: string, sessionId: string) =>
  `orthodle_thank_you:${campaignId}:${sessionId}`

export function isThankYouDismissed(key: string) {
  if (dismissedThisVisit.has(key)) return true
  try {
    if (window.localStorage.getItem(key) === 'dismissed') return true
  } catch { /* The cookie is a fallback when browser storage is unavailable. */ }
  try {
    return document.cookie.split('; ').some(cookie => cookie === `${encodeURIComponent(key)}=dismissed`)
  } catch { return false }
}

export function dismissThankYou(key: string) {
  dismissedThisVisit.add(key)
  try { window.localStorage.setItem(key, 'dismissed') } catch { /* Still dismiss for this visit. */ }
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  try { document.cookie = `${encodeURIComponent(key)}=dismissed; Max-Age=63072000; Path=/; SameSite=Lax${secure}` } catch { /* Browser privacy settings may block both storage options. */ }
  window.dispatchEvent(new Event(THANK_YOU_DISMISSED_EVENT))
}
