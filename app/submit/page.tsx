'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'
type SubmissionStatus = 'pending' | 'accepted' | 'needs_edits' | 'rejected' | 'scheduled'
type SubmissionLookup = {
  id: string
  contributor_name: string | null
  status: SubmissionStatus
  scheduled_date: string | null
  level: Level
  category: string | null
  created_at: string
}

const SUBMISSION_LOOKUP_KEY = 'orthodle_last_submission_code'

export default function SubmitCasePage() {
  const [showFullSubmission, setShowFullSubmission] = useState(false)
  const [ideaName, setIdeaName] = useState('')
  const [ideaLevel, setIdeaLevel] = useState<'any' | Level>('any')
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaDetails, setIdeaDetails] = useState('')
  const [ideaStatus, setIdeaStatus] = useState('')
  const [submittingIdea, setSubmittingIdea] = useState(false)
  const [contributorName, setContributorName] = useState('')
  const [level, setLevel] = useState<Level>('med_student')
  const [category, setCategory] = useState('')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState('')
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [imageUrl2, setImageUrl2] = useState('')
  const [imageCredit2, setImageCredit2] = useState('')
  const [imageRevealClue2, setImageRevealClue2] = useState('none')
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [clue4, setClue4] = useState('')
  const [clue5, setClue5] = useState('')
  const [clue6, setClue6] = useState('')
  const [teachingPoint, setTeachingPoint] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lookupCode, setLookupCode] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')
  const [lookupResult, setLookupResult] = useState<SubmissionLookup | null>(null)

  useEffect(() => {
    const savedCode = window.localStorage.getItem(SUBMISSION_LOOKUP_KEY)
    if (!savedCode) return

    setLookupCode(savedCode)
    void checkSubmissionStatus(savedCode)
  }, [])

  async function uploadImage(file: File) {
    setStatus('Uploading image...')

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error } = await supabase.storage.from('case-images').upload(fileName, file)

    if (error) {
      setStatus(`Image upload failed: ${error.message}`)
      return
    }

    const { data } = supabase.storage.from('case-images').getPublicUrl(fileName)
    setImageUrl(data.publicUrl)
    setStatus('Image uploaded.')
  }

  function clearForm() {
    setContributorName('')
    setLevel('med_student')
    setCategory('')
    setPrompt('')
    setAnswer('')
    setSynonyms('')
    setImageUrl('')
    setImageCredit('')
    setImageRevealClue('none')
    setImageUrl2('')
    setImageCredit2('')
    setImageRevealClue2('none')
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
    setTeachingPoint('')
  }

  function formatStatusLabel(value: SubmissionStatus) {
    if (value === 'needs_edits') return 'Needs edits'
    if (value === 'accepted') return 'Accepted'
    if (value === 'rejected') return 'Not selected'
    if (value === 'scheduled') return 'Scheduled'
    return 'Pending review'
  }

  function formatStatusDetail(submission: SubmissionLookup) {
    if (submission.status === 'scheduled' && submission.scheduled_date) {
      return `Scheduled for ${new Date(`${submission.scheduled_date}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`
    }

    if (submission.status === 'accepted') {
      return 'This case has been accepted into the review pipeline.'
    }

    if (submission.status === 'needs_edits') {
      return 'This case has promise and may need a few revisions before scheduling.'
    }

    if (submission.status === 'rejected') {
      return 'This submission will not be scheduled right now.'
    }

    return 'Your case is waiting in the review queue.'
  }

  async function checkSubmissionStatus(codeOverride?: string) {
    const trimmedCode = (codeOverride || lookupCode).trim()

    if (!trimmedCode) {
      setLookupStatus('Enter your submission code to check its status.')
      setLookupResult(null)
      return
    }

    setLookupStatus('Checking status...')

    const { data, error } = await supabase
      .from('case_submissions')
      .select('id, contributor_name, status, scheduled_date, level, category, created_at')
      .eq('id', trimmedCode)
      .maybeSingle()

    if (error || !data) {
      setLookupStatus('No submission was found with that code yet.')
      setLookupResult(null)
      return
    }

    setLookupResult(data as SubmissionLookup)
    setLookupStatus('')
    setLookupCode(data.id)
    window.localStorage.setItem(SUBMISSION_LOOKUP_KEY, data.id)
  }

  async function submitCase() {
    if (!category || !prompt || !answer) {
      setStatus('Please fill out the level, category, case prompt, and answer.')
      return
    }

    setSubmitting(true)
    setStatus('')

    const synonymArray = synonyms
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    const parsedImageRevealClue =
      imageUrl && imageRevealClue !== 'none' ? Number(imageRevealClue) : null
    const parsedImageRevealClue2 =
      imageUrl2 && imageRevealClue2 !== 'none' ? Number(imageRevealClue2) : null

    const { data, error } = await supabase
      .from('case_submissions')
      .insert({
      contributor_name: contributorName || null,
      level,
      category,
      prompt,
      answer,
      synonyms: synonymArray,
      image_url: imageUrl || null,
      image_credit: imageCredit || null,
      image_reveal_clue: parsedImageRevealClue,
      image_url_2: imageUrl2 || null,
      image_credit_2: imageCredit2 || null,
      image_reveal_clue_2: parsedImageRevealClue2,
      clue_1: clue1 || null,
      clue_2: clue2 || null,
      clue_3: clue3 || null,
      clue_4: clue4 || null,
      clue_5: clue5 || null,
      clue_6: clue6 || null,
      teaching_point: teachingPoint || null,
      })
      .select('id, contributor_name, status, scheduled_date, level, category, created_at')
      .single()

    setSubmitting(false)

    if (error) {
      setStatus(`Submission failed: ${error.message}`)
      return
    }

    clearForm()

    if (data) {
      window.localStorage.setItem(SUBMISSION_LOOKUP_KEY, data.id)
      setLookupCode(data.id)
      setLookupResult(data as SubmissionLookup)
      setLookupStatus('')
      setStatus(`Thanks — your case was submitted for review. Your code is ${data.id}.`)
      return
    }

    setStatus('Thanks — your case was submitted for review.')
  }

  async function submitIdea() {
    if (!ideaTitle.trim() || !ideaDetails.trim()) {
      setIdeaStatus('Add a short title and a few details for the idea.')
      return
    }

    setSubmittingIdea(true)
    setIdeaStatus('')

    const { error } = await supabase.from('case_ideas').insert({
      contributor_name: ideaName.trim() || null,
      suggested_level: ideaLevel === 'any' ? null : ideaLevel,
      title: ideaTitle.trim(),
      description: ideaDetails.trim(),
    })

    setSubmittingIdea(false)

    if (error) {
      setIdeaStatus(`Could not send idea: ${error.message}`)
      return
    }

    setIdeaName('')
    setIdeaLevel('any')
    setIdeaTitle('')
    setIdeaDetails('')
    setIdeaStatus('Thanks — your case idea was sent.')
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mt-5 rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm sm:mt-6 sm:p-5">
          <h2 className="mt-2 font-serif text-[24px] font-bold text-[#102018]">
            Recommend a case idea
          </h2>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Your Name
                <input
                  value={ideaName}
                  onChange={e => setIdeaName(e.target.value)}
                  placeholder="Optional"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Best Fit
                <select
                  value={ideaLevel}
                  onChange={e => setIdeaLevel(e.target.value as 'any' | Level)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                >
                  <option value="any">Any level</option>
                  <option value="med_student">Med Student</option>
                  <option value="resident">Resident</option>
                  <option value="attending">Attending</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Idea Title
              <input
                value={ideaTitle}
                onChange={e => setIdeaTitle(e.target.value)}
                placeholder="Paget's disease with incidental elevated alk phos"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Idea Details
              <textarea
                value={ideaDetails}
                onChange={e => setIdeaDetails(e.target.value)}
                rows={3}
                placeholder="A few lines on the concept, why it would be fun, key clue ideas, or imaging you have in mind..."
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <button
              type="button"
              onClick={submitIdea}
              disabled={submittingIdea}
              className="rounded-lg border border-[#ded7ca] bg-[#fbfaf7] px-5 py-3 text-sm font-semibold text-[#102018] transition hover:bg-white disabled:opacity-60"
            >
              {submittingIdea ? 'Sending idea...' : 'Send idea'}
            </button>

            {ideaStatus && <p className="break-words text-sm leading-6 text-[#637268]">{ideaStatus}</p>}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm sm:mt-6 sm:p-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                Full submission
              </div>
              <h2 className="mt-2 font-serif text-[24px] font-bold text-[#102018]">
                Build the full case
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#637268]">
                Use the full form if you want to submit the whole stem, answer, clues, and optional imaging.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowFullSubmission(prev => !prev)}
              className="shrink-0 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
            >
              {showFullSubmission ? 'Hide' : 'Show'}
            </button>
          </div>

          {showFullSubmission && (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Your Name
              <input
                value={contributorName}
                onChange={e => setContributorName(e.target.value)}
                placeholder="Optional credit name"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Level
              <select
                value={level}
                onChange={e => setLevel(e.target.value as Level)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              >
                <option value="med_student">Med Student</option>
                <option value="resident">Resident</option>
                <option value="attending">Attending</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Category
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Wrist / nerve"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Case Prompt
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                placeholder="Write the case stem..."
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Answer
              <input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Carpal tunnel syndrome"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Synonyms
              <input
                value={synonyms}
                onChange={e => setSynonyms(e.target.value)}
                placeholder="CTS, carpal tunnel, median nerve compression"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Question Image URL
              <input
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="Paste a hosted x-ray or image URL"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Upload X-ray / Image
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadImage(file)
                }}
                className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Image Reveal
              <select
                value={imageRevealClue}
                onChange={e => setImageRevealClue(e.target.value)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              >
                <option value="none">Show immediately</option>
                <option value="1">Reveal with Clue 1</option>
                <option value="2">Reveal with Clue 2</option>
                <option value="3">Reveal with Clue 3</option>
                <option value="4">Reveal with Clue 4</option>
                <option value="5">Reveal with Clue 5</option>
                <option value="6">Reveal with Clue 6</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Image Credit
              <input
                value={imageCredit}
                onChange={e => setImageCredit(e.target.value)}
                placeholder="Optional small credit shown under the image"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Second Image URL
              <input
                value={imageUrl2}
                onChange={e => setImageUrl2(e.target.value)}
                placeholder="Paste a second hosted image URL"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Second Image Reveal
              <select
                value={imageRevealClue2}
                onChange={e => setImageRevealClue2(e.target.value)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              >
                <option value="none">Show immediately</option>
                <option value="1">Reveal with Clue 1</option>
                <option value="2">Reveal with Clue 2</option>
                <option value="3">Reveal with Clue 3</option>
                <option value="4">Reveal with Clue 4</option>
                <option value="5">Reveal with Clue 5</option>
                <option value="6">Reveal with Clue 6</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Second Image Credit
              <input
                value={imageCredit2}
                onChange={e => setImageCredit2(e.target.value)}
                placeholder="Optional small credit shown under the second image"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue 1
              <input
                value={clue1}
                onChange={e => setClue1(e.target.value)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue 2
              <input
                value={clue2}
                onChange={e => setClue2(e.target.value)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue 3
              <input
                value={clue3}
                onChange={e => setClue3(e.target.value)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue 4
              <input
                value={clue4}
                onChange={e => setClue4(e.target.value)}
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue 5
              <input
                value={clue5}
                onChange={e => setClue5(e.target.value)}
                placeholder="Optional"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Clue 6
              <input
                value={clue6}
                onChange={e => setClue6(e.target.value)}
                placeholder="Optional"
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[#637268]">
              Teaching Point
              <textarea
                value={teachingPoint}
                onChange={e => setTeachingPoint(e.target.value)}
                rows={4}
                placeholder="Add the teaching takeaway shown after the round is complete..."
                className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
              />
              <span className="text-xs font-normal text-[#8a948d]">
                Line breaks are preserved. Use `**bold**` and `*italics*` for emphasis.
              </span>
            </label>

            <button
              type="button"
              onClick={submitCase}
              disabled={submitting}
              className="rounded-lg bg-[#1f6448] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit case'}
            </button>

            {status && <p className="break-words text-sm leading-6 text-[#637268]">{status}</p>}
          </div>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
            Submission status
          </div>
          <h2 className="mt-2 font-serif text-[24px] font-bold text-[#102018]">
            Check your case
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#637268]">
            After you submit, keep your code handy so you can check whether your case is still pending, accepted, needs edits, or scheduled.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={lookupCode}
              onChange={e => setLookupCode(e.target.value)}
              placeholder="Paste your submission code"
              className="flex-1 rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
            />
            <button
              type="button"
              onClick={() => checkSubmissionStatus()}
              className="rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Check status
            </button>
          </div>

          {lookupStatus && <p className="mt-3 text-sm text-[#637268]">{lookupStatus}</p>}

          {lookupResult && (
            <div className="mt-4 rounded-xl border border-[#cfded4] bg-[#f7fbf8] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                    {lookupResult.contributor_name || 'Anonymous contributor'}
                  </div>
                  <div className="mt-1 font-serif text-[22px] font-bold text-[#102018]">
                    {formatStatusLabel(lookupResult.status)}
                  </div>
                </div>

                <div className="max-w-full rounded-full border border-[#cfded4] bg-white px-3 py-1 text-[11px] font-semibold text-[#315f4d]">
                  {(lookupResult.category || 'Case submission').trim()} ·{' '}
                  {lookupResult.level === 'med_student'
                    ? 'Med Student'
                    : lookupResult.level === 'resident'
                      ? 'Resident'
                      : 'Attending'}
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#637268]">
                {formatStatusDetail(lookupResult)}
              </p>

              <p className="mt-2 break-all text-[11px] uppercase tracking-[0.2em] text-[#8a948d]">
                Code: {lookupResult.id}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
