'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import {
  buildMultiSelectSynonymMetadata,
  extractPlainSynonyms,
  getCorrectAnatomyChoiceLetters,
  getAnatomyChoiceItems,
  parseChoiceLetterList,
} from '@/lib/anatomy-quiz'
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/utils'

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

type CasePreviewCache = {
  savedAt: number
  case: CaseRow
}

type UploadSlot = 'case1' | 'case2' | 'teach1' | 'teach2'

type LinkMetadataResult = {
  title: string | null
  siteName: string | null
  author: string | null
  creditLine: string | null
}

const today = todayISO()
const DEFAULT_IMAGE_CREDIT_TEMPLATE = 'Credit:'
const DEFAULT_TEACHING_POINT_TEMPLATE = `**<u>Who</u>**

**<u>Pathophys</u>**

**<u>Key Clues</u>**

**<u>Tx</u>**

**<u>Classic Pitfall</u>**`
const DEFAULT_ANATOMY_TEACHING_POINT_TEMPLATE = `<u>**Explanation**</u>

**<u>Clinical Pearl</u>**

<u>**Why not the others?**</u>`
const LEGACY_ANATOMY_TEACHING_POINT_TEMPLATE = `<u>**Explanation**:</u>

**<u>Clinical Pearl:</u>**

<u>**Why not the others?**</u>`
const ADMIN_CASE_PREVIEW_CACHE_KEY = 'orthodle_admin_case_preview_v1'
const CASE_STUDIO_UNLOCKED_KEY = 'orthodle_admin_unlocked'
const CASE_STUDIO_PASSWORD_KEY = 'orthodle_admin_password'

function shiftISODate(dateText: string, days: number) {
  const baseDate = new Date(`${dateText}T12:00:00`)
  baseDate.setDate(baseDate.getDate() + days)
  return baseDate.toISOString().slice(0, 10)
}

function getDefaultTeachingPointTemplate(level: Level) {
  return level === 'attending'
    ? DEFAULT_ANATOMY_TEACHING_POINT_TEMPLATE
    : DEFAULT_TEACHING_POINT_TEMPLATE
}

function formatLevel(level: Level) {
  if (level === 'med_student') return 'Daily Case'
  if (level === 'resident') return 'Resident'
  return 'Anatomy Quiz'
}

function normalizeCreditValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed === DEFAULT_IMAGE_CREDIT_TEMPLATE) return null
  return trimmed
}

function shouldAutofillCredit(value: string) {
  return !normalizeCreditValue(value)
}

function isReferenceLinkLine(line: string) {
  return /^\[[^\]]+\]\((https?:\/\/[^\s)]+)\)\s*$/i.test(line.trim())
}

function extractReferenceUrlFromLine(line: string) {
  const trimmed = line.trim()
  const markdownMatch = trimmed.match(/^\[[^\]]+\]\((https?:\/\/[^\s)]+)\)\s*$/i)
  if (markdownMatch?.[1]) return markdownMatch[1]
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
  return null
}

function getDefaultReferenceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return 'Link to reference'
  }
}

function normalizeReferenceLinkLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (isReferenceLinkLine(trimmed)) return trimmed
  const url = extractReferenceUrlFromLine(trimmed)
  if (!url) return null
  return `[${getDefaultReferenceLabel(url)}](${url})`
}

function mergeTeachingPointAndReferences(teachingPoint: string, referenceLinks: string) {
  const trimmedTeachingPoint = teachingPoint.trim()
  const cleanedReferenceLines = referenceLinks
    .split('\n')
    .map(normalizeReferenceLinkLine)
    .filter((line): line is string => Boolean(line))
  const trimmedReferenceLinks = cleanedReferenceLines.join('\n')

  if (trimmedTeachingPoint && trimmedReferenceLinks) {
    return `${trimmedTeachingPoint}\n\n${trimmedReferenceLinks}`
  }

  return trimmedTeachingPoint || trimmedReferenceLinks
}

function splitTeachingPointAndReferences(value: string | null | undefined) {
  if (!value) return { teachingPoint: '', referenceLinks: '' }

  const lines = value.split('\n')
  const teachingLines: string[] = []
  const referenceLines: string[] = []

  for (const line of lines) {
    const normalizedReferenceLine = normalizeReferenceLinkLine(line)
    if (normalizedReferenceLine) {
      referenceLines.push(normalizedReferenceLine)
    } else {
      teachingLines.push(line)
    }
  }

  return {
    teachingPoint: teachingLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    referenceLinks: referenceLines.join('\n'),
  }
}

function isMissingTeachingImageCaptionColumnError(message: string | undefined) {
  if (!message) return false
  return /Could not find the 'learning_image_caption(?:_2)?' column of 'cases' in the schema cache/i.test(
    message
  )
}

function stripPreviewText(value: string) {
  return value
    .replace(/<\/?u>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\*(?!\*)/g, '')
    .trim()
}

export default function CaseStudioPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [status, setStatus] = useState('')
  const [loadingCase, setLoadingCase] = useState(false)
  const [caseDate, setCaseDate] = useState(shiftISODate(today, 1))
  const [level, setLevel] = useState<Level>('med_student')
  const [category, setCategory] = useState('')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [anatomyCorrectChoices, setAnatomyCorrectChoices] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [imageUrl2, setImageUrl2] = useState('')
  const [imageCredit2, setImageCredit2] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imageRevealClue2, setImageRevealClue2] = useState('none')
  const [imageFindings, setImageFindings] = useState('')
  const [learningImageUrl, setLearningImageUrl] = useState('')
  const [learningImageCredit, setLearningImageCredit] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [learningImageCaption, setLearningImageCaption] = useState('')
  const [learningImageUrl2, setLearningImageUrl2] = useState('')
  const [learningImageCredit2, setLearningImageCredit2] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [learningImageCaption2, setLearningImageCaption2] = useState('')
  const [showCaseImage2Fields, setShowCaseImage2Fields] = useState(false)
  const [showTeachingImage2Fields, setShowTeachingImage2Fields] = useState(false)
  const [clues, setClues] = useState(['', '', '', '', '', ''])
  const [teachingPoint, setTeachingPoint] = useState(DEFAULT_TEACHING_POINT_TEMPLATE)
  const [referenceLinks, setReferenceLinks] = useState('')
  const [dropTarget, setDropTarget] = useState<UploadSlot | null>(null)
  const [previewVersion, setPreviewVersion] = useState(0)

  const fileInputRefs = {
    case1: useRef<HTMLInputElement | null>(null),
    case2: useRef<HTMLInputElement | null>(null),
    teach1: useRef<HTMLInputElement | null>(null),
    teach2: useRef<HTMLInputElement | null>(null),
  }

  const previewSrc = `/?preview=1&date=${caseDate}&level=${level}&studio=${previewVersion}`

  const anatomyChoiceItems = useMemo(
    () => getAnatomyChoiceItems(clues.map(value => value.trim())),
    [clues]
  )

  const normalizedAnatomyCorrectChoices = useMemo(
    () => parseChoiceLetterList(anatomyCorrectChoices),
    [anatomyCorrectChoices]
  )

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem(CASE_STUDIO_UNLOCKED_KEY)
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return

    let cancelled = false

    async function loadExistingCase() {
      setLoadingCase(true)
      setStatus('')

      const { data, error } = await supabase
        .from('cases')
        .select(
          'id, case_date, level, contributor_name, category, prompt, answer, synonyms, image_url, image_credit, image_reveal_clue, image_url_2, image_credit_2, image_reveal_clue_2, image_findings, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6, teaching_point, learning_image_url, learning_image_credit, learning_image_caption, learning_image_url_2, learning_image_credit_2, learning_image_caption_2'
        )
        .eq('case_date', caseDate)
        .eq('level', level)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setLoadingCase(false)
        setStatus(`Could not load this slot: ${error.message}`)
        return
      }

      if (!data) {
        setCategory(level === 'attending' ? 'Surgical Anatomy' : '')
        setPrompt('')
        setAnswer('')
        setSynonyms('')
        setAnatomyCorrectChoices('')
        setImageUrl('')
        setImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
        setImageRevealClue('none')
        setImageUrl2('')
        setImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
        setImageRevealClue2('none')
        setImageFindings('')
        setLearningImageUrl('')
        setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
        setLearningImageCaption('')
        setLearningImageUrl2('')
        setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
        setLearningImageCaption2('')
        setShowCaseImage2Fields(false)
        setShowTeachingImage2Fields(false)
        setClues(['', '', '', '', '', ''])
        setTeachingPoint(getDefaultTeachingPointTemplate(level))
        setReferenceLinks('')
        setLoadingCase(false)
        return
      }

      const existingCase = data as CaseRow
      const parsedTeaching = splitTeachingPointAndReferences(existingCase.teaching_point)

      setCategory(existingCase.category || (level === 'attending' ? 'Surgical Anatomy' : ''))
      setPrompt(existingCase.prompt || '')
      setAnswer(existingCase.answer || '')
      setSynonyms(extractPlainSynonyms(existingCase.synonyms).join(', '))
      setAnatomyCorrectChoices(
        getCorrectAnatomyChoiceLetters(
          [
            existingCase.clue_1,
            existingCase.clue_2,
            existingCase.clue_3,
            existingCase.clue_4,
            existingCase.clue_5,
            existingCase.clue_6,
          ],
          existingCase.answer || '',
          existingCase.synonyms
        ).join(', ')
      )
      setImageUrl(existingCase.image_url || '')
      setImageCredit(existingCase.image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
      setImageRevealClue(
        existingCase.image_reveal_clue === 0
          ? 'after'
          : existingCase.image_reveal_clue
            ? String(existingCase.image_reveal_clue)
            : 'none'
      )
      setImageUrl2(existingCase.image_url_2 || '')
      setImageCredit2(existingCase.image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
      setImageRevealClue2(
        existingCase.image_reveal_clue_2 === 0
          ? 'after'
          : existingCase.image_reveal_clue_2
            ? String(existingCase.image_reveal_clue_2)
            : 'none'
      )
      setImageFindings(existingCase.image_findings || '')
      setLearningImageUrl(existingCase.learning_image_url || '')
      setLearningImageCredit(existingCase.learning_image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
      setLearningImageCaption(existingCase.learning_image_caption || '')
      setLearningImageUrl2(existingCase.learning_image_url_2 || '')
      setLearningImageCredit2(existingCase.learning_image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
      setLearningImageCaption2(existingCase.learning_image_caption_2 || '')
      setShowCaseImage2Fields(Boolean(existingCase.image_url_2))
      setShowTeachingImage2Fields(Boolean(existingCase.learning_image_url_2))
      setClues([
        existingCase.clue_1 || '',
        existingCase.clue_2 || '',
        existingCase.clue_3 || '',
        existingCase.clue_4 || '',
        existingCase.clue_5 || '',
        existingCase.clue_6 || '',
      ])
      setTeachingPoint(parsedTeaching.teachingPoint || getDefaultTeachingPointTemplate(level))
      setReferenceLinks(parsedTeaching.referenceLinks)
      setLoadingCase(false)
      setStatus(`Loaded ${formatLevel(level)} for ${caseDate}.`)
    }

    void loadExistingCase()

    return () => {
      cancelled = true
    }
  }, [caseDate, isUnlocked, level])

  useEffect(() => {
    if (!isUnlocked) return

    const timeoutId = window.setTimeout(() => {
      const previewCase = buildPreviewCase()
      const payload = JSON.stringify({
        savedAt: Date.now(),
        case: previewCase,
      } satisfies CasePreviewCache)

      window.localStorage.setItem(ADMIN_CASE_PREVIEW_CACHE_KEY, payload)
      window.sessionStorage.setItem(ADMIN_CASE_PREVIEW_CACHE_KEY, payload)
      setPreviewVersion(current => current + 1)
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    answer,
    anatomyCorrectChoices,
    caseDate,
    category,
    clues,
    imageCredit,
    imageCredit2,
    imageFindings,
    imageRevealClue,
    imageRevealClue2,
    imageUrl,
    imageUrl2,
    learningImageCaption,
    learningImageCaption2,
    learningImageCredit,
    learningImageCredit2,
    learningImageUrl,
    learningImageUrl2,
    level,
    prompt,
    referenceLinks,
    synonyms,
    teachingPoint,
    isUnlocked,
  ])

  function buildPreviewCase(): CaseRow {
    const synonymArray = synonyms
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    const multiSelectMetadata =
      level === 'attending'
        ? buildMultiSelectSynonymMetadata(normalizedAnatomyCorrectChoices)
        : null
    const storedSynonyms = multiSelectMetadata ? [...synonymArray, multiSelectMetadata] : synonymArray
    const storedTeachingPoint = mergeTeachingPointAndReferences(teachingPoint, referenceLinks)

    return {
      id: `studio-preview-${caseDate}-${level}`,
      case_date: caseDate,
      level,
      contributor_name: null,
      category: category.trim() || (level === 'attending' ? 'Surgical Anatomy' : 'Preview'),
      prompt,
      answer,
      synonyms: storedSynonyms,
      image_url: imageUrl.trim() || null,
      image_credit: normalizeCreditValue(imageCredit),
      image_reveal_clue:
        imageUrl.trim() && imageRevealClue !== 'none'
          ? imageRevealClue === 'after'
            ? 0
            : Number(imageRevealClue)
          : null,
      image_url_2: imageUrl2.trim() || null,
      image_credit_2: normalizeCreditValue(imageCredit2),
      image_reveal_clue_2:
        imageUrl2.trim() && imageRevealClue2 !== 'none'
          ? imageRevealClue2 === 'after'
            ? 0
            : Number(imageRevealClue2)
          : null,
      image_findings: imageFindings.trim() || null,
      clue_1: clues[0]?.trim() || null,
      clue_2: clues[1]?.trim() || null,
      clue_3: clues[2]?.trim() || null,
      clue_4: clues[3]?.trim() || null,
      clue_5: clues[4]?.trim() || null,
      clue_6: clues[5]?.trim() || null,
      teaching_point: storedTeachingPoint || null,
      learning_image_url: learningImageUrl.trim() || null,
      learning_image_credit: normalizeCreditValue(learningImageCredit),
      learning_image_caption: learningImageCaption.trim() || null,
      learning_image_url_2: learningImageUrl2.trim() || null,
      learning_image_credit_2: normalizeCreditValue(learningImageCredit2),
      learning_image_caption_2: learningImageCaption2.trim() || null,
    }
  }

  async function unlockStudio() {
    setAuthError('')
    const trimmedPassword = password.trim()
    if (!trimmedPassword) {
      setAuthError('Enter the admin password to continue.')
      return
    }

    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: trimmedPassword }),
    })

    if (!res.ok) {
      setAuthError('Incorrect password.')
      return
    }

    window.sessionStorage.setItem(CASE_STUDIO_UNLOCKED_KEY, 'true')
    window.sessionStorage.setItem(CASE_STUDIO_PASSWORD_KEY, trimmedPassword)
    setIsUnlocked(true)
    setPassword('')
  }

  function wrapRichTextSelection(
    textarea: HTMLTextAreaElement | null,
    value: string,
    onChange: (nextValue: string) => void,
    format: 'bold' | 'italic' | 'underline'
  ) {
    if (!textarea) return
    const markers =
      format === 'bold'
        ? { open: '**', close: '**' }
        : format === 'italic'
          ? { open: '*', close: '*' }
          : { open: '<u>', close: '</u>' }
    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const selectedText = value.slice(selectionStart, selectionEnd)
    const wrapped = `${markers.open}${selectedText || 'text'}${markers.close}`
    const nextValue = value.slice(0, selectionStart) + wrapped + value.slice(selectionEnd)
    onChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      const start = selectionStart + markers.open.length
      const end = start + (selectedText || 'text').length
      textarea.setSelectionRange(start, end)
    })
  }

  function toggleTextareaBullets(
    textarea: HTMLTextAreaElement | null,
    value: string,
    onChange: (nextValue: string) => void
  ) {
    if (!textarea) return

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const startOfFirstLine = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    const endOfLastLineIndex = value.indexOf('\n', selectionEnd)
    const endOfLastLine = endOfLastLineIndex === -1 ? value.length : endOfLastLineIndex
    const selectedBlock = value.slice(startOfFirstLine, endOfLastLine)
    const lines = selectedBlock.split('\n')

    const shouldRemoveBullets = lines.every(line => !line.trim() || /^[-*•]\s+/.test(line.trim()))
    const nextBlock = lines
      .map(line => {
        if (!line.trim()) return line
        return shouldRemoveBullets
          ? line.replace(/^(\s*)[-*•]\s+/, '$1')
          : `${line.replace(/^(\s*)/, '$1')}`.replace(/^(\s*)/, '$1- ')
      })
      .join('\n')

    const nextValue = value.slice(0, startOfFirstLine) + nextBlock + value.slice(endOfLastLine)
    onChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(startOfFirstLine, startOfFirstLine + nextBlock.length)
    })
  }

  function handleRichTextareaKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    onChange: (nextValue: string) => void
  ) {
    if (!(event.metaKey || event.ctrlKey)) return

    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      wrapRichTextSelection(event.currentTarget, value, onChange, 'bold')
    }
    if (key === 'i') {
      event.preventDefault()
      wrapRichTextSelection(event.currentTarget, value, onChange, 'italic')
    }
    if (key === 'u') {
      event.preventDefault()
      wrapRichTextSelection(event.currentTarget, value, onChange, 'underline')
    }
    if (event.shiftKey && (event.code === 'Digit7' || event.code === 'Digit8')) {
      event.preventDefault()
      toggleTextareaBullets(event.currentTarget, value, onChange)
    }
  }

  function autoGrowTextarea(event: FormEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget
    element.style.height = 'auto'
    element.style.height = `${Math.max(element.scrollHeight, element.clientHeight, 46)}px`
  }

  async function fetchLinkMetadata(url: string) {
    const response = await fetch(`/api/link-metadata?url=${encodeURIComponent(url)}`, {
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => null)) as
      | LinkMetadataResult
      | { error?: string }
      | null
    if (!response.ok || !data || !('creditLine' in data || 'error' in data)) return null
    if ('error' in data) return null
    return data as LinkMetadataResult
  }

  async function maybeFillCreditFromUrl(
    url: string,
    currentCredit: string,
    setCredit: (value: string) => void,
    statusLabel: string
  ) {
    const trimmedUrl = url.trim()
    if (!/^https?:\/\//i.test(trimmedUrl) || !shouldAutofillCredit(currentCredit)) return
    const metadata = await fetchLinkMetadata(trimmedUrl)
    if (metadata?.creditLine) {
      setCredit(metadata.creditLine)
      setStatus(
        metadata.author
          ? `${statusLabel} credit filled from ${metadata.author}${metadata.siteName ? ` · ${metadata.siteName}` : ''}.`
          : `${statusLabel} credit filled from ${metadata.siteName || 'the link'}.`
      )
    }
  }

  async function hydrateReferenceLinks(value: string) {
    const lines = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    if (lines.length === 0) return ''

    const nextLines = await Promise.all(
      lines.map(async line => {
        const url = extractReferenceUrlFromLine(line)
        if (!url) return line
        if (isReferenceLinkLine(line) && !/\[(?:Link to reference|Reference|Source|[a-z0-9.-]+\.[a-z]{2,})\]\(/i.test(line)) {
          return line
        }

        const metadata = await fetchLinkMetadata(url)
        const preferredLabel =
          metadata?.siteName?.trim() ||
          metadata?.title?.trim() ||
          getDefaultReferenceLabel(url)
        return `[${preferredLabel}](${url})`
      })
    )

    return nextLines.join('\n')
  }

  async function uploadImage(file: File, slot: UploadSlot) {
    setStatus('Uploading image...')
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error } = await supabase.storage.from('case-images').upload(fileName, file)

    if (error) {
      setStatus(`Image upload failed: ${error.message}`)
      return
    }

    const { data } = supabase.storage.from('case-images').getPublicUrl(fileName)

    if (slot === 'case1') {
      setImageUrl(data.publicUrl)
      setStatus('Case image uploaded.')
      return
    }
    if (slot === 'case2') {
      setShowCaseImage2Fields(true)
      setImageUrl2(data.publicUrl)
      setStatus('Second case image uploaded.')
      return
    }
    if (slot === 'teach1') {
      setLearningImageUrl(data.publicUrl)
      setStatus('Teaching image uploaded.')
      return
    }

    setShowTeachingImage2Fields(true)
    setLearningImageUrl2(data.publicUrl)
    setStatus('Second teaching image uploaded.')
  }

  function handleImageDrop(event: DragEvent<HTMLDivElement>, slot: UploadSlot) {
    event.preventDefault()
    setDropTarget(null)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatus('Please drop an image file.')
      return
    }
    void uploadImage(file, slot)
  }

  function setClueAt(index: number, value: string) {
    setClues(current => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  async function saveCase() {
    if (!caseDate || !category.trim() || !prompt.trim() || !answer.trim()) {
      setStatus('Please fill out date, category, prompt, and answer.')
      return
    }

    const invalidAnatomyLetters = normalizedAnatomyCorrectChoices.filter(
      letter => !anatomyChoiceItems.some(choice => choice.letter === letter)
    )
    if (level === 'attending' && invalidAnatomyLetters.length > 0) {
      setStatus(`Correct choices include invalid letters: ${invalidAnatomyLetters.join(', ')}.`)
      return
    }

    const synonymArray = synonyms
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    const multiSelectMetadata =
      level === 'attending'
        ? buildMultiSelectSynonymMetadata(normalizedAnatomyCorrectChoices)
        : null
    const storedSynonyms = multiSelectMetadata ? [...synonymArray, multiSelectMetadata] : synonymArray
    const storedTeachingPoint = mergeTeachingPointAndReferences(teachingPoint, referenceLinks)

    const casePayload = {
      case_date: caseDate,
      level,
      contributor_name: null,
      category: category.trim(),
      prompt: prompt.trim(),
      answer: answer.trim(),
      synonyms: storedSynonyms,
      image_url: imageUrl.trim() || null,
      image_credit: normalizeCreditValue(imageCredit),
      image_reveal_clue:
        imageUrl.trim() && imageRevealClue !== 'none'
          ? imageRevealClue === 'after'
            ? 0
            : Number(imageRevealClue)
          : null,
      image_url_2: imageUrl2.trim() || null,
      image_credit_2: normalizeCreditValue(imageCredit2),
      image_reveal_clue_2:
        imageUrl2.trim() && imageRevealClue2 !== 'none'
          ? imageRevealClue2 === 'after'
            ? 0
            : Number(imageRevealClue2)
          : null,
      image_findings: imageFindings.trim() || null,
      learning_image_url: learningImageUrl.trim() || null,
      learning_image_credit: normalizeCreditValue(learningImageCredit),
      learning_image_caption: learningImageCaption.trim() || null,
      learning_image_url_2: learningImageUrl2.trim() || null,
      learning_image_credit_2: normalizeCreditValue(learningImageCredit2),
      learning_image_caption_2: learningImageCaption2.trim() || null,
      clue_1: clues[0]?.trim() || null,
      clue_2: clues[1]?.trim() || null,
      clue_3: clues[2]?.trim() || null,
      clue_4: clues[3]?.trim() || null,
      clue_5: clues[4]?.trim() || null,
      clue_6: clues[5]?.trim() || null,
      teaching_point: storedTeachingPoint || null,
    }

    let { error } = await supabase.from('cases').upsert(casePayload, {
      onConflict: 'case_date,level',
    })

    let savedWithoutCaptionColumns = false

    if (error && isMissingTeachingImageCaptionColumnError(error.message)) {
      const casePayloadWithoutCaptions = { ...casePayload }
      delete casePayloadWithoutCaptions.learning_image_caption
      delete casePayloadWithoutCaptions.learning_image_caption_2

      const retryResult = await supabase.from('cases').upsert(casePayloadWithoutCaptions, {
        onConflict: 'case_date,level',
      })

      error = retryResult.error
      savedWithoutCaptionColumns = !retryResult.error
    }

    if (error) {
      setStatus(`Error saving case: ${error.message}`)
      return
    }

    setStatus(
      savedWithoutCaptionColumns
        ? `Case saved for ${caseDate} · ${formatLevel(level)}. Teaching image captions need the database update before they can be stored.`
        : `Case saved for ${caseDate} · ${formatLevel(level)}.`
    )
  }

  function openPreviewInNewTab() {
    const previewCase = buildPreviewCase()
    const payload = JSON.stringify({
      savedAt: Date.now(),
      case: previewCase,
    } satisfies CasePreviewCache)
    window.localStorage.setItem(ADMIN_CASE_PREVIEW_CACHE_KEY, payload)
    window.sessionStorage.setItem(ADMIN_CASE_PREVIEW_CACHE_KEY, payload)
    window.open(`/?preview=1&date=${previewCase.case_date}&level=${previewCase.level}`, '_blank', 'noopener,noreferrer')
  }

  function renderImageSlot({
    slot,
    title,
    url,
    setUrl,
    credit,
    setCredit,
    caption,
    setCaption,
    revealClue,
    setRevealClue,
  }: {
    slot: UploadSlot
    title: string
    url: string
    setUrl: (value: string) => void
    credit: string
    setCredit: (value: string) => void
    caption?: string
    setCaption?: (value: string) => void
    revealClue?: string
    setRevealClue?: (value: string) => void
  }) {
    return (
      <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
            {title}
          </div>
          {url ? (
            <button
              type="button"
              onClick={() => {
                setUrl('')
                setCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                setCaption?.('')
                setRevealClue?.('none')
              }}
              className="rounded-md border border-[#ded7ca] px-2.5 py-1 text-[12px] font-semibold text-[#637268] transition hover:bg-white"
            >
              Remove
            </button>
          ) : null}
        </div>

        <div
          onDragOver={event => {
            event.preventDefault()
            setDropTarget(slot)
          }}
          onDragLeave={() => setDropTarget(current => (current === slot ? null : current))}
          onDrop={event => handleImageDrop(event, slot)}
          className={`mt-2 rounded-xl border border-dashed px-3 py-4 text-center transition ${
            dropTarget === slot
              ? 'border-[#2b6f4c] bg-[#eef7f1]'
              : 'border-[#d9d2c6] bg-white'
          }`}
        >
          {url ? (
            <img
              src={url}
              alt={title}
              className="mx-auto max-h-56 rounded-lg object-contain"
            />
          ) : (
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[#102018]">Drop an image here</div>
              <div className="text-[12px] text-[#7a857c]">or use the picker below</div>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRefs[slot].current?.click()}
            className="rounded-md border border-[#ded7ca] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
          >
            Choose file
          </button>
          <input
            ref={fileInputRefs[slot]}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) {
                void uploadImage(file, slot)
              }
              event.currentTarget.value = ''
            }}
          />
          <div className="text-[12px] text-[#7a857c]">Drag and drop works here too.</div>
        </div>

        <div className="mt-2 space-y-2">
          <input
            value={url}
            onChange={event => setUrl(event.target.value)}
            onBlur={() => void maybeFillCreditFromUrl(url, credit, setCredit, title)}
            placeholder="Hosted image URL"
            className="w-full rounded-lg border border-[#ded7ca] px-3 py-2 text-sm text-[#102018]"
          />
          <input
            value={credit}
            onChange={event => setCredit(event.target.value)}
            placeholder="Credit:"
            className="w-full rounded-lg border border-[#ded7ca] px-3 py-2 text-sm text-[#102018]"
          />
          {setCaption ? (
            <textarea
              value={caption || ''}
              onChange={event => setCaption(event.target.value)}
              onKeyDown={event => handleRichTextareaKeyDown(event, caption || '', setCaption)}
              onInput={autoGrowTextarea}
              rows={2}
              placeholder="Optional caption"
              className="min-h-[46px] w-full resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2 text-sm text-[#102018]"
            />
          ) : null}
          {setRevealClue ? (
            <select
              value={revealClue}
              onChange={event => setRevealClue(event.target.value)}
              className="w-full rounded-lg border border-[#ded7ca] px-3 py-2 text-sm text-[#102018]"
            >
              <option value="none">No reveal timing</option>
              <option value="1">Show before Clue 1</option>
              <option value="2">Show before Clue 2</option>
              <option value="3">Show before Clue 3</option>
              <option value="4">Show before Clue 4</option>
              <option value="5">Show before Clue 5</option>
              <option value="6">Show before Clue 6</option>
              <option value="after">Show after the round</option>
            </select>
          ) : null}
        </div>
      </div>
    )
  }

  if (!authReady) {
    return <main className="app-surface min-h-screen" />
  }

  if (!isUnlocked) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
        <div className="mx-auto max-w-md px-4 py-8">
          <div className="rounded-2xl border border-[#e7e1d6] bg-white p-5 shadow-[0_14px_28px_rgba(16,32,24,0.05)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
              Case Studio
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Unlock studio
            </h1>
            <p className="mt-2 text-sm text-[#637268]">
              Enter the admin password to open the dedicated case builder.
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    void unlockStudio()
                  }
                }}
                className="w-full rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                placeholder="Admin password"
              />
              {authError ? <div className="text-sm text-[#9a5c2f]">{authError}</div> : null}
              <button
                type="button"
                onClick={() => void unlockStudio()}
                className="w-full rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
              >
                Open Case Studio
              </button>
              <Link href="/admin" className="block text-center text-sm text-[#637268] underline">
                Back to admin
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
              Case Studio
            </div>
            <h1 className="mt-1 font-serif text-3xl font-bold text-[#102018]">
              Build with live preview
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="rounded-md border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              Back to admin
            </Link>
            <button
              type="button"
              onClick={openPreviewInNewTab}
              className="rounded-md border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              Open full preview
            </button>
            <button
              type="button"
              onClick={() => void saveCase()}
              className="rounded-md border border-[#cbd9cf] bg-[#1f6b48] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#245e44]"
            >
              Save case
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#7a857c]">
          <span>{loadingCase ? 'Loading slot…' : `${formatLevel(level)} · ${caseDate}`}</span>
          {status ? <span>{status}</span> : null}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <section className="rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_12px_28px_rgba(16,32,24,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Live preview
              </div>
              <div className="text-[12px] text-[#7a857c]">Updates as you build</div>
            </div>
            <div className="mt-3 overflow-hidden rounded-[20px] border border-[#e7e1d6] bg-[#f7f4ee]">
              <iframe
                key={previewSrc}
                src={previewSrc}
                title="Case preview"
                className="h-[1050px] w-full bg-white"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_12px_28px_rgba(16,32,24,0.05)]">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Publish date
                  <input
                    type="date"
                    value={caseDate}
                    onChange={event => setCaseDate(event.target.value)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Level
                  <select
                    value={level}
                    onChange={event => setLevel(event.target.value as Level)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  >
                    <option value="med_student">Daily Case</option>
                    <option value="resident">Resident</option>
                    <option value="attending">Anatomy Quiz</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Category
                  <input
                    value={category}
                    onChange={event => setCategory(event.target.value)}
                    placeholder={level === 'attending' ? 'Surgical Anatomy' : 'Trauma'}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Answer
                  <input
                    value={answer}
                    onChange={event => setAnswer(event.target.value)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                </label>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Synonyms
                  <input
                    value={synonyms}
                    onChange={event => setSynonyms(event.target.value)}
                    placeholder="Comma-separated aliases"
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                </label>

                {level === 'attending' ? (
                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Correct choices
                    <input
                      value={anatomyCorrectChoices}
                      onChange={event => setAnatomyCorrectChoices(event.target.value)}
                      placeholder="A, C"
                      className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>
                ) : (
                  <div />
                )}
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Prompt
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  onKeyDown={event => handleRichTextareaKeyDown(event, prompt, setPrompt)}
                  onInput={autoGrowTextarea}
                  rows={5}
                  className="min-h-[120px] resize-y rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                  Case images
                </div>
                <div className="mt-3 space-y-3">
                  {renderImageSlot({
                    slot: 'case1',
                    title: 'Case image',
                    url: imageUrl,
                    setUrl: setImageUrl,
                    credit: imageCredit,
                    setCredit: setImageCredit,
                    revealClue: imageRevealClue,
                    setRevealClue: setImageRevealClue,
                  })}
                  {showCaseImage2Fields ? (
                    renderImageSlot({
                      slot: 'case2',
                      title: 'Second case image',
                      url: imageUrl2,
                      setUrl: setImageUrl2,
                      credit: imageCredit2,
                      setCredit: setImageCredit2,
                      revealClue: imageRevealClue2,
                      setRevealClue: setImageRevealClue2,
                    })
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCaseImage2Fields(true)}
                      className="rounded-md border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      Add second case image
                    </button>
                  )}

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Image findings
                    <textarea
                      value={imageFindings}
                      onChange={event => setImageFindings(event.target.value)}
                      onKeyDown={event => handleRichTextareaKeyDown(event, imageFindings, setImageFindings)}
                      onInput={autoGrowTextarea}
                      rows={4}
                      className="min-h-[96px] resize-y rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                  Clues / answers
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {clues.map((clue, index) => {
                    const label =
                      level === 'attending'
                        ? String.fromCharCode(65 + index)
                        : `Clue ${index + 1}`
                    return (
                      <label key={label} className="grid gap-2 text-sm font-semibold text-[#637268]">
                        {label}
                        <textarea
                          value={clue}
                          onChange={event => setClueAt(index, event.target.value)}
                          onKeyDown={event => handleRichTextareaKeyDown(event, clue, nextValue => setClueAt(index, nextValue))}
                          onInput={autoGrowTextarea}
                          rows={1}
                          className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                  Teaching
                </div>
                <div className="mt-3 space-y-3">
                  {renderImageSlot({
                    slot: 'teach1',
                    title: 'Teaching image',
                    url: learningImageUrl,
                    setUrl: setLearningImageUrl,
                    credit: learningImageCredit,
                    setCredit: setLearningImageCredit,
                    caption: learningImageCaption,
                    setCaption: setLearningImageCaption,
                  })}
                  {showTeachingImage2Fields ? (
                    renderImageSlot({
                      slot: 'teach2',
                      title: 'Second teaching image',
                      url: learningImageUrl2,
                      setUrl: setLearningImageUrl2,
                      credit: learningImageCredit2,
                      setCredit: setLearningImageCredit2,
                      caption: learningImageCaption2,
                      setCaption: setLearningImageCaption2,
                    })
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTeachingImage2Fields(true)}
                      className="rounded-md border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      Add second teaching image
                    </button>
                  )}

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Teaching Point
                    <textarea
                      value={teachingPoint}
                      onChange={event => setTeachingPoint(event.target.value)}
                      onKeyDown={event => handleRichTextareaKeyDown(event, teachingPoint, setTeachingPoint)}
                      rows={10}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                    <div className="text-[12px] font-medium leading-5 text-[#7a857c]">
                      Shortcuts: Cmd/Ctrl + B bold, Cmd/Ctrl + I italic, Cmd/Ctrl + U underline,
                      Cmd/Ctrl + Shift + 7 or 8 bullets. You can apply these everywhere in the
                      case now.
                    </div>
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    References
                    <textarea
                      value={referenceLinks}
                      onChange={event => setReferenceLinks(event.target.value)}
                      onBlur={async () => {
                        const normalized = await hydrateReferenceLinks(referenceLinks)
                        if (normalized !== referenceLinks) {
                          setReferenceLinks(normalized)
                        }
                      }}
                      onKeyDown={event => handleRichTextareaKeyDown(event, referenceLinks, setReferenceLinks)}
                      placeholder={`https://example.com\nhttps://example.com`}
                      rows={3}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
