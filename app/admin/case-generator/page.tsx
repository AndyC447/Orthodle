'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { setTrackingDisabledForThisBrowser, todayISO } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type CaseRow = {
  id: string
  case_date: string
  level: Level
  contributor_name: string | null
  category: string
  prompt: string
  answer: string
  synonyms: string[] | null
  image_url: string | null
  image_credit: string | null
  image_reveal_clue: number | null
  image_url_2: string | null
  image_credit_2: string | null
  image_reveal_clue_2: number | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point: string | null
}

type DraftState = {
  level: Level
  caseDate: string
  contributorName: string
  category: string
  answer: string
  synonyms: string
  prompt: string
  imageUrl: string
  imageCredit: string
  imageRevealClue: string
  imageUrl2: string
  imageCredit2: string
  imageRevealClue2: string
  clue1: string
  clue2: string
  clue3: string
  clue4: string
  clue5: string
  clue6: string
  teachingPoint: string
  templateId: string
  status: string
  saving: boolean
}

const levelOrder: Level[] = ['med_student', 'resident', 'attending']
const tomorrow = shiftISODate(todayISO(), 1)
const CASE_TYPE_OPTIONS = [
  'General orthopaedics',
  'Trauma',
  'Sports',
  'Pediatrics',
  'Hand',
  'Shoulder & elbow',
  'Hip & knee',
  'Foot & ankle',
  'Spine',
  'Oncology',
] as const
const DIFFICULTY_TONE_OPTIONS = [
  'Classic / board-style',
  'Subtle but fair',
  'High-yield consult',
  'Pitfall-heavy',
  'Imaging-forward',
] as const

function shiftISODate(dateText: string, days: number) {
  const baseDate = new Date(`${dateText}T12:00:00`)
  baseDate.setDate(baseDate.getDate() + days)
  return baseDate.toISOString().slice(0, 10)
}

function formatLevel(level: Level) {
  if (level === 'med_student') return 'Med Student'
  if (level === 'resident') return 'Resident'
  return 'Attending'
}

function createEmptyDraft(level: Level, caseDate = tomorrow): DraftState {
  return {
    level,
    caseDate,
    contributorName: '',
    category: '',
    answer: '',
    synonyms: '',
    prompt: '',
    imageUrl: '',
    imageCredit: '',
    imageRevealClue: 'none',
    imageUrl2: '',
    imageCredit2: '',
    imageRevealClue2: 'none',
    clue1: '',
    clue2: '',
    clue3: '',
    clue4: '',
    clue5: '',
    clue6: '',
    teachingPoint: '',
    templateId: '',
    status: '',
    saving: false,
  }
}

function splitNonEmptyLines(value: string) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function extractTeachingPointHeadings(teachingPoint: string | null) {
  const headings = splitNonEmptyLines(teachingPoint || '')
    .map(line => line.replace(/<\/?u>/g, '').replace(/\*\*/g, '').replace(/\*(?!\*)/g, ''))
    .map(line => {
      const match = line.match(/^([A-Za-z][A-Za-z'’ /\-]+):/)
      return match ? match[1].trim() : null
    })
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(headings))
}

function buildTeachingPointStarter(answer: string, level: Level, template: CaseRow | null, notes: string) {
  const headings = extractTeachingPointHeadings(template?.teaching_point || null)
  const normalizedHeadings =
    headings.length > 0
      ? headings
      : [
          'Clinical Context',
          'Who',
          'Pathophys',
          'Key Clues',
          'Imaging',
          'Tx',
          "Don't Miss",
          'Board Pearl',
        ]

  const intro =
    notes.trim() ||
    `${answer || 'Diagnosis'} draft for ${formatLevel(level)}. Tighten the wording, clues, and takeaway before publishing.`

  return normalizedHeadings
    .map((heading, index) => {
      if (index === 0) {
        return `${heading}:\n${intro}`
      }
      return `${heading}:\n- `
    })
    .join('\n\n')
}

function buildPromptStarter(level: Level, story: string, answer: string, template: CaseRow | null) {
  if (story.trim()) return story.trim()
  if (template?.prompt?.trim()) return template.prompt.trim()

  const levelCue =
    level === 'med_student'
      ? 'Keep the stem approachable and pattern-recognition friendly.'
      : level === 'resident'
        ? 'Add one more localization or management detail.'
        : 'Keep the stem lean and consult-level.'

  return `${answer || 'Diagnosis'} case draft. ${levelCue}`
}

function renderFormattedPreviewLine(line: string, keyPrefix = 'preview'): React.ReactNode[] {
  const matches = [
    { type: 'underline' as const, match: line.match(/<u>(.*?)<\/u>/) },
    { type: 'bold' as const, match: line.match(/\*\*(.+?)\*\*/) },
    { type: 'italic' as const, match: line.match(/\*(?!\*)(.+?)\*(?!\*)/) },
  ]
    .filter(
      (entry): entry is { type: 'underline' | 'bold' | 'italic'; match: RegExpMatchArray } =>
        Boolean(entry.match)
    )
    .sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0))

  const firstMatch = matches[0]
  if (!firstMatch) {
    return [<span key={`${keyPrefix}-text`}>{line}</span>]
  }

  const matchIndex = firstMatch.match.index ?? 0
  const fullMatch = firstMatch.match[0]
  const innerText = firstMatch.match[1] ?? ''
  const before = line.slice(0, matchIndex)
  const after = line.slice(matchIndex + fullMatch.length)
  const nodes: React.ReactNode[] = []

  if (before) nodes.push(...renderFormattedPreviewLine(before, `${keyPrefix}-before`))

  const innerNodes = renderFormattedPreviewLine(innerText, `${keyPrefix}-${firstMatch.type}`)
  if (firstMatch.type === 'underline') nodes.push(<u key={`${keyPrefix}-underline`}>{innerNodes}</u>)
  else if (firstMatch.type === 'bold') nodes.push(<strong key={`${keyPrefix}-bold`}>{innerNodes}</strong>)
  else nodes.push(<em key={`${keyPrefix}-italic`}>{innerNodes}</em>)

  if (after) nodes.push(...renderFormattedPreviewLine(after, `${keyPrefix}-after`))
  return nodes
}

export default function AdminCaseGeneratorPage() {
  const teachingRefs = useRef<Record<Level, HTMLTextAreaElement | null>>({
    med_student: null,
    resident: null,
    attending: null,
  })

  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loadingCases, setLoadingCases] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pageStatus, setPageStatus] = useState('')
  const [sharedDate, setSharedDate] = useState(tomorrow)
  const [sharedContributor, setSharedContributor] = useState('')
  const [sharedCategory, setSharedCategory] = useState('')
  const [sharedCaseType, setSharedCaseType] = useState<(typeof CASE_TYPE_OPTIONS)[number]>('General orthopaedics')
  const [sharedDifficultyTone, setSharedDifficultyTone] = useState<(typeof DIFFICULTY_TONE_OPTIONS)[number]>('Classic / board-style')
  const [sharedAnswer, setSharedAnswer] = useState('')
  const [sharedSynonyms, setSharedSynonyms] = useState('')
  const [sharedStory, setSharedStory] = useState('')
  const [sharedClueBank, setSharedClueBank] = useState('')
  const [sharedTeachingNotes, setSharedTeachingNotes] = useState('')
  const [sourceOrthobulletsUrl, setSourceOrthobulletsUrl] = useState('')
  const [sourceRadiopaediaUrl, setSourceRadiopaediaUrl] = useState('')
  const [sharedImageUrl, setSharedImageUrl] = useState('')
  const [sharedImageCredit, setSharedImageCredit] = useState('')
  const [sharedImageUrl2, setSharedImageUrl2] = useState('')
  const [sharedImageCredit2, setSharedImageCredit2] = useState('')
  const [regeneratingLevel, setRegeneratingLevel] = useState<Level | null>(null)
  const [drafts, setDrafts] = useState<Record<Level, DraftState>>({
    med_student: createEmptyDraft('med_student'),
    resident: createEmptyDraft('resident'),
    attending: createEmptyDraft('attending'),
  })

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    setTrackingDisabledForThisBrowser(true)
    void loadCases()
  }, [isUnlocked])

  async function loadCases() {
    setLoadingCases(true)
    setPageStatus('')

    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .order('case_date', { ascending: false })
      .limit(300)

    if (error) {
      setPageStatus(`Could not load prior cases: ${error.message}`)
      setLoadingCases(false)
      return
    }

    setCases((data || []) as CaseRow[])
    setLoadingCases(false)
  }

  const templateOptions = useMemo(() => {
    return {
      med_student: cases.filter(item => item.level === 'med_student'),
      resident: cases.filter(item => item.level === 'resident'),
      attending: cases.filter(item => item.level === 'attending'),
    }
  }, [cases])

  function updateDraft(level: Level, updates: Partial<DraftState>) {
    setDrafts(prev => ({
      ...prev,
      [level]: { ...prev[level], ...updates },
    }))
  }

  function seedAllDraftsFromShared() {
    const clueLines = splitNonEmptyLines(sharedClueBank)

    setDrafts(prev => {
      const next = { ...prev }
      for (const level of levelOrder) {
        const template = cases.find(item => item.id === prev[level].templateId) || null
        next[level] = {
          ...prev[level],
          caseDate: sharedDate,
          contributorName: sharedContributor,
          category: sharedCategory,
          answer: sharedAnswer,
          synonyms: sharedSynonyms,
          prompt: buildPromptStarter(level, sharedStory, sharedAnswer, template),
          imageUrl: sharedImageUrl,
          imageCredit: sharedImageCredit,
          imageUrl2: sharedImageUrl2,
          imageCredit2: sharedImageCredit2,
          clue1: clueLines[0] || prev[level].clue1,
          clue2: clueLines[1] || prev[level].clue2,
          clue3: clueLines[2] || prev[level].clue3,
          clue4: clueLines[3] || prev[level].clue4,
          clue5: clueLines[4] || prev[level].clue5,
          clue6: clueLines[5] || prev[level].clue6,
          teachingPoint:
            prev[level].teachingPoint ||
            buildTeachingPointStarter(sharedAnswer, level, template, sharedTeachingNotes),
          status: 'Draft seeded from shared inputs.',
        }
      }
      return next
    })
  }

  function loadTemplateStructure(level: Level) {
    const draft = drafts[level]
    const template = cases.find(item => item.id === draft.templateId)
    if (!template) {
      updateDraft(level, { status: 'Choose a template first.' })
      return
    }

    updateDraft(level, {
      imageRevealClue: template.image_reveal_clue ? String(template.image_reveal_clue) : 'none',
      imageRevealClue2: template.image_reveal_clue_2 ? String(template.image_reveal_clue_2) : 'none',
      teachingPoint: buildTeachingPointStarter(sharedAnswer || template.answer, level, template, sharedTeachingNotes),
      status: `Loaded ${template.answer} structure.`,
    })
  }

  function cloneTemplate(level: Level) {
    const template = cases.find(item => item.id === drafts[level].templateId)
    if (!template) {
      updateDraft(level, { status: 'Choose a template first.' })
      return
    }

    updateDraft(level, {
      caseDate: sharedDate,
      contributorName: sharedContributor || template.contributor_name || '',
      category: sharedCategory || template.category,
      answer: sharedAnswer || template.answer,
      synonyms: sharedSynonyms || (template.synonyms || []).join(', '),
      prompt: sharedStory.trim() || template.prompt,
      imageUrl: sharedImageUrl || template.image_url || '',
      imageCredit: sharedImageCredit || template.image_credit || '',
      imageRevealClue: template.image_reveal_clue ? String(template.image_reveal_clue) : 'none',
      imageUrl2: sharedImageUrl2 || template.image_url_2 || '',
      imageCredit2: sharedImageCredit2 || template.image_credit_2 || '',
      imageRevealClue2: template.image_reveal_clue_2 ? String(template.image_reveal_clue_2) : 'none',
      clue1: template.clue_1 || '',
      clue2: template.clue_2 || '',
      clue3: template.clue_3 || '',
      clue4: template.clue_4 || '',
      clue5: template.clue_5 || '',
      clue6: template.clue_6 || '',
      teachingPoint: template.teaching_point || '',
      status: `Cloned ${template.answer}.`,
    })
  }

  function wrapTeachingPointSelection(level: Level, format: 'bold' | 'italic' | 'underline') {
    const textarea = teachingRefs.current[level]
    if (!textarea) return

    const draft = drafts[level]
    const markers =
      format === 'bold'
        ? { open: '**', close: '**' }
        : format === 'italic'
          ? { open: '*', close: '*' }
          : { open: '<u>', close: '</u>' }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const selectedText = draft.teachingPoint.slice(selectionStart, selectionEnd)
    const wrapped = `${markers.open}${selectedText || 'text'}${markers.close}`
    const nextValue =
      draft.teachingPoint.slice(0, selectionStart) +
      wrapped +
      draft.teachingPoint.slice(selectionEnd)

    updateDraft(level, { teachingPoint: nextValue })

    requestAnimationFrame(() => {
      textarea.focus()
      const start = selectionStart + markers.open.length
      const end = start + (selectedText || 'text').length
      textarea.setSelectionRange(start, end)
    })
  }

  function handleTeachingPointKeyDown(level: Level, event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      wrapTeachingPointSelection(level, 'bold')
    }
    if (key === 'i') {
      event.preventDefault()
      wrapTeachingPointSelection(level, 'italic')
    }
    if (key === 'u') {
      event.preventDefault()
      wrapTeachingPointSelection(level, 'underline')
    }
  }

  async function saveDraft(level: Level) {
    const draft = drafts[level]
    if (!draft.caseDate || !draft.category || !draft.prompt || !draft.answer) {
      updateDraft(level, { status: 'Fill out date, category, prompt, and answer first.' })
      return
    }

    updateDraft(level, { saving: true, status: 'Saving…' })

    const synonymArray = draft.synonyms
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    const { error } = await supabase.from('cases').upsert(
      {
        case_date: draft.caseDate,
        level,
        contributor_name: draft.contributorName || null,
        category: draft.category,
        prompt: draft.prompt,
        answer: draft.answer,
        synonyms: synonymArray,
        image_url: draft.imageUrl || null,
        image_credit: draft.imageCredit || null,
        image_reveal_clue: draft.imageUrl && draft.imageRevealClue !== 'none' ? Number(draft.imageRevealClue) : null,
        image_url_2: draft.imageUrl2 || null,
        image_credit_2: draft.imageCredit2 || null,
        image_reveal_clue_2: draft.imageUrl2 && draft.imageRevealClue2 !== 'none' ? Number(draft.imageRevealClue2) : null,
        clue_1: draft.clue1 || null,
        clue_2: draft.clue2 || null,
        clue_3: draft.clue3 || null,
        clue_4: draft.clue4 || null,
        clue_5: draft.clue5 || null,
        clue_6: draft.clue6 || null,
        teaching_point: draft.teachingPoint || null,
      },
      { onConflict: 'case_date,level' }
    )

    if (error) {
      updateDraft(level, { saving: false, status: `Could not save ${formatLevel(level)}: ${error.message}` })
      return
    }

    updateDraft(level, { saving: false, status: `${formatLevel(level)} saved for ${draft.caseDate}.` })
    setPageStatus('Case Generator saved into the real scheduled case slots.')
    await loadCases()
  }

  async function saveAllDrafts() {
    for (const level of levelOrder) {
      // eslint-disable-next-line no-await-in-loop
      await saveDraft(level)
    }
  }

  async function generateDraftsWithChatGPT(targetLevels: Level[] = levelOrder) {
    const adminPassword = window.sessionStorage.getItem('orthodle_admin_password') || ''
    if (!adminPassword) {
      setPageStatus('Unlock admin first, then come back here to generate drafts.')
      return
    }

    if (!sharedAnswer.trim() || !sharedCategory.trim()) {
      setPageStatus('Add at least a diagnosis and category before generating drafts.')
      return
    }

    const isSingleLevel = targetLevels.length === 1
    setIsGenerating(!isSingleLevel)
    setRegeneratingLevel(isSingleLevel ? targetLevels[0] : null)
    setPageStatus(
      isSingleLevel
        ? `Regenerating ${formatLevel(targetLevels[0])} with ChatGPT…`
        : 'Generating drafts with ChatGPT…'
    )

    const templates = levelOrder
      .map(level => {
        const template = cases.find(item => item.id === drafts[level].templateId)
        if (!template) return null
        return {
          level,
          answer: template.answer,
          category: template.category,
          prompt: template.prompt,
          clues: [
            template.clue_1,
            template.clue_2,
            template.clue_3,
            template.clue_4,
            template.clue_5,
            template.clue_6,
          ].filter(Boolean) as string[],
          teachingPoint: template.teaching_point || '',
        }
      })
      .filter(Boolean)

    const response = await fetch('/api/admin-generate-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: adminPassword,
        shared: {
          caseDate: sharedDate,
          contributorName: sharedContributor,
          answer: sharedAnswer,
          category: sharedCategory,
          caseType: sharedCaseType,
          difficultyTone: sharedDifficultyTone,
          synonyms: sharedSynonyms,
          story: sharedStory,
          clueBank: sharedClueBank,
          teachingNotes: sharedTeachingNotes,
          orthobulletsUrl: sourceOrthobulletsUrl,
          radiopaediaUrl: sourceRadiopaediaUrl,
        },
        levels: targetLevels,
        templates,
        existingDrafts: Object.fromEntries(
          targetLevels.map(level => [
            level,
            {
              category: drafts[level].category,
              answer: drafts[level].answer,
              synonyms: drafts[level].synonyms,
              prompt: drafts[level].prompt,
              clues: [
                drafts[level].clue1,
                drafts[level].clue2,
                drafts[level].clue3,
                drafts[level].clue4,
                drafts[level].clue5,
                drafts[level].clue6,
              ].filter(Boolean),
              teachingPoint: drafts[level].teachingPoint,
            },
          ])
        ),
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setIsGenerating(false)
      setRegeneratingLevel(null)
      setPageStatus(payload.error || 'Could not generate case drafts right now.')
      return
    }

    const nextDrafts = payload?.drafts
    const hasAllRequestedLevels = targetLevels.every(level => Boolean(nextDrafts?.[level]))
    if (!hasAllRequestedLevels) {
      setIsGenerating(false)
      setRegeneratingLevel(null)
      setPageStatus('ChatGPT returned an incomplete case payload.')
      return
    }

    setDrafts(prev => {
      const updated = { ...prev }
      for (const level of targetLevels) {
        const aiDraft = nextDrafts[level]
        updated[level] = {
          ...prev[level],
          caseDate: sharedDate,
          contributorName: sharedContributor,
          category: aiDraft.category || sharedCategory,
          answer: aiDraft.answer || sharedAnswer,
          synonyms: Array.isArray(aiDraft.synonyms) ? aiDraft.synonyms.join(', ') : sharedSynonyms,
          prompt: aiDraft.prompt || prev[level].prompt,
          clue1: aiDraft.clues?.[0] || '',
          clue2: aiDraft.clues?.[1] || '',
          clue3: aiDraft.clues?.[2] || '',
          clue4: aiDraft.clues?.[3] || '',
          clue5: aiDraft.clues?.[4] || '',
          clue6: aiDraft.clues?.[5] || '',
          teachingPoint: aiDraft.teaching_point || prev[level].teachingPoint,
          status: `${formatLevel(level)} draft generated.`,
        }
      }
      return updated
    })

    setIsGenerating(false)
    setRegeneratingLevel(null)
    setPageStatus(
      isSingleLevel
        ? `${formatLevel(targetLevels[0])} regenerated. Review it, then save when ready.`
        : 'ChatGPT generated all 3 drafts. Review them, add images if needed, then save.'
    )
  }

  function autoGrowTextarea(event: React.FormEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    target.style.height = '0px'
    target.style.height = `${target.scrollHeight}px`
  }

  if (!authReady) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
      </main>
    )
  }

  if (!isUnlocked) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
        <div className="mx-auto max-w-xl px-6 py-12">
          <section className="night-surface rounded-2xl border border-[#ded7ca] bg-white p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              Admin access
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">Unlock admin first</h1>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Open the main admin dashboard first, then come back here to generate and schedule cases.
            </p>
            <Link
              href="/admin"
              className="mt-5 inline-flex rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Go to admin
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">Admin</div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">Case Generator</h1>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#637268]">
              Build scheduled case drafts across med student, resident, and attending using your prior Orthodle cases as templates.
              Paste hosted image links from Orthobullets or Radiopaedia when you have them, then edit the drafts before saving.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void generateDraftsWithChatGPT()}
              disabled={isGenerating}
              className="rounded-lg bg-[#102018] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1b3428] disabled:opacity-60"
            >
              {isGenerating ? 'Generating…' : 'Generate with ChatGPT'}
            </button>
            <button
              type="button"
              onClick={seedAllDraftsFromShared}
              className="rounded-lg bg-[#1f6448] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Create level drafts
            </button>
            <button
              type="button"
              onClick={() => void saveAllDrafts()}
              className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Save all 3
            </button>
            <Link
              href="/admin"
              className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Back to admin
            </Link>
          </div>
        </div>

        {pageStatus && <p className="mt-4 text-sm text-[#637268]">{pageStatus}</p>}

        <section className="night-surface mt-5 rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">Shared source</div>
              <h2 className="mt-1 font-serif text-2xl font-bold text-[#102018]">Draft inputs</h2>
            </div>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
              {loadingCases ? 'Loading templates…' : `${cases.length} prior cases ready`}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Schedule date
              <input
                type="date"
                value={sharedDate}
                onChange={e => setSharedDate(e.target.value)}
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Contributor
              <input
                type="text"
                value={sharedContributor}
                onChange={e => setSharedContributor(e.target.value)}
                placeholder="Optional contributor credit"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Diagnosis / answer
              <input
                type="text"
                value={sharedAnswer}
                onChange={e => setSharedAnswer(e.target.value)}
                placeholder="Slipped capital femoral epiphysis"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Category
              <input
                type="text"
                value={sharedCategory}
                onChange={e => setSharedCategory(e.target.value)}
                placeholder="Pediatrics, Trauma, Sports…"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Case type
              <select
                value={sharedCaseType}
                onChange={e => setSharedCaseType(e.target.value as (typeof CASE_TYPE_OPTIONS)[number])}
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              >
                {CASE_TYPE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Difficulty tone
              <select
                value={sharedDifficultyTone}
                onChange={e => setSharedDifficultyTone(e.target.value as (typeof DIFFICULTY_TONE_OPTIONS)[number])}
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              >
                {DIFFICULTY_TONE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268] lg:col-span-2">
              Synonyms
              <input
                type="text"
                value={sharedSynonyms}
                onChange={e => setSharedSynonyms(e.target.value)}
                placeholder="Comma separated accepted answers"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268] lg:col-span-2">
              Case story
              <textarea
                value={sharedStory}
                onChange={e => setSharedStory(e.target.value)}
                rows={4}
                placeholder="Write the patient vignette or the raw case story you want to shape into the 3 difficulty levels."
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue bank
              <textarea
                value={sharedClueBank}
                onChange={e => setSharedClueBank(e.target.value)}
                rows={6}
                placeholder="One clue per line. The generator will map the first 6 lines into clue slots."
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Teaching notes
              <textarea
                value={sharedTeachingNotes}
                onChange={e => setSharedTeachingNotes(e.target.value)}
                rows={6}
                placeholder="Key teaching pearl, differentiators, pitfalls, treatment points, imaging interpretation."
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Orthobullets source page
              <input
                type="url"
                value={sourceOrthobulletsUrl}
                onChange={e => setSourceOrthobulletsUrl(e.target.value)}
                placeholder="Optional source page URL"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Radiopaedia source page
              <input
                type="url"
                value={sourceRadiopaediaUrl}
                onChange={e => setSourceRadiopaediaUrl(e.target.value)}
                placeholder="Optional source page URL"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Image 1 URL
              <input
                type="url"
                value={sharedImageUrl}
                onChange={e => setSharedImageUrl(e.target.value)}
                placeholder="Hosted radiograph / slide URL"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Image 1 credit
              <input
                type="text"
                value={sharedImageCredit}
                onChange={e => setSharedImageCredit(e.target.value)}
                placeholder="Credit or source label"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Image 2 URL
              <input
                type="url"
                value={sharedImageUrl2}
                onChange={e => setSharedImageUrl2(e.target.value)}
                placeholder="Optional second image URL"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Image 2 credit
              <input
                type="text"
                value={sharedImageCredit2}
                onChange={e => setSharedImageCredit2(e.target.value)}
                placeholder="Optional second image credit"
                className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-[#ead9b7] bg-[#fffaf1] px-3.5 py-3 text-sm leading-6 text-[#8a5a2b]">
            ChatGPT will draft the prompts, clues, synonyms, and learning takeaways. You can still add the final image URLs,
            credits, and any last edits before saving.
          </div>
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {levelOrder.map(level => {
            const draft = drafts[level]
            const options = templateOptions[level]
            return (
              <section key={level} className="night-surface rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">{formatLevel(level)}</div>
                    <h2 className="mt-1 font-serif text-2xl font-bold text-[#102018]">Generated slot</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void generateDraftsWithChatGPT([level])}
                      disabled={isGenerating || regeneratingLevel === level}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white disabled:opacity-60"
                    >
                      {regeneratingLevel === level ? 'Regenerating…' : 'Regenerate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveDraft(level)}
                      disabled={draft.saving}
                      className="rounded-lg bg-[#1f6448] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60"
                    >
                      {draft.saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Template case
                    <select
                      value={draft.templateId}
                      onChange={e => updateDraft(level, { templateId: e.target.value })}
                      className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                    >
                      <option value="">Choose a prior {formatLevel(level)} case</option>
                      {options.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.case_date} · {item.answer}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => loadTemplateStructure(level)}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-white"
                    >
                      Load template structure
                    </button>
                    <button
                      type="button"
                      onClick={() => cloneTemplate(level)}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-white"
                    >
                      Clone template
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Date
                      <input
                        type="date"
                        value={draft.caseDate}
                        onChange={e => updateDraft(level, { caseDate: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Contributor
                      <input
                        type="text"
                        value={draft.contributorName}
                        onChange={e => updateDraft(level, { contributorName: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Category
                      <input
                        type="text"
                        value={draft.category}
                        onChange={e => updateDraft(level, { category: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Answer
                      <input
                        type="text"
                        value={draft.answer}
                        onChange={e => updateDraft(level, { answer: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Synonyms
                    <input
                      type="text"
                      value={draft.synonyms}
                      onChange={e => updateDraft(level, { synonyms: e.target.value })}
                      className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Prompt
                    <textarea
                      value={draft.prompt}
                      onChange={e => updateDraft(level, { prompt: e.target.value })}
                      rows={5}
                      className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 URL
                      <input
                        type="url"
                        value={draft.imageUrl}
                        onChange={e => updateDraft(level, { imageUrl: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 reveal
                      <select
                        value={draft.imageRevealClue}
                        onChange={e => updateDraft(level, { imageRevealClue: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      >
                        <option value="none">Show immediately</option>
                        {[1, 2, 3, 4, 5, 6].map(num => (
                          <option key={num} value={String(num)}>
                            Reveal with clue {num}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 credit
                      <input
                        type="text"
                        value={draft.imageCredit}
                        onChange={e => updateDraft(level, { imageCredit: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 2 reveal
                      <select
                        value={draft.imageRevealClue2}
                        onChange={e => updateDraft(level, { imageRevealClue2: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      >
                        <option value="none">Show immediately</option>
                        {[1, 2, 3, 4, 5, 6].map(num => (
                          <option key={num} value={String(num)}>
                            Reveal with clue {num}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268] sm:col-span-2">
                      Image 2 URL
                      <input
                        type="url"
                        value={draft.imageUrl2}
                        onChange={e => updateDraft(level, { imageUrl2: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268] sm:col-span-2">
                      Image 2 credit
                      <input
                        type="text"
                        value={draft.imageCredit2}
                        onChange={e => updateDraft(level, { imageCredit2: e.target.value })}
                        className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                  </div>

                  <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {(['clue1', 'clue2', 'clue3', 'clue4', 'clue5', 'clue6'] as const).map((key, index) => (
                        <label key={key} className="grid gap-2 text-sm font-semibold text-[#637268]">
                          Clue {index + 1}
                          <textarea
                            value={draft[key]}
                            onChange={e => updateDraft(level, { [key]: e.target.value } as Partial<DraftState>)}
                            onInput={autoGrowTextarea}
                            rows={1}
                            placeholder={index >= 4 ? 'Optional' : ''}
                            className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Teaching Point
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => wrapTeachingPointSelection(level, 'bold')}
                        className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        Bold
                      </button>
                      <button
                        type="button"
                        onClick={() => wrapTeachingPointSelection(level, 'italic')}
                        className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        Italic
                      </button>
                      <button
                        type="button"
                        onClick={() => wrapTeachingPointSelection(level, 'underline')}
                        className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        Underline
                      </button>
                    </div>
                    <textarea
                      ref={node => {
                        teachingRefs.current[level] = node
                      }}
                      value={draft.teachingPoint}
                      onChange={e => updateDraft(level, { teachingPoint: e.target.value })}
                      onKeyDown={e => handleTeachingPointKeyDown(level, e)}
                      rows={9}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">Preview</div>
                        <p className="mt-1 text-[12px] text-[#637268]">A quick read on how this draft will appear to players.</p>
                      </div>
                      <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        {draft.caseDate} · {formatLevel(level)}
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl border border-[#e7e1d6] bg-white">
                      <div className="mx-px mt-px h-1.5 rounded-t-[15px] bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7]" />
                      <div className="p-4">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                          <span className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1">
                            {draft.category || 'Category'}
                          </span>
                          {draft.contributorName && (
                            <span className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1">
                              {draft.contributorName}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 space-y-3">
                          <div className="font-serif text-[20px] font-bold leading-tight text-[#102018]">
                            {draft.answer || 'Diagnosis preview'}
                          </div>
                          <div className="font-serif text-[16px] leading-7 text-[#102018]">
                            {draft.prompt || 'Your generated prompt will show up here.'}
                          </div>

                          {(draft.imageUrl || draft.imageUrl2) && (
                            <div className={`grid gap-2 ${draft.imageUrl && draft.imageUrl2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                              {draft.imageUrl && (
                                <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-2.5">
                                  <img src={draft.imageUrl} alt="Draft preview" className="max-h-56 rounded-lg object-contain" />
                                  {draft.imageCredit && <p className="mt-2 text-[11px] text-[#8a948d]">{draft.imageCredit}</p>}
                                </div>
                              )}
                              {draft.imageUrl2 && (
                                <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-2.5">
                                  <img src={draft.imageUrl2} alt="Second draft preview" className="max-h-56 rounded-lg object-contain" />
                                  {draft.imageCredit2 && <p className="mt-2 text-[11px] text-[#8a948d]">{draft.imageCredit2}</p>}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="rounded-xl border border-dashed border-[#d7e5db] bg-[#fdfefe] p-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#315f4d]">
                              Clinical findings
                            </div>
                            <ul className="mt-2 space-y-2">
                              {[draft.clue1, draft.clue2, draft.clue3, draft.clue4, draft.clue5, draft.clue6]
                                .filter(Boolean)
                                .map((clue, index) => (
                                  <li key={`${clue}-${index}`} className="rounded-lg border border-[#ead9b7] px-3 py-2.5 text-sm leading-6 text-[#102018]">
                                    <span className="mr-2 text-[#637268]">{index + 1}.</span>
                                    {clue}
                                  </li>
                                ))}
                            </ul>
                          </div>

                          <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#315f4d]">Quick takeaway</div>
                            <div className="mt-2 space-y-2">
                              {splitNonEmptyLines(draft.teachingPoint).map((line, index) => (
                                <p key={`${level}-${line}-${index}`} className="text-sm leading-6 text-[#102018]">
                                  {renderFormattedPreviewLine(line, `${level}-${index}`)}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {draft.status && <p className="text-sm text-[#637268]">{draft.status}</p>}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}
