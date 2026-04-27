'use client'

import { useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

export default function SubmitCasePage() {
  const [contributorName, setContributorName] = useState('')
  const [level, setLevel] = useState<Level>('med_student')
  const [category, setCategory] = useState('')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState('')
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [clue4, setClue4] = useState('')
  const [teachingPoint, setTeachingPoint] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setTeachingPoint('')
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

    const { error } = await supabase.from('case_submissions').insert({
      contributor_name: contributorName || null,
      level,
      category,
      prompt,
      answer,
      synonyms: synonymArray,
      image_url: imageUrl || null,
      image_credit: imageCredit || null,
      image_reveal_clue: parsedImageRevealClue,
      clue_1: clue1 || null,
      clue_2: clue2 || null,
      clue_3: clue3 || null,
      clue_4: clue4 || null,
      teaching_point: teachingPoint || null,
    })

    setSubmitting(false)

    if (error) {
      setStatus(`Submission failed: ${error.message}`)
      return
    }

    clearForm()
    setStatus('Thanks — your case was submitted for review.')
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
            Community Cases
          </div>
          <h1 className="mt-3 font-serif text-4xl font-bold text-[#102018]">
            Submit your own case
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#637268]">
            Share a case idea for Orthodle. You can include imaging, clues, a teaching point,
            and your name for credit if your case is used later.
          </p>
        </div>

        <section className="mt-6 rounded-2xl border border-[#ded7ca] bg-white p-5 shadow-sm">
          <div className="grid gap-3">
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

            {status && <p className="text-sm text-[#637268]">{status}</p>}
          </div>
        </section>
      </div>
    </main>
  )
}
