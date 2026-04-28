'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { normalizeAnswer, ORTHO_DIAGNOSIS_BANK } from '@/lib/utils'

type DiagnosisChoiceRow = {
  id: string
  label: string
  created_at: string
}

type CaseAnswerRow = {
  id: string
  answer: string
}

type UnifiedChoiceRow = {
  key: string
  label: string
  normalized: string
  source: 'built_in' | 'case' | 'custom'
  editable: boolean
  removable: boolean
  id?: string
}

export default function AdminAnswerChoicesPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [choices, setChoices] = useState<DiagnosisChoiceRow[]>([])
  const [caseAnswers, setCaseAnswers] = useState<CaseAnswerRow[]>([])
  const [newChoice, setNewChoice] = useState('')
  const [batchChoices, setBatchChoices] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadChoices()
    void loadCaseAnswers()
  }, [isUnlocked])

  async function loadChoices() {
    const { data, error } = await supabase
      .from('diagnosis_choices')
      .select('*')
      .order('label', { ascending: true })

    if (error) {
      setStatus(`Could not load answer choices: ${error.message}`)
      return
    }

    setChoices((data || []) as DiagnosisChoiceRow[])
  }

  async function loadCaseAnswers() {
    const { data, error } = await supabase
      .from('cases')
      .select('id, answer')
      .order('answer', { ascending: true })

    if (error) {
      setStatus(`Could not load case answers: ${error.message}`)
      return
    }

    setCaseAnswers(((data || []).filter(item => item.answer?.trim())) as CaseAnswerRow[])
  }

  const allChoiceRows = useMemo(() => {
    const byNormalized = new Map<string, UnifiedChoiceRow>()

    for (const label of ORTHO_DIAGNOSIS_BANK) {
      const normalized = normalizeAnswer(label)
      if (!normalized || byNormalized.has(normalized)) continue
      byNormalized.set(normalized, {
        key: `built-in-${normalized}`,
        label,
        normalized,
        source: 'built_in',
        editable: false,
        removable: false,
      })
    }

    for (const item of caseAnswers) {
      const label = item.answer.trim()
      const normalized = normalizeAnswer(label)
      if (!normalized || byNormalized.has(normalized)) continue
      byNormalized.set(normalized, {
        key: `case-${item.id}`,
        label,
        normalized,
        source: 'case',
        editable: false,
        removable: false,
      })
    }

    for (const item of choices) {
      const label = item.label.trim()
      const normalized = normalizeAnswer(label)
      if (!normalized) continue

      const existing = byNormalized.get(normalized)
      if (existing) {
        if (existing.source !== 'custom') continue
      }

      byNormalized.set(normalized, {
        key: `custom-${item.id}`,
        id: item.id,
        label,
        normalized,
        source: 'custom',
        editable: true,
        removable: true,
      })
    }

    return Array.from(byNormalized.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [caseAnswers, choices])

  const normalizedLabels = useMemo(
    () => new Set(allChoiceRows.map(item => item.normalized)),
    [allChoiceRows]
  )

  function sourceLabel(source: UnifiedChoiceRow['source']) {
    if (source === 'built_in') return 'Built-in'
    if (source === 'case') return 'Case answer'
    return 'Custom'
  }

  async function addSingleChoice() {
    const label = newChoice.trim()
    if (!label) {
      setStatus('Enter an answer choice to add.')
      return
    }

    if (normalizedLabels.has(normalizeAnswer(label))) {
      setStatus('That answer choice already exists in the master list.')
      return
    }

    const { error } = await supabase.from('diagnosis_choices').insert({ label })

    if (error) {
      setStatus(`Could not add answer choice: ${error.message}`)
      return
    }

    setNewChoice('')
    setStatus('Answer choice added.')
    await loadChoices()
  }

  async function addBatchChoices() {
    const labels = Array.from(
      new Set(
        batchChoices
          .split('\n')
          .map(item => item.trim())
          .filter(Boolean)
      )
    )

    if (labels.length === 0) {
      setStatus('Paste at least one answer choice to add.')
      return
    }

    const uniqueLabels = labels.filter(label => !normalizedLabels.has(normalizeAnswer(label)))
    const skippedCount = labels.length - uniqueLabels.length

    if (uniqueLabels.length === 0) {
      setStatus('All pasted answer choices already exist in the master list.')
      return
    }

    const { error } = await supabase
      .from('diagnosis_choices')
      .insert(uniqueLabels.map(label => ({ label })))

    if (error) {
      setStatus(`Could not add batch choices: ${error.message}`)
      return
    }

    setBatchChoices('')
    setStatus(
      `${uniqueLabels.length} answer choice${uniqueLabels.length === 1 ? '' : 's'} added${skippedCount > 0 ? `, ${skippedCount} skipped as duplicates` : ''}.`
    )
    await loadChoices()
  }

  async function updateChoice(id: string, label: string) {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      setStatus('Answer choices cannot be blank.')
      return
    }

    const normalized = normalizeAnswer(trimmedLabel)
    const existing = allChoiceRows.find(item => item.normalized === normalized && item.id !== id)
    if (existing) {
      setStatus(`That answer choice already exists as a ${sourceLabel(existing.source).toLowerCase()}.`)
      return
    }

    const { error } = await supabase
      .from('diagnosis_choices')
      .update({ label: trimmedLabel })
      .eq('id', id)

    if (error) {
      setStatus(`Could not update answer choice: ${error.message}`)
      return
    }

    setStatus('Answer choice updated.')
    await loadChoices()
  }

  async function removeChoice(id: string) {
    const { error } = await supabase.from('diagnosis_choices').delete().eq('id', id)

    if (error) {
      setStatus(`Could not remove answer choice: ${error.message}`)
      return
    }

    setStatus('Answer choice removed.')
    await loadChoices()
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
              Open the main admin page first, then come back here to manage answer choices.
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

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Answer Choices
            </h1>
            <p className="mt-1.5 text-sm text-[#637268]">
              View the full answer universe and manage custom diagnosis choices in one place.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Back to admin
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Add choices
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                  Single add
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newChoice}
                    onChange={e => setNewChoice(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSingleChoice()}
                    placeholder="Add one diagnosis"
                    className="min-w-0 flex-1 rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                  />
                  <button
                    type="button"
                    onClick={addSingleChoice}
                    className="rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                  Batch add
                </div>
                <textarea
                  value={batchChoices}
                  onChange={e => setBatchChoices(e.target.value)}
                  placeholder={`Paste one diagnosis per line
Osteosarcoma
Ewing sarcoma
Chondrosarcoma`}
                  rows={8}
                  className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                />
                <button
                  type="button"
                  onClick={addBatchChoices}
                  className="mt-2 w-full rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
                >
                  Add batch
                </button>
              </div>

              {status && (
              <p className="text-sm text-[#637268]">{status}</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-xl font-bold text-[#102018]">
                All possible answers
              </h2>
              <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                {allChoiceRows.length} total
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-[#e7e1d6]">
              <div className="grid grid-cols-[minmax(0,1fr)_110px_92px_100px] border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                <div>Diagnosis</div>
                <div className="text-center">Source</div>
                <div className="text-center">Save</div>
                <div className="text-center">Remove</div>
              </div>

              <div className="max-h-[620px] overflow-y-auto">
                {allChoiceRows.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-[#637268]">
                    No answer choices found yet.
                  </div>
                ) : (
                  allChoiceRows.map(item => (
                    <div
                      key={item.key}
                      className="grid grid-cols-[minmax(0,1fr)_110px_92px_100px] items-center gap-2 border-b border-[#f1ece2] px-3 py-2.5 last:border-b-0"
                    >
                      {item.editable ? (
                        <input
                          type="text"
                          value={item.label}
                          onChange={e =>
                            setChoices(prev =>
                              prev.map(choice =>
                                choice.id === item.id
                                  ? { ...choice, label: e.target.value }
                                  : choice
                              )
                            )
                          }
                          className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                        />
                      ) : (
                        <div className="rounded-lg border border-[#ebe5db] bg-[#fbfaf7] px-3 py-2 text-sm text-[#102018]">
                          {item.label}
                        </div>
                      )}
                      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                        {sourceLabel(item.source)}
                      </div>
                      {item.editable ? (
                        <button
                          type="button"
                          onClick={() => updateChoice(item.id!, item.label)}
                          className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
                        >
                          Save
                        </button>
                      ) : (
                        <div className="text-center text-[11px] text-[#9aa39c]">—</div>
                      )}
                      {item.removable ? (
                        <button
                          type="button"
                          onClick={() => removeChoice(item.id!)}
                          className="rounded-lg border border-[#f0d7c8] bg-[#fff1e8] px-3 py-2 text-sm font-semibold text-[#a24d24] transition hover:bg-[#ffe8da]"
                        >
                          Remove
                        </button>
                      ) : (
                        <div className="text-center text-[11px] text-[#9aa39c]">—</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
