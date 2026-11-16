import { fetchAdminPages } from './admin-dashboard'
import { summarizeCaseStats, type CaseGuess } from './case-stats'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from './stats-exclusions'
import { supabase } from './supabase'

const CACHE_KEY = 'orthodle_admin_case_stats_v1'
const MAX_AGE = 12 * 60 * 60_000
const MAX_ENTRIES = 32

export type AdminCaseSnapshot = {
  savedAt: number
  stats: ReturnType<typeof summarizeCaseStats>
}

const snapshots = new Map<string, AdminCaseSnapshot>()
const pending = new Map<string, Promise<AdminCaseSnapshot>>()

function readSaved(): Record<string, AdminCaseSnapshot> {
  try {
    return JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

const isFresh = (snapshot: AdminCaseSnapshot | undefined): snapshot is AdminCaseSnapshot =>
  Boolean(snapshot?.stats && Date.now() - snapshot.savedAt < MAX_AGE)

export function readAdminCaseStats(caseId: string) {
  const snapshot = snapshots.get(caseId) || readSaved()[caseId]
  return isFresh(snapshot) ? snapshot : null
}

function saveSnapshot(caseId: string, snapshot: AdminCaseSnapshot) {
  snapshots.delete(caseId)
  snapshots.set(caseId, snapshot)
  const oldest = snapshots.keys().next().value
  if (oldest !== undefined && snapshots.size > MAX_ENTRIES) snapshots.delete(oldest)
  try {
    const saved = { ...readSaved(), [caseId]: snapshot }
    const recent = Object.entries(saved).filter(([, item]) => isFresh(item))
      .sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_ENTRIES)
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(recent)))
  } catch { /* The in-memory cache still works when storage is unavailable. */ }
}

export function loadAdminCaseStats(caseId: string, refresh = false) {
  const current = pending.get(caseId)
  if (current) return current
  const cached = readAdminCaseStats(caseId)
  if (!refresh && cached) return Promise.resolve(cached)

  const request = (async () => {
    const excluded = new Set(await fetchExcludedStatsSessionIds())
    const rows = await fetchAdminPages<CaseGuess>((from, to) => supabase.from('guesses')
      .select('session_id, is_correct, guess_text').eq('case_id', caseId)
      .order('id').range(from, to))
    const snapshot = { savedAt: Date.now(), stats: summarizeCaseStats(filterExcludedSessionRows(rows, excluded)) }
    saveSnapshot(caseId, snapshot)
    return snapshot
  })().finally(() => { pending.delete(caseId) })
  pending.set(caseId, request)
  return request
}
