'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  getSurveyLevelScopeLabel,
  getSurveyPlacementLabel,
  normalizeSurveyOptions,
  type SiteSurveyRow,
  type SiteSurveyResponseRow,
  type SurveyLevelScope,
  type SurveyPlacement,
} from '@/lib/site-surveys'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
import { todayISO } from '@/lib/utils'

const tomorrow = (() => {
  const base = new Date(`${todayISO()}T12:00:00`)
  base.setDate(base.getDate() + 1)
  return base.toISOString().slice(0, 10)
})()

const DEFAULT_SURVEY_QUESTION = 'What would help Orthodle feel more useful?'
const DEFAULT_SURVEY_OPTIONS = ['More case variety', 'More anatomy quizzes', 'More group features']

function SurveyAdminPage() {
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [status, setStatus] = useState('')
  const [surveys, setSurveys] = useState<SiteSurveyRow[]>([])
  const [question, setQuestion] = useState(DEFAULT_SURVEY_QUESTION)
  const [options, setOptions] = useState<string[]>(DEFAULT_SURVEY_OPTIONS)
  const [placement, setPlacement] = useState<SurveyPlacement>('homepage_header')
  const [levelScope, setLevelScope] = useState<SurveyLevelScope>('all')
  const [startDate, setStartDate] = useState(tomorrow)
  const [endDate, setEndDate] = useState(tomorrow)
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadSurveys()
  }, [isUnlocked])

  async function unlockAdmin() {
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

    window.sessionStorage.setItem('orthodle_admin_unlocked', 'true')
    window.sessionStorage.setItem('orthodle_admin_password', trimmedPassword)
    setIsUnlocked(true)
    setPassword('')
  }

  function resetForm() {
    setEditingSurveyId(null)
    setQuestion(DEFAULT_SURVEY_QUESTION)
    setOptions(DEFAULT_SURVEY_OPTIONS)
    setPlacement('homepage_header')
    setLevelScope('all')
    setStartDate(tomorrow)
    setEndDate(tomorrow)
  }

  async function loadSurveys() {
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
    const { data, error } = await supabase
      .from('site_surveys')
      .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setStatus(
        error.message.includes('relation') || error.message.includes('does not exist')
          ? 'Surveys are not set up yet. Run the new SQL once, then try again.'
          : `Could not load surveys: ${error.message}`
      )
      setSurveys([])
      return
    }

    const loadedSurveys = ((data as SiteSurveyRow[] | null) || []).map(item => ({
      ...item,
      options: normalizeSurveyOptions(item.options || []),
    }))

    if (loadedSurveys.length === 0) {
      setSurveys([])
      return
    }

    const surveyIds = loadedSurveys.map(item => item.id)
    const { data: responseData } = await supabase
      .from('site_survey_responses')
      .select('survey_id, response, session_id')
      .in('survey_id', surveyIds)

    const filteredResponses = filterExcludedSessionRows(
      (responseData as SiteSurveyResponseRow[] | null) || [],
      excludedSessionIdSet
    )

    const countsBySurvey = new Map<string, Record<string, number>>()
    const totalsBySurvey = new Map<string, number>()

    for (const survey of loadedSurveys) {
      countsBySurvey.set(
        survey.id,
        Object.fromEntries((survey.options || []).map(option => [option, 0]))
      )
      totalsBySurvey.set(survey.id, 0)
    }

    for (const row of filteredResponses) {
      const counts = countsBySurvey.get(row.survey_id)
      if (!counts) continue
      counts[row.response] = (counts[row.response] || 0) + 1
      totalsBySurvey.set(row.survey_id, (totalsBySurvey.get(row.survey_id) || 0) + 1)
    }

    setSurveys(
      loadedSurveys.map(item => ({
        ...item,
        response_counts: countsBySurvey.get(item.id) || {},
        total_responses: totalsBySurvey.get(item.id) || 0,
      }))
    )
  }

  async function saveSurvey() {
    const trimmedQuestion = question.trim()
    const normalizedOptions = normalizeSurveyOptions(options)

    if (!trimmedQuestion || normalizedOptions.length < 2) {
      setStatus('Add a question and at least two answer choices before saving.')
      return
    }

    setSaving(true)
    setStatus('')

    const payload = {
      question: trimmedQuestion,
      options: normalizedOptions,
      placement,
      level_scope: placement === 'after_case' ? levelScope : 'all',
      start_date: startDate,
      end_date: endDate || null,
    }

    const result = editingSurveyId
      ? await supabase.from('site_surveys').update(payload).eq('id', editingSurveyId)
      : await supabase.from('site_surveys').insert(payload)

    setSaving(false)

    if (result.error) {
      setStatus(
        result.error.message.includes('relation') || result.error.message.includes('does not exist')
          ? 'Surveys are not set up yet. Run the new SQL once, then try again.'
          : `Could not save the survey: ${result.error.message}`
      )
      return
    }

    setStatus(editingSurveyId ? 'Survey updated.' : 'Survey scheduled.')
    resetForm()
    await loadSurveys()
  }

  function editSurvey(item: SiteSurveyRow) {
    setEditingSurveyId(item.id)
    setQuestion(item.question)
    setOptions(normalizeSurveyOptions(item.options || []))
    setPlacement(item.placement)
    setLevelScope(item.level_scope || 'all')
    setStartDate(item.start_date)
    setEndDate(item.end_date || item.start_date)
    setStatus('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteSurvey(id: string) {
    const { error } = await supabase.from('site_surveys').delete().eq('id', id)

    if (error) {
      setStatus(
        error.message.includes('relation') || error.message.includes('does not exist')
          ? 'Surveys are not set up yet. Run the new SQL once, then try again.'
          : `Could not delete the survey: ${error.message}`
      )
      return
    }

    if (editingSurveyId === id) {
      resetForm()
    }

    setStatus('Survey deleted.')
    setSurveys(prev => prev.filter(item => item.id !== id))
  }

  const placementSummary = useMemo(() => {
    return {
      homepage: surveys.filter(item => item.placement === 'homepage_header').length,
      group: surveys.filter(item => item.placement === 'group_header').length,
      postCase: surveys.filter(item => item.placement === 'after_case').length,
    }
  }, [surveys])

  if (!authReady) {
    return <main className="app-surface min-h-screen" />
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8">
        {!isUnlocked ? (
          <section className="mx-auto max-w-md rounded-[28px] border border-[#e7e1d6] bg-white p-6 shadow-[0_16px_36px_rgba(16,32,24,0.06)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">Survey Manager</h1>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Schedule surveys for the homepage, groups page, or after-case flow.
            </p>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void unlockAdmin()}
              placeholder="Admin password"
              className="mt-5 w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-3 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
            />
            {authError ? <p className="mt-2 text-sm text-[#a24d24]">{authError}</p> : null}
            <button
              type="button"
              onClick={() => void unlockAdmin()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-[#1f6448] bg-[#1f6448] px-4 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Unlock
            </button>
          </section>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                  Admin
                </div>
                <h1 className="mt-1 font-serif text-3xl font-bold text-[#102018]">Survey Manager</h1>
                <p className="mt-2 text-sm leading-6 text-[#637268]">
                  Build once, choose where it appears, and track the responses in one place.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#ded7ca] bg-white px-4 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                >
                  Back to admin
                </Link>
              </div>
            </div>

            {status ? (
              <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-4 py-3 text-sm text-[#355542]">
                {status}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e7e1d6] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Home page</div>
                <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">{placementSummary.homepage}</div>
              </div>
              <div className="rounded-2xl border border-[#e7e1d6] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Groups header</div>
                <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">{placementSummary.group}</div>
              </div>
              <div className="rounded-2xl border border-[#e7e1d6] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">After case</div>
                <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">{placementSummary.postCase}</div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.35fr]">
              <section className="rounded-[28px] border border-[#e7e1d6] bg-white p-4 shadow-[0_16px_34px_rgba(16,32,24,0.05)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                      {editingSurveyId ? 'Edit survey' : 'Create survey'}
                    </div>
                    <h2 className="mt-1 font-serif text-2xl font-bold text-[#102018]">Survey setup</h2>
                  </div>
                  {editingSurveyId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-[#637268] transition hover:bg-white"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Question</span>
                    <textarea
                      value={question}
                      onChange={event => setQuestion(event.target.value)}
                      rows={3}
                      placeholder="What do you want to ask?"
                      className="mt-1.5 w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-3 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                    />
                  </label>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Answer choices</span>
                      <button
                        type="button"
                        onClick={() => setOptions(prev => [...prev, `Option ${prev.length + 1}`])}
                        className="rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        Add choice
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {options.map((option, index) => (
                        <div key={`option-${index}`} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={option}
                            onChange={event =>
                              setOptions(prev =>
                                prev.map((existing, optionIndex) =>
                                  optionIndex === index ? event.target.value : existing
                                )
                              )
                            }
                            placeholder={`Choice ${index + 1}`}
                            className="w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                          />
                          {options.length > 2 ? (
                            <button
                              type="button"
                              onClick={() => setOptions(prev => prev.filter((_, optionIndex) => optionIndex !== index))}
                              className="rounded-full border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-xs font-semibold text-[#a24d24] transition hover:bg-[#fff4e8]"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Placement</span>
                      <select
                        value={placement}
                        onChange={event => setPlacement(event.target.value as SurveyPlacement)}
                        className="mt-1.5 w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-3 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                      >
                        <option value="homepage_header">Home page header</option>
                        <option value="group_header">Groups header</option>
                        <option value="after_case">After a case</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">After-case scope</span>
                      <select
                        value={levelScope}
                        onChange={event => setLevelScope(event.target.value as SurveyLevelScope)}
                        disabled={placement !== 'after_case'}
                        className="mt-1.5 w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-3 text-sm text-[#102018] outline-none transition disabled:cursor-not-allowed disabled:opacity-50 focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                      >
                        <option value="all">All cases</option>
                        <option value="med_student">Med Student only</option>
                        <option value="resident">Resident only</option>
                        <option value="attending">Anatomy only</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Start date</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={event => setStartDate(event.target.value)}
                        className="mt-1.5 w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-3 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">End date</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={event => setEndDate(event.target.value)}
                        className="mt-1.5 w-full rounded-2xl border border-[#ded7ca] bg-[#fcfbf8] px-4 py-3 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">Preview</div>
                    <p className="mt-2 text-sm leading-6 text-[#102018]">
                      {question.trim() || 'Your scheduled survey will preview here.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {normalizeSurveyOptions(options).map(option => (
                        <div
                          key={option}
                          className="rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018]"
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#637268]">
                      {getSurveyPlacementLabel(placement)}
                      {placement === 'after_case' ? ` · ${getSurveyLevelScopeLabel(levelScope)}` : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void saveSurvey()}
                    disabled={saving}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#1f6448] bg-[#1f6448] px-4 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {editingSurveyId ? 'Update survey' : 'Schedule survey'}
                  </button>
                </div>
              </section>

              <section className="rounded-[28px] border border-[#e7e1d6] bg-white p-4 shadow-[0_16px_34px_rgba(16,32,24,0.05)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                      Scheduled
                    </div>
                    <h2 className="mt-1 font-serif text-2xl font-bold text-[#102018]">Survey stats</h2>
                  </div>
                  <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    {surveys.length} total
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {surveys.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-6 text-sm text-[#637268]">
                      No surveys scheduled yet.
                    </div>
                  ) : (
                    surveys.map(item => (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] px-4 py-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                                {getSurveyPlacementLabel(item.placement)}
                              </span>
                              {item.placement === 'after_case' ? (
                                <span className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                                  {getSurveyLevelScopeLabel(item.level_scope)}
                                </span>
                              ) : null}
                            </div>
                            <h3 className="mt-2 text-[15px] font-semibold leading-6 text-[#102018]">{item.question}</h3>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8a948d]">
                              {item.start_date}
                              {item.end_date ? ` → ${item.end_date}` : ''}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => editSurvey(item)}
                              className="rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSurvey(item.id)}
                              className="rounded-full border border-[#ead9b7] bg-[#fffaf1] px-3 py-1.5 text-xs font-semibold text-[#a24d24] transition hover:bg-[#fff4e8]"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {(item.options || []).map(option => (
                            <div key={option} className="rounded-2xl border border-[#ded7ca] bg-white px-3 py-3 text-center">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                                {option}
                              </div>
                              <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                                {item.response_counts?.[option] ?? 0}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 text-sm text-[#637268]">
                          {item.total_responses || 0} total response{item.total_responses === 1 ? '' : 's'}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default SurveyAdminPage
