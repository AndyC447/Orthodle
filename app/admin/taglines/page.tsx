'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import {
  DEFAULT_LEVEL_TITLES,
  LEVEL_TITLE_CACHE_KEY,
  normalizeLevelTitles,
  type DisplayLevel,
} from '@/lib/level-display'
import { supabase } from '@/lib/supabase'

type Level = DisplayLevel
type HomeButtonKey = Level | 'groups'

type TaglineRow = {
  id?: string
  level: Level
  text: string
  updated_at?: string
}

const DEFAULT_TAGLINES: Record<Level, string> = {
  med_student: 'FOUNDATIONS',
  resident: 'MAKE THE CALL',
  attending: 'CONNECT THE DOTS',
}
const DEFAULT_GROUPS_TITLE = 'Groups'
const DEFAULT_GROUPS_SUBTITLE = 'COMPETE'

const LEVEL_ORDER: Level[] = ['med_student', 'resident', 'attending']
const PLAY_BOOTSTRAP_CACHE_KEY = 'orthodle_play_bootstrap_v1'

export default function AdminTaglinesPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [titles, setTitles] = useState<Record<Level, string>>(DEFAULT_LEVEL_TITLES)
  const [rows, setRows] = useState<Record<Level, string>>(DEFAULT_TAGLINES)
  const [groupsTitle, setGroupsTitle] = useState(DEFAULT_GROUPS_TITLE)
  const [groupsSubtitle, setGroupsSubtitle] = useState(DEFAULT_GROUPS_SUBTITLE)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadRows()
  }, [isUnlocked])

  async function loadRows() {
    const [{ data, error }, { data: titleData, error: titleError }] = await Promise.all([
      supabase
        .from('difficulty_taglines')
        .select('id, level, text, position, updated_at')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('level_display_settings')
        .select('level, title')
    ])

    if (error) {
      setStatus(`Could not load button subtitles: ${error.message}`)
      return
    }

    if (titleError) {
      setStatus(`Could not load case titles: ${titleError.message}`)
      return
    }

    const nextRows: Record<Level, string> = {
      med_student: '',
      resident: '',
      attending: '',
    }
    const nextTitles = { ...DEFAULT_LEVEL_TITLES }

    for (const level of LEVEL_ORDER) {
      const latestRow = (data || []).find(item => item.level === level)
      if (latestRow) {
        nextRows[level] = (latestRow.text || '').trim().toUpperCase()
      }

      const titleRow = (titleData || []).find(item => item.level === level && item.title?.trim())
      if (titleRow?.title) {
        nextTitles[level] = titleRow.title.trim()
      }
    }

    const groupsRow = (data || []).find(item => item.level === 'groups')
    const groupsTitleRow = (titleData || []).find(item => item.level === 'groups' && item.title?.trim())

    setRows(nextRows)
    setTitles(nextTitles)
    setGroupsSubtitle(groupsRow ? (groupsRow.text || '').trim().toUpperCase() : DEFAULT_GROUPS_SUBTITLE)
    setGroupsTitle(groupsTitleRow?.title?.trim() || DEFAULT_GROUPS_TITLE)
  }

  async function saveAll() {
    const payload = LEVEL_ORDER.map(level => ({
      level,
      text: (rows[level] || '').trim().toUpperCase(),
    }))
    const titlePayload = normalizeLevelTitles(titles)

    if (LEVEL_ORDER.some(level => !titlePayload[level].trim())) {
      setStatus('Each level needs a case title.')
      return
    }

    const nextGroupsTitle = groupsTitle.trim() || DEFAULT_GROUPS_TITLE
    const nextGroupsSubtitle = groupsSubtitle.trim().toUpperCase()

    for (const item of payload) {
      const { data: existingRows, error: existingError } = await supabase
        .from('difficulty_taglines')
        .select('id')
        .eq('level', item.level)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })

      if (existingError) {
        setStatus(`Could not load existing button subtitles: ${existingError.message}`)
        return
      }

      if (!existingRows || existingRows.length === 0) {
        const { error: insertError } = await supabase.from('difficulty_taglines').insert({
          level: item.level,
          text: item.text,
          position: 0,
        })

        if (insertError) {
          setStatus(`Could not save button subtitles: ${insertError.message}`)
          return
        }
        continue
      }

      const primaryId = existingRows[0].id
      const duplicateIds = existingRows.slice(1).map(row => row.id)

      const { error: updateError } = await supabase
        .from('difficulty_taglines')
        .update({
          text: item.text,
          position: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', primaryId)

      if (updateError) {
        setStatus(`Could not save button subtitles: ${updateError.message}`)
        return
      }

      if (duplicateIds.length > 0) {
        const { error: cleanupError } = await supabase
          .from('difficulty_taglines')
          .delete()
          .in('id', duplicateIds)

        if (cleanupError) {
          setStatus(`Saved, but could not clean old subtitle duplicates: ${cleanupError.message}`)
          return
        }
      }
    }

    for (const level of LEVEL_ORDER) {
      const { error: titleSaveError } = await supabase.from('level_display_settings').upsert(
        {
          level,
          title: titlePayload[level],
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'level',
        }
      )

      if (titleSaveError) {
        setStatus(`Could not save case titles: ${titleSaveError.message}`)
        return
      }
    }

    const { error: groupsTitleSaveError } = await supabase.from('level_display_settings').upsert(
      {
        level: 'groups',
        title: nextGroupsTitle,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'level',
      }
    )

    if (groupsTitleSaveError) {
      setStatus(`Could not save groups button title: ${groupsTitleSaveError.message}`)
      return
    }

    const { data: existingGroupsRows, error: existingGroupsError } = await supabase
      .from('difficulty_taglines')
      .select('id')
      .eq('level', 'groups')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })

    if (existingGroupsError) {
      setStatus(`Could not load existing groups button subtitle: ${existingGroupsError.message}`)
      return
    }

    if (!existingGroupsRows || existingGroupsRows.length === 0) {
      const { error: insertGroupsError } = await supabase.from('difficulty_taglines').insert({
        level: 'groups',
        text: nextGroupsSubtitle,
        position: 0,
      })

      if (insertGroupsError) {
        setStatus(`Could not save groups button subtitle: ${insertGroupsError.message}`)
        return
      }
    } else {
      const primaryId = existingGroupsRows[0].id
      const duplicateIds = existingGroupsRows.slice(1).map(row => row.id)

      const { error: updateGroupsError } = await supabase
        .from('difficulty_taglines')
        .update({
          text: nextGroupsSubtitle,
          position: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', primaryId)

      if (updateGroupsError) {
        setStatus(`Could not save groups button subtitle: ${updateGroupsError.message}`)
        return
      }

      if (duplicateIds.length > 0) {
        const { error: cleanupGroupsError } = await supabase
          .from('difficulty_taglines')
          .delete()
          .in('id', duplicateIds)

        if (cleanupGroupsError) {
          setStatus(`Saved, but could not clean old groups subtitle duplicates: ${cleanupGroupsError.message}`)
          return
        }
      }
    }

    window.sessionStorage.removeItem(PLAY_BOOTSTRAP_CACHE_KEY)
    window.localStorage.setItem(
      LEVEL_TITLE_CACHE_KEY,
      JSON.stringify({ ...titlePayload, groups: nextGroupsTitle })
    )
    setStatus('Case titles and button subtitles updated.')
    await loadRows()
  }

  function formatLevel(level: Level) {
    return titles[level] || DEFAULT_LEVEL_TITLES[level]
  }

  if (!authReady) {
    return (
      <main>
        <Header />
      </main>
    )
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#fbfaf7]">
        <Header />
        <div className="mx-auto max-w-xl px-6 py-12">
          <section className="rounded-2xl border border-[#ded7ca] bg-white p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin Access
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">
              Unlock admin first
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Open the main admin page first, then come back here to edit case titles and button subtitles.
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
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <div className="mx-auto max-w-4xl px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Case Titles & Subtitles
            </h1>
          </div>

          <Link
            href="/admin"
            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Back to admin
          </Link>
        </div>

        {status && <p className="mt-4 text-sm text-[#637268]">{status}</p>}

        <section className="mt-5 rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Daily captions
            </h2>
            <button
              type="button"
              onClick={() => void saveAll()}
              className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Save all
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {LEVEL_ORDER.map(level => (
              <div key={level} className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#102018]">
                    {formatLevel(level)}
                  </span>
                  <input
                    value={titles[level]}
                    onChange={e =>
                      setTitles(prev => ({
                        ...prev,
                        [level]: e.target.value,
                      }))
                    }
                    placeholder={`${DEFAULT_LEVEL_TITLES[level]} title`}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    Subtitle
                  </span>
                  <input
                    value={rows[level]}
                    onChange={e =>
                      setRows(prev => ({
                        ...prev,
                        [level]: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder={`${DEFAULT_TAGLINES[level]} or leave blank`}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                  />
                </label>
              </div>
            ))}
            <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#102018]">Groups</span>
                <input
                  value={groupsTitle}
                  onChange={e => setGroupsTitle(e.target.value)}
                  placeholder={DEFAULT_GROUPS_TITLE}
                  className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                  Subtitle
                </span>
                <input
                  value={groupsSubtitle}
                  onChange={e => setGroupsSubtitle(e.target.value.toUpperCase())}
                  placeholder={`${DEFAULT_GROUPS_SUBTITLE} or leave blank`}
                  className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
