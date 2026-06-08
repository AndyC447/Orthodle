export type CaseBackupLevel = 'med_student' | 'resident' | 'attending'

export type CaseBackupSnapshot = {
  id?: string | null
  case_date: string
  level: CaseBackupLevel
  contributor_name?: string | null
  category: string | null
  prompt: string | null
  answer: string | null
  synonyms: string[] | null
  image_url: string | null
  image_credit: string | null
  image_reveal_clue: number | null
  image_url_2: string | null
  image_credit_2: string | null
  image_reveal_clue_2: number | null
  image_findings: string | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point: string | null
  learning_image_url: string | null
  learning_image_credit: string | null
  learning_image_caption: string | null
  learning_image_url_2: string | null
  learning_image_credit_2: string | null
  learning_image_caption_2: string | null
}

export type CaseBackupEntry = {
  backupId: string
  slotKey: string
  capturedAt: string
  source: 'admin' | 'studio'
  case: CaseBackupSnapshot
}

const CASE_BACKUP_STORAGE_KEY = 'orthodle_case_backups_v1'
const MAX_CASE_BACKUPS = 80

function normalizeText(value: string | null | undefined) {
  return (value || '').trim()
}

function normalizeStringArray(value: string[] | null | undefined) {
  return (value || []).map(item => item.trim()).filter(Boolean)
}

function normalizeCaseSnapshot(snapshot: Partial<CaseBackupSnapshot>): CaseBackupSnapshot {
  return {
    id: snapshot.id || null,
    case_date: snapshot.case_date || '',
    level: (snapshot.level || 'med_student') as CaseBackupLevel,
    contributor_name: snapshot.contributor_name || null,
    category: snapshot.category || null,
    prompt: snapshot.prompt || null,
    answer: snapshot.answer || null,
    synonyms: snapshot.synonyms || null,
    image_url: snapshot.image_url || null,
    image_credit: snapshot.image_credit || null,
    image_reveal_clue: snapshot.image_reveal_clue ?? null,
    image_url_2: snapshot.image_url_2 || null,
    image_credit_2: snapshot.image_credit_2 || null,
    image_reveal_clue_2: snapshot.image_reveal_clue_2 ?? null,
    image_findings: snapshot.image_findings || null,
    clue_1: snapshot.clue_1 || null,
    clue_2: snapshot.clue_2 || null,
    clue_3: snapshot.clue_3 || null,
    clue_4: snapshot.clue_4 || null,
    clue_5: snapshot.clue_5 || null,
    clue_6: snapshot.clue_6 || null,
    teaching_point: snapshot.teaching_point || null,
    learning_image_url: snapshot.learning_image_url || null,
    learning_image_credit: snapshot.learning_image_credit || null,
    learning_image_caption: snapshot.learning_image_caption || null,
    learning_image_url_2: snapshot.learning_image_url_2 || null,
    learning_image_credit_2: snapshot.learning_image_credit_2 || null,
    learning_image_caption_2: snapshot.learning_image_caption_2 || null,
  }
}

function comparableCaseSnapshot(snapshot: Partial<CaseBackupSnapshot>) {
  const normalized = normalizeCaseSnapshot(snapshot)
  return {
    case_date: normalized.case_date,
    level: normalized.level,
    contributor_name: normalizeText(normalized.contributor_name),
    category: normalizeText(normalized.category),
    prompt: normalizeText(normalized.prompt),
    answer: normalizeText(normalized.answer),
    synonyms: normalizeStringArray(normalized.synonyms),
    image_url: normalizeText(normalized.image_url),
    image_credit: normalizeText(normalized.image_credit),
    image_reveal_clue: normalized.image_reveal_clue ?? null,
    image_url_2: normalizeText(normalized.image_url_2),
    image_credit_2: normalizeText(normalized.image_credit_2),
    image_reveal_clue_2: normalized.image_reveal_clue_2 ?? null,
    image_findings: normalizeText(normalized.image_findings),
    clue_1: normalizeText(normalized.clue_1),
    clue_2: normalizeText(normalized.clue_2),
    clue_3: normalizeText(normalized.clue_3),
    clue_4: normalizeText(normalized.clue_4),
    clue_5: normalizeText(normalized.clue_5),
    clue_6: normalizeText(normalized.clue_6),
    teaching_point: normalizeText(normalized.teaching_point),
    learning_image_url: normalizeText(normalized.learning_image_url),
    learning_image_credit: normalizeText(normalized.learning_image_credit),
    learning_image_caption: normalizeText(normalized.learning_image_caption),
    learning_image_url_2: normalizeText(normalized.learning_image_url_2),
    learning_image_credit_2: normalizeText(normalized.learning_image_credit_2),
    learning_image_caption_2: normalizeText(normalized.learning_image_caption_2),
  }
}

function readStoredBackups() {
  if (typeof window === 'undefined') return [] as CaseBackupEntry[]
  try {
    const raw = window.localStorage.getItem(CASE_BACKUP_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CaseBackupEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredBackups(entries: CaseBackupEntry[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CASE_BACKUP_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_CASE_BACKUPS)))
}

export function caseBackupSlotKey(caseDate: string, level: CaseBackupLevel) {
  return `${caseDate}:${level}`
}

export function getCaseBackupsForSlot(caseDate: string, level: CaseBackupLevel) {
  const slotKey = caseBackupSlotKey(caseDate, level)
  return readStoredBackups().filter(entry => entry.slotKey === slotKey)
}

export function saveCaseBackup(snapshot: Partial<CaseBackupSnapshot>, source: 'admin' | 'studio') {
  if (typeof window === 'undefined') return null
  const normalized = normalizeCaseSnapshot(snapshot)
  if (!normalized.case_date || !normalized.level) return null

  const nextEntry: CaseBackupEntry = {
    backupId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    slotKey: caseBackupSlotKey(normalized.case_date, normalized.level),
    capturedAt: new Date().toISOString(),
    source,
    case: normalized,
  }

  const existing = readStoredBackups()
  const deduped = existing.filter(
    entry =>
      JSON.stringify(comparableCaseSnapshot(entry.case)) !==
      JSON.stringify(comparableCaseSnapshot(normalized))
  )
  writeStoredBackups([nextEntry, ...deduped])
  return nextEntry
}

export function shouldCreateCaseBackup(
  existingSnapshot: Partial<CaseBackupSnapshot> | null | undefined,
  nextSnapshot: Partial<CaseBackupSnapshot> | null | undefined
) {
  if (!existingSnapshot || !nextSnapshot) return false
  return (
    JSON.stringify(comparableCaseSnapshot(existingSnapshot)) !==
    JSON.stringify(comparableCaseSnapshot(nextSnapshot))
  )
}
