import type { CaseBackupSnapshot } from './case-backups'

export const GPT_DRAFT_SHELF_KEY = 'orthodle_gpt_draft_shelf_v1'
export const ADMIN_CASE_DRAFT_KEY = 'orthodle_admin_case_draft_v1'
export const GPT_DRAFT_PREVIOUS_EDITOR_KEY = 'orthodle_gpt_previous_editor_v1'
export const TEACHING_SECTIONS = ['Clinical Pearls', 'Demographics', 'Mechanism', 'Key Clues', 'Treatment', 'Pitfalls'] as const
export type SourceCase = CaseBackupSnapshot & { id: string; answer: string; prompt: string }
export type GeneratedText = {
  prompt: string
  clues: string[]
  teaching: Record<typeof TEACHING_SECTIONS[number], string>
  changes: string
  reviewNotes: string
}
export type DraftProvenance = { sourceCaseId: string; sourceDate: string; draftId: string; generatedAt: string; originalAnswer: string; originalSynonyms: string[] }
export type SavedDraft = {
  id: string; source: SourceCase; text: GeneratedText; generatedAt: string
  status: 'draft' | 'rejected' | 'used'; usedDate?: string
}
export type RankedSource = { source: SourceCase; plays: number; reviews: number; great: number; reviewRate: number; quality: number; score: number; foundational: boolean; lastDiagnosisDate: string }

export function caseClues(source: SourceCase) {
  return [source.clue_1, source.clue_2, source.clue_3, source.clue_4, source.clue_5, source.clue_6].filter((s): s is string => Boolean(s?.trim()))
}

// A visible, conservative preference; Andy can also browse the full ranked library.
export function isFoundational(source: SourceCase) {
  const labels = [source.answer, ...(source.synonyms || [])].join(' ').toLowerCase()
  return /\b(acl|pcl|mcl|lcl|menisc\w*|rotator cuff|carpal tunnel|cubital tunnel|ankle sprain|achilles|trigger finger|de quervain|plantar fasciitis|osteoarthritis|lateral epicondylitis|medial epicondylitis|patellofemoral|anterior cruciate|posterior cruciate|collateral ligament|shoulder dislocation|patellar dislocation|acromioclavicular|ac joint|distal radius|scaphoid|clavicle|proximal humerus|femoral neck|intertrochanteric|tibial plateau|ankle fracture|bimalleolar|trimalleolar|supracondylar|radial head|boxer'?s fracture|fifth metatarsal|femoral shaft)\b/.test(labels)
}

function diagnosisKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, '') }

export function rankSources(
  cases: SourceCase[],
  guesses: { case_id: string; session_id: string }[],
  feedback: { id: string; case_id: string; session_id: string | null; feedback_tags: string[] | null }[],
  today: string
): RankedSource[] {
  const players = new Map<string, Set<string>>()
  for (const row of guesses) {
    if (!row.case_id || !row.session_id) continue
    if (!players.has(row.case_id)) players.set(row.case_id, new Set())
    players.get(row.case_id)!.add(row.session_id)
  }
  const reviews = new Map<string, Map<string, boolean>>()
  for (const row of feedback) {
    if (!row.case_id) continue
    if (!reviews.has(row.case_id)) reviews.set(row.case_id, new Map())
    const perCase = reviews.get(row.case_id)!
    const reviewer = row.session_id || row.id
    perCase.set(reviewer, Boolean(perCase.get(reviewer)) || (row.feedback_tags || []).some(tag => tag.toLowerCase().trim() === 'great case'))
  }
  return cases.filter(c => c.level === 'med_student' && c.case_date < today && c.answer?.trim() && c.prompt?.trim() && caseClues(c).length > 0).map(source => {
    const plays = players.get(source.id)?.size || 0
    const votes = [...(reviews.get(source.id)?.values() || [])]
    const great = votes.filter(Boolean).length
    const quality = (great + 2) / (votes.length + 5)
    const confidence = plays / (plays + 30)
    const endorsement = (great + 1) / (Math.max(plays, votes.length) + 20)
    const foundational = isFoundational(source)
    const keys = new Set([source.answer, ...(source.synonyms || [])].map(diagnosisKey))
    const lastDiagnosisDate = cases.filter(c => c.level === 'med_student' && [c.answer, ...(c.synonyms || [])].some(a => keys.has(diagnosisKey(a)))).reduce((date, c) => c.case_date > date ? c.case_date : date, source.case_date)
    const ageDays = (Date.parse(today) - Date.parse(lastDiagnosisDate)) / 86400000
    const freshness = ageDays < 30 ? 0.25 : ageDays < 60 ? 0.65 : 1
    const score = Math.log1p(plays) * confidence * (0.5 + quality + Math.min(0.5, endorsement)) * (foundational ? 1.2 : 1) * freshness
    return { source, plays, reviews: votes.length, great, reviewRate: plays ? votes.length / plays : 0, quality, score, foundational, lastDiagnosisDate }
  }).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id))
}

export function generationSchema(clueCount: number) {
  return { type: 'object', additionalProperties: false, required: ['prompt', 'clues', 'teaching', 'changes', 'reviewNotes'], properties: {
    prompt: { type: 'string' }, clues: { type: 'array', minItems: clueCount, maxItems: clueCount, items: { type: 'string' } },
    teaching: { type: 'object', additionalProperties: false, required: [...TEACHING_SECTIONS], properties: Object.fromEntries(TEACHING_SECTIONS.map(key => [key, { type: 'string' }])) },
    changes: { type: 'string' }, reviewNotes: { type: 'string' },
  } }
}

export function validateGeneratedText(value: unknown, source: SourceCase): GeneratedText {
  const v = value as GeneratedText
  const validString = (s: unknown, max = 4000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
  if (!v || !validString(v.prompt, 1800) || !Array.isArray(v.clues) || v.clues.length !== caseClues(source).length || v.clues.some(c => !validString(c, 1000)) || !v.teaching || TEACHING_SECTIONS.some(k => !validString(v.teaching[k])) || !validString(v.changes) || !validString(v.reviewNotes)) {
    throw new Error('The generated draft was incomplete. Try another variation.')
  }
  if (v.prompt.trim().toLowerCase() === source.prompt.trim().toLowerCase()) throw new Error('The presentation was unchanged. Generate another variation.')
  if (new Set(v.clues.map(c => c.trim().toLowerCase())).size !== v.clues.length) throw new Error('Duplicate clues returned. Try another variation.')
  return v
}

export function referenceLinks(source: SourceCase) {
  return [...new Set(source.teaching_point?.match(/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/g) || [])].join('\n')
}

export function protectedClueIndices(source: SourceCase) {
  let index = -1
  return [source.clue_1, source.clue_2, source.clue_3, source.clue_4, source.clue_5, source.clue_6].flatMap((clue, slot) => {
    if (!clue?.trim()) return []
    index++
    const revealsImage = [source.image_reveal_clue, source.image_reveal_clue_2].includes(slot + 1)
    return revealsImage || /\b(imag\w*|radiograph\w*|x[- ]?ray\w*|mri|ct|ultrasound|scan\w*|shown above|shown below|depicted)\b/i.test(clue) ? [index] : []
  })
}

export function draftCase(source: SourceCase, text: GeneratedText, date: string): SourceCase {
  validateGeneratedText(text, source)
  const clues = [...text.clues]
  for (const index of protectedClueIndices(source)) clues[index] = caseClues(source)[index]
  const imaging = source.image_findings?.trim() || protectedClueIndices(source).map(i => caseClues(source)[i]).join('\n') || 'No imaging findings documented in the source case.'
  const teaching = [['Imaging Findings', imaging], ...TEACHING_SECTIONS.map(k => [k, text.teaching[k]])].map(([label, body]) => `${label}:\n${body}`).join('\n\n')
  let clueIndex = 0
  const slots = [source.clue_1, source.clue_2, source.clue_3, source.clue_4, source.clue_5, source.clue_6].map(clue => clue?.trim() ? clues[clueIndex++] : null)
  return {
    ...source, id: '', case_date: date, prompt: text.prompt,
    synonyms: [...(source.synonyms || [])],
    clue_1: slots[0], clue_2: slots[1], clue_3: slots[2],
    clue_4: slots[3], clue_5: slots[4], clue_6: slots[5],
    teaching_point: [teaching, referenceLinks(source)].filter(Boolean).join('\n\n'),
  }
}

export function toEditorDraft(saved: SavedDraft, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date === saved.source.case_date) throw new Error('Choose a new publish date for this draft.')
  const c = draftCase(saved.source, saved.text, date)
  const reveal = (n: number | null | undefined) => n == null ? 'none' : n === 0 ? 'after' : String(n)
  const provenance: DraftProvenance = { sourceCaseId: saved.source.id, sourceDate: saved.source.case_date, draftId: saved.id, generatedAt: saved.generatedAt, originalAnswer: saved.source.answer, originalSynonyms: [...(saved.source.synonyms || [])] }
  return {
    caseDate: date, level: 'med_student' as const, contributorName: '', category: c.category || '', prompt: c.prompt,
    answer: c.answer, answer_specificity: c.answer_specificity || 'off', synonyms: (c.synonyms || []).join(', '), anatomyCorrectChoices: '',
    imageUrl: c.image_url || '', imageCredit: c.image_credit || '', imageRevealClue: reveal(c.image_reveal_clue),
    imageUrl2: c.image_url_2 || '', imageCredit2: c.image_credit_2 || '', imageRevealClue2: reveal(c.image_reveal_clue_2), imageFindings: c.image_findings || '',
    learningImageUrl: c.learning_image_url || '', learningImageCredit: c.learning_image_credit || '', learningImageCaption: c.learning_image_caption || '',
    learningImageUrl2: c.learning_image_url_2 || '', learningImageCredit2: c.learning_image_credit_2 || '', learningImageCaption2: c.learning_image_caption_2 || '',
    clue1: c.clue_1 || '', clue2: c.clue_2 || '', clue3: c.clue_3 || '', clue4: c.clue_4 || '', clue5: c.clue_5 || '', clue6: c.clue_6 || '',
    teachingPoint: c.teaching_point || '', referenceLinks: referenceLinks(c), activeSubmissionId: null,
    savedAt: new Date().toISOString(), gptDraftProvenance: provenance,
  }
}

export function gptDraftSaveError(provenance: DraftProvenance | null, date: string, existing: unknown) {
  if (!provenance) return ''
  if (date === provenance.sourceDate) return 'Choose a different date. GPT Draft cannot replace its source case.'
  if (existing) return 'This slot already has a case. Choose an open date for your GPT draft.'
  return ''
}

export function draftSynonyms(provenance: DraftProvenance | null, text: string) {
  // Preserve aliases containing commas unless Andy explicitly edits the alias field.
  if (provenance && text === provenance.originalSynonyms.join(', ')) return [...provenance.originalSynonyms]
  return text.split(',').map(s => s.trim()).filter(Boolean)
}
