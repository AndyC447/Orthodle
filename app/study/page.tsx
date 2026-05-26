'use client'

import type { ReactNode, TouchEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import {
  DEFAULT_LEVEL_TITLES,
  normalizeLevelTitles,
  readCachedLevelTitles,
  writeCachedLevelTitles,
} from '@/lib/level-display'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type StudyCase = {
  id: string
  case_date: string
  level: Level
  answer: string
  category: string | null
  teaching_point: string | null
}

type TeachingPointSection = {
  label: string
  body: string[]
}

type TeachingBodyBlock =
  | { type: 'paragraph'; key: string; text: string }
  | { type: 'bullets'; key: string; items: string[] }
  | { type: 'spacer'; key: string }

const LAUNCH_DATE = '2026-04-27'
const SURGICAL_ANATOMY_LAUNCH_DATE = '2026-05-14'
const TEACHING_POINT_LABELS = new Map<string, string>([
  ['quick takeaway', 'Quick takeaway'],
  ['who', 'Who'],
  ['pathophys', 'Pathophys'],
  ['pathophysiology', 'Pathophysiology'],
  ['key clues', 'Key clues'],
  ['tx', 'Tx'],
  ['treatment', 'Treatment'],
  ['classic pitfall', 'Classic pitfall'],
  ['explanation', 'Explanation'],
  ['clinical pearl', 'Clinical Pearl'],
  ['why not the others', 'Why not the others?'],
  ['orthodle insight', 'Orthodle Insight'],
])

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => {
      if (word.toUpperCase() === word && word.length <= 4) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

export default function StudyModePage() {
  const [cases, setCases] = useState<StudyCase[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showFullTeaching, setShowFullTeaching] = useState(false)
  const [levelTitles, setLevelTitles] = useState(DEFAULT_LEVEL_TITLES)
  const touchStartXRef = useRef<number | null>(null)

  useEffect(() => {
    setLevelTitles(readCachedLevelTitles())
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadStudyCases() {
      const [{ data: caseData }, { data: levelTitleData }] = await Promise.all([
        supabase
          .from('cases')
          .select('id, case_date, level, answer, category, teaching_point')
          .gte('case_date', LAUNCH_DATE)
          .not('teaching_point', 'is', null)
          .order('case_date', { ascending: false })
          .limit(500),
        supabase.from('level_display_settings').select('level, title'),
      ])

      if (cancelled) return

      const nextCases = ((caseData || []) as StudyCase[]).filter(
        item => item.answer?.trim() && item.teaching_point?.trim()
      )
      const nextTitles = normalizeLevelTitles(
        ((levelTitleData || []) as Array<{ level: Level; title: string }>).reduce(
          (acc, item) => {
            acc[item.level] = item.title
            return acc
          },
          {} as Partial<Record<Level, string>>
        )
      )

      setCases(nextCases)
      setLevelTitles(nextTitles)
      writeCachedLevelTitles(nextTitles)
      setLoading(false)
    }

    void loadStudyCases()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return cases

    return cases.filter(item => {
      const answerMatch = item.answer.toLowerCase().includes(normalizedQuery)
      const categoryMatch = (item.category || '').toLowerCase().includes(normalizedQuery)
      const teachingMatch = (item.teaching_point || '').toLowerCase().includes(normalizedQuery)
      return answerMatch || categoryMatch || teachingMatch
    })
  }, [cases, query])

  useEffect(() => {
    setCurrentIndex(0)
    setShowFullTeaching(false)
  }, [query])

  useEffect(() => {
    setShowFullTeaching(false)
  }, [currentIndex])

  const currentCase = filteredCases[currentIndex] || null
  const sections = useMemo(
    () => (currentCase?.teaching_point ? parseTeachingPointSections(currentCase.teaching_point) : []),
    [currentCase]
  )
  const visibleSections = showFullTeaching ? sections : sections.slice(0, 2)
  const hiddenSectionCount = Math.max(0, sections.length - visibleSections.length)

  function isSurgicalAnatomyDate(dateText: string) {
    return dateText >= SURGICAL_ANATOMY_LAUNCH_DATE
  }

  function formatLevel(level: Level, dateText: string) {
    if (level === 'med_student') return levelTitles.med_student
    if (level === 'resident') return levelTitles.resident
    return isSurgicalAnatomyDate(dateText) ? levelTitles.attending : 'Attending'
  }

  function formatDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function goToPrevious() {
    setCurrentIndex(current => (current === 0 ? filteredCases.length - 1 : current - 1))
  }

  function goToNext() {
    setCurrentIndex(current => (current === filteredCases.length - 1 ? 0 : current + 1))
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current
    const endX = event.changedTouches[0]?.clientX ?? null
    touchStartXRef.current = null
    if (startX === null || endX === null) return

    const delta = endX - startX
    if (Math.abs(delta) < 48) return
    if (delta < 0) {
      goToNext()
    } else {
      goToPrevious()
    }
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />
      <section className="mx-auto w-full max-w-4xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <div className="night-surface rounded-[26px] border border-[#e7e1d6] px-4 py-4 shadow-[0_16px_34px_rgba(16,32,24,0.05)] sm:px-6 sm:py-6">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#315f4d]">
              Study Mode
            </div>
            <h1 className="mt-2 font-serif text-[32px] font-bold tracking-[-0.03em] text-[#102018] sm:text-[40px]">
              Study diagnoses like flashcards
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-6 text-[#637268] sm:text-[14px]">
              Search any diagnosis and swipe left or right to move through the learning points.
            </p>
          </div>

          <div className="mt-4 sm:mt-5">
            <label className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a857c]">
                <Search size={15} strokeWidth={2.2} />
              </span>
              <input
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search diagnoses to study"
                className="w-full rounded-[16px] border border-[#ded7ca] bg-white px-10 py-3 text-[13px] text-[#102018] shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_8px_16px_rgba(16,32,24,0.03)] outline-none transition focus:border-[#1f6448]"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium text-[#637268] sm:text-[12px]">
              {loading
                ? 'Loading study cards...'
                : filteredCases.length === 0
                  ? 'No matching diagnoses found.'
                  : `${filteredCases.length} study card${filteredCases.length === 1 ? '' : 's'} ready`}
            </p>
            {!loading && currentCase ? (
              <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268] shadow-[0_6px_14px_rgba(16,32,24,0.04)]">
                {currentIndex + 1} / {filteredCases.length}
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="night-soft-surface rounded-[24px] border border-[#e7e1d6] px-5 py-16 text-center text-[14px] text-[#637268]">
                Loading study cards...
              </div>
            ) : !currentCase ? (
              <div className="night-soft-surface rounded-[24px] border border-dashed border-[#ded7ca] px-5 py-16 text-center">
                <div className="font-serif text-[26px] font-bold tracking-[-0.02em] text-[#102018]">
                  No study cards found
                </div>
                <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-[#637268]">
                  Try a broader diagnosis search, category term, or keyword from the learning
                  points.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={goToPrevious}
                  aria-label="Previous study card"
                  className="orthodle-home-secondary-action hidden h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border sm:inline-flex"
                >
                  <ChevronLeft size={18} strokeWidth={2.6} />
                </button>

                <div
                  role="region"
                  aria-label="Study card"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  className="relative min-h-[520px] flex-1 outline-none sm:min-h-[560px]"
                >
                  <div className="night-surface h-full overflow-hidden rounded-[26px] border border-[#e7e1d6] px-4 py-4 shadow-[0_18px_36px_rgba(16,32,24,0.06)] sm:px-5 sm:py-5">
                    <div className="flex h-full flex-col">
                      <div className="relative overflow-hidden rounded-[22px] border border-[#0f5b40] bg-[radial-gradient(circle_at_50%_22%,rgba(255,214,89,0.22),transparent_26%),linear-gradient(145deg,#0b4d36,#042f22)] px-4 py-4 text-center text-white shadow-[0_20px_40px_rgba(4,47,34,0.24),0_6px_14px_rgba(4,47,34,0.14)] sm:px-5 sm:py-5">
                        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle,#e9b93f_1.4px,transparent_1.4px)] [background-size:32px_32px]" />
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-80" />
                        <div className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-black/25 to-transparent opacity-70" />
                        <div className="relative">
                          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#f0c247] sm:text-[10px]">
                            {toTitleCase(formatLevel(currentCase.level, currentCase.case_date))}
                          </div>
                          <h2 className="mt-2 font-serif text-[28px] font-bold leading-tight tracking-[-0.04em] text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.18)] sm:text-[36px]">
                            {currentCase.answer}
                          </h2>
                          <div className="mt-2 text-[11px] font-medium text-[#deebe5] sm:text-[12px]">
                            {formatDate(currentCase.case_date)}
                            {currentCase.category?.trim()
                              ? ` · ${toTitleCase(currentCase.category.trim())}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex-1 overflow-y-auto pr-1">
                        <div className="rounded-[20px] bg-[#fcfbf8] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_24px_rgba(16,32,24,0.035)]">
                          {sections.length > 0 ? (
                            <div className="space-y-3">
                              {visibleSections.map((section, sectionIndex) => (
                                <div
                                  key={`${section.label}-${sectionIndex}`}
                                  className={sectionIndex > 0 ? 'border-t border-[#ebe5db] pt-3' : ''}
                                >
                                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#315f4d]">
                                    {renderFormattedLine(section.label, `study-label-${sectionIndex}`)}
                                  </div>
                                  <div className="mt-2 space-y-1.5">
                                    {renderTeachingBody(
                                      section.body,
                                      `study-body-${currentCase.id}-${sectionIndex}`
                                    )}
                                  </div>
                                </div>
                              ))}
                              {hiddenSectionCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setShowFullTeaching(true)}
                                  className="orthodle-home-secondary-action inline-flex min-h-[38px] items-center rounded-[14px] border px-3 py-2 text-[11px] font-semibold text-[#1f6448]"
                                >
                                  Show {hiddenSectionCount} more section{hiddenSectionCount === 1 ? '' : 's'}
                                </button>
                              ) : null}
                              {showFullTeaching && sections.length > 2 ? (
                                <button
                                  type="button"
                                  onClick={() => setShowFullTeaching(false)}
                                  className="orthodle-home-secondary-action inline-flex min-h-[38px] items-center rounded-[14px] border px-3 py-2 text-[11px] font-semibold text-[#1f6448]"
                                >
                                  Show less
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <p className="font-serif text-[15px] leading-6 tracking-[-0.01em] text-[#102018]">
                              {renderFormattedLine(currentCase.teaching_point || '')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-[#ded7ca] pt-4 text-[11px] text-[#7a857c]">
                        <span>Swipe left or right to move between diagnoses.</span>
                        <span className="hidden sm:inline">Use the arrows to keep studying.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goToNext}
                  aria-label="Next study card"
                  className="orthodle-home-secondary-action hidden h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border sm:inline-flex"
                >
                  <ChevronRight size={18} strokeWidth={2.6} />
                </button>
              </div>
            )}
          </div>

          {!loading && currentCase ? (
            <div className="mt-3 flex justify-center gap-2 sm:hidden">
              <button
                type="button"
                onClick={goToPrevious}
                className="orthodle-home-secondary-action inline-flex h-10 items-center gap-1 rounded-[14px] border px-3"
              >
                <ChevronLeft size={16} strokeWidth={2.6} />
                Prev
              </button>
              <button
                type="button"
                onClick={goToNext}
                className="orthodle-home-secondary-action inline-flex h-10 items-center gap-1 rounded-[14px] border px-3"
              >
                Next
                <ChevronRight size={16} strokeWidth={2.6} />
              </button>
            </div>
          ) : null}
        </div>
      </section>
      <PublicFooter />
    </main>
  )
}

function renderFormattedLine(line: string, keyPrefix = 'inline'): ReactNode[] {
  const matches = [
    { type: 'link' as const, match: line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/) },
    { type: 'underline' as const, match: line.match(/<u>(.*?)<\/u>/) },
    { type: 'bold' as const, match: line.match(/\*\*(.+?)\*\*/) },
    { type: 'italic' as const, match: line.match(/\*(?!\*)(.+?)\*(?!\*)/) },
  ]
    .filter(
      (
        entry
      ): entry is {
        type: 'link' | 'underline' | 'bold' | 'italic'
        match: RegExpMatchArray
      } => Boolean(entry.match)
    )
    .sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0))

  const firstMatch = matches[0]
  if (!firstMatch) {
    return [<span key={`${keyPrefix}-text`}>{line}</span>]
  }

  const matchIndex = firstMatch.match.index ?? 0
  const fullMatch = firstMatch.match[0]
  const innerText = firstMatch.match[1] ?? ''
  const linkHref = firstMatch.type === 'link' ? firstMatch.match[2] ?? '' : ''
  const before = line.slice(0, matchIndex)
  const after = line.slice(matchIndex + fullMatch.length)
  const nodes: ReactNode[] = []

  if (before) {
    nodes.push(...renderFormattedLine(before, `${keyPrefix}-before`))
  }

  const innerNodes = renderFormattedLine(innerText, `${keyPrefix}-${firstMatch.type}`)
  if (firstMatch.type === 'link') {
    nodes.push(
      <a
        key={`${keyPrefix}-link`}
        href={linkHref}
        target="_blank"
        rel="noreferrer noopener"
        className="font-semibold text-[#1f6ad8] underline decoration-[#1f6ad8]/50 underline-offset-2 transition hover:text-[#174c9c]"
      >
        {innerNodes}
      </a>
    )
  } else if (firstMatch.type === 'underline') {
    nodes.push(<u key={`${keyPrefix}-underline`}>{innerNodes}</u>)
  } else if (firstMatch.type === 'bold') {
    nodes.push(<strong key={`${keyPrefix}-bold`}>{innerNodes}</strong>)
  } else {
    nodes.push(<em key={`${keyPrefix}-italic`}>{innerNodes}</em>)
  }

  if (after) {
    nodes.push(...renderFormattedLine(after, `${keyPrefix}-after`))
  }

  return nodes
}

function parseTeachingPointSections(text: string): TeachingPointSection[] {
  const lines = text.split('\n')
  const sections: TeachingPointSection[] = []
  let currentSection: TeachingPointSection | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (currentSection && currentSection.body[currentSection.body.length - 1] !== '') {
        currentSection.body.push('')
      }
      continue
    }

    const strippedLine = line
      .replace(/<\/?u>/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*(?!\*)/g, '')

    const headingMatch = strippedLine.match(/^([A-Za-z][A-Za-z'’ /\-?]+):\s*(.*)$/)
    if (headingMatch) {
      const colonIndex = line.indexOf(':')
      const rawLabel = colonIndex >= 0 ? line.slice(0, colonIndex).trim() : headingMatch[1].trim()
      const rest = colonIndex >= 0 ? line.slice(colonIndex + 1).trim() : headingMatch[2].trim()
      const normalizedLabel = headingMatch[1]
        .trim()
        .toLowerCase()
        .replace(/[’']/g, "'")
        .replace(/[^a-z' ?]/g, '')
        .replace(/\s+/g, ' ')
      const canonicalLabel = TEACHING_POINT_LABELS.get(normalizedLabel)

      if (!canonicalLabel) {
        if (!currentSection) {
          currentSection = { label: 'Quick takeaway', body: [line] }
          sections.push(currentSection)
        } else {
          currentSection.body.push(line)
        }
        continue
      }

      currentSection = {
        label: rawLabel.includes(headingMatch[1].trim())
          ? rawLabel.replace(headingMatch[1].trim(), canonicalLabel)
          : canonicalLabel,
        body: rest ? [rest.trim()] : [],
      }
      sections.push(currentSection)
      continue
    }

    if (!currentSection) {
      currentSection = { label: 'Quick takeaway', body: [line] }
      sections.push(currentSection)
      continue
    }

    currentSection.body.push(line)
  }

  return sections.filter(section => section.body.some(line => line.trim()))
}

function buildTeachingBodyBlocks(lines: string[], keyPrefix: string): TeachingBodyBlock[] {
  const blocks: TeachingBodyBlock[] = []
  let bulletItems: string[] = []

  const flushBullets = () => {
    if (!bulletItems.length) return
    blocks.push({
      type: 'bullets',
      key: `${keyPrefix}-bullets-${blocks.length}`,
      items: bulletItems,
    })
    bulletItems = []
  }

  lines.forEach((line, index) => {
    if (!line) {
      flushBullets()
      blocks.push({ type: 'spacer', key: `${keyPrefix}-spacer-${index}` })
      return
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)$/)
    if (bulletMatch) {
      bulletItems.push(bulletMatch[1].trim())
      return
    }

    flushBullets()
    blocks.push({
      type: 'paragraph',
      key: `${keyPrefix}-paragraph-${index}`,
      text: line,
    })
  })

  flushBullets()
  return blocks
}

function renderTeachingBody(lines: string[], keyPrefix: string) {
  return buildTeachingBodyBlocks(lines, keyPrefix).map(block => {
    if (block.type === 'spacer') {
      return <div key={block.key} className="h-1" />
    }

    if (block.type === 'bullets') {
      return (
        <ul key={block.key} className="space-y-1.5 pl-5">
          {block.items.map((item, index) => (
            <li
              key={`${block.key}-${index}`}
              className="font-serif text-[15px] leading-6 tracking-[-0.01em] text-[#102018]"
            >
              {renderFormattedLine(item, `${block.key}-item-${index}`)}
            </li>
          ))}
        </ul>
      )
    }

    return (
      <p
        key={block.key}
        className="font-serif text-[15px] leading-6 tracking-[-0.01em] text-[#102018]"
      >
        {renderFormattedLine(block.text, `${block.key}-text`)}
      </p>
    )
  })
}
