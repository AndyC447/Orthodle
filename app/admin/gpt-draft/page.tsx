'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { todayISO } from '@/lib/utils'
import { ADMIN_CASE_DRAFT_KEY, GPT_DRAFT_PREVIOUS_EDITOR_KEY, GPT_DRAFT_SHELF_KEY, TEACHING_SECTIONS, caseClues, draftCase, protectedClueIndices, toEditorDraft, type GeneratedText, type RankedSource, type SavedDraft } from '@/lib/gpt-draft'

const SKIPPED_KEY = 'orthodle_gpt_skipped_sources_v1'
const field = 'w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2 text-sm leading-6 text-[#102018] focus:outline-none focus:ring-2 focus:ring-[#1f6448]/30'
const button = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#1f6448] transition hover:bg-[#f1f7f3] disabled:opacity-50'

export default function GptDraftPage() {
  const [ready, setReady] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [sources, setSources] = useState<RankedSource[]>([])
  const [selected, setSelected] = useState('')
  const [shelf, setShelf] = useState<SavedDraft[]>([])
  const [draft, setDraft] = useState<SavedDraft | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [foundational, setFoundational] = useState(true)
  const [showRecent, setShowRecent] = useState(false)
  const [direction, setDirection] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [generationReady, setGenerationReady] = useState(false)
  const [reviewed, setReviewed] = useState(false)

  async function api(body: object) {
    const response = await fetch('/api/admin/gpt-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, password: sessionStorage.getItem('orthodle_admin_password') || '' }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Request failed. Try again.')
    return result
  }

  useEffect(() => {
    const signedIn = sessionStorage.getItem('orthodle_admin_unlocked') === 'true'
    setUnlocked(signedIn)
    setReady(true)
    if (!signedIn) return
    try {
      const saved = JSON.parse(localStorage.getItem(GPT_DRAFT_SHELF_KEY) || '[]')
      if (Array.isArray(saved)) setShelf(saved.filter(d => d?.id && d?.source?.id && d?.text?.teaching).slice(0, 40))
      const hidden = JSON.parse(localStorage.getItem(SKIPPED_KEY) || '[]')
      if (Array.isArray(hidden)) setSkipped(hidden.filter(v => typeof v === 'string'))
    } catch { setError('The local draft shelf could not be restored.') }
    const params = new URLSearchParams(window.location.search)
    const suggested = params.get('date') || ''
    setDate(/^\d{4}-\d{2}-\d{2}$/.test(suggested) ? suggested : '')
    let cancelled = false
    setBusy('sources')
    api({ action: 'sources' }).then(data => {
      if (!cancelled) { setSources(data.sources); setGenerationReady(data.generationReady) }
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setBusy('') })
    return () => { cancelled = true }
  }, [])

  function persist(next: SavedDraft[]) {
    // Store first: a full/blocked browser store must not silently lose generated work.
    localStorage.setItem(GPT_DRAFT_SHELF_KEY, JSON.stringify(next.slice(0, 40)))
    setShelf(next.slice(0, 40))
  }

  function updateText(text: GeneratedText) {
    if (!draft) return
    const next = { ...draft, text }
    setDraft(next)
    setReviewed(false)
    try { persist([next, ...shelf.filter(d => d.id !== next.id)]) } catch { setError('Browser storage is full. Keep this page open and preview your draft before leaving.') }
  }

  async function generate() {
    if (!selected || busy) return
    setBusy('generate'); setError(''); setReviewed(false)
    try {
      const result = await api({ action: 'generate', sourceId: selected, direction, previousPrompt: draft?.source.id === selected ? draft.text.prompt : '' })
      setDraft(result.draft)
      persist([result.draft, ...shelf])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate draft.') }
    finally { setBusy('') }
  }

  function skip() {
    try {
      const next = [...new Set([...skipped, selected])]
      localStorage.setItem(SKIPPED_KEY, JSON.stringify(next)); setSkipped(next)
      if (draft?.source.id === selected) persist(shelf.map(d => d.id === draft.id ? { ...d, status: 'rejected' } : d))
      setSelected(''); setDraft(null); setReviewed(false)
    } catch { setError('Could not save the skip. Browser storage may be unavailable.') }
  }

  function rejectDraft() {
    if (!draft) return
    try {
      persist(shelf.map(d => d.id === draft.id ? { ...draft, status: 'rejected' } : d))
      setDraft(null)
      setReviewed(false)
    } catch { setError('Could not save the rejection. Browser storage may be unavailable.') }
  }

  function preview() {
    if (!draft) return
    try {
      const c = draftCase(draft.source, draft.text, date || todayISO())
      const payload = JSON.stringify({ savedAt: Date.now(), case: { ...c, id: `preview-gpt-${draft.id}` } })
      localStorage.setItem('orthodle_admin_case_preview_v1', payload)
      sessionStorage.setItem('orthodle_admin_case_preview_v1', payload)
      window.open(`/?preview=1&date=${c.case_date}&level=med_student`, '_blank', 'noopener,noreferrer')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open preview.') }
  }

  function useDraft() {
    if (!draft || !reviewed) return
    try {
      if (date <= todayISO()) throw new Error('Choose a future publish date. You can move it in the admin calendar before saving.')
      const editor = toEditorDraft(draft, date)
      const existing = localStorage.getItem(ADMIN_CASE_DRAFT_KEY)
      if (existing && !window.confirm('Load this draft into the case editor? Your current editor draft will be backed up and can be restored here.')) return
      if (existing) localStorage.setItem(GPT_DRAFT_PREVIOUS_EDITOR_KEY, existing)
      localStorage.setItem(ADMIN_CASE_DRAFT_KEY, JSON.stringify(editor))
      persist(shelf.map(d => d.id === draft.id ? { ...draft, status: 'used', usedDate: date } : d))
      window.location.assign('/admin')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not transfer the draft.') }
  }

  function restoreEditor() {
    const previous = localStorage.getItem(GPT_DRAFT_PREVIOUS_EDITOR_KEY)
    if (!previous) { setError('No previous editor draft was backed up on this browser.'); return }
    if (!window.confirm('Restore the previous editor draft? Generated variations remain on the GPT Draft shelf.')) return
    try { localStorage.setItem(ADMIN_CASE_DRAFT_KEY, previous); window.location.assign('/admin') } catch { setError('Could not restore the editor draft.') }
  }

  const recentIds = new Set(shelf.filter(d => Date.now() - Date.parse(d.generatedAt) < 30 * 86400000).map(d => d.source.id))
  const visible = sources.filter(s => (!foundational || s.foundational) && !skipped.includes(s.source.id) && (showRecent || !recentIds.has(s.source.id)) && `${s.source.answer} ${s.source.category} ${(s.source.synonyms || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const source = sources.find(s => s.source.id === selected)

  return <main className="app-surface min-h-screen"><Header /><div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin" className="text-sm font-semibold text-[#1f6448]">Back to admin</Link><h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">GPT Draft</h1><p className="mt-1 text-sm text-[#637268]">Proven diagnoses. Fresh presentations. Review, then schedule.</p></div><span className="rounded-full bg-[#eaf4ee] px-3 py-1 text-xs font-semibold text-[#1f6448]">Private draft workspace</span></div>
    {!ready ? <p>Loading workspace...</p> : !unlocked ? <p>Open <Link href="/admin" className="underline">admin</Link> and sign in to use GPT Draft.</p> : <>
      {error && <p role="alert" className="mb-4 rounded-xl bg-[#fff1e5] p-3 text-sm text-[#8a4526]">{error}</p>}
      {!busy && !generationReady && <p className="mb-4 text-sm text-[#637268]">Generation requires the server's OPENAI_API_KEY setting.</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4">
            <h2 className="font-serif text-xl font-bold">Source library</h2>
            <input aria-label="Search source diagnoses" placeholder="Search diagnoses" className={`${field} mt-3`} value={query} onChange={e => setQuery(e.target.value)} />
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={foundational} onChange={e => setFoundational(e.target.checked)} />Foundational diagnoses only</label>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={showRecent} onChange={e => setShowRecent(e.target.checked)} />Include sources drafted recently</label>
            <details className="mt-3 text-xs leading-5 text-[#637268]"><summary className="cursor-pointer">How ranking works</summary><p>Unique players, smoothed Great case feedback, and endorsement rate contribute to the score. Common diagnoses get a 20% preference. Diagnoses scheduled within 30/60 days receive a lower score. Reviews are counted once per reviewer; untagged reviews are not positive votes.</p></details>
            {skipped.length > 0 && <button className="mt-2 text-xs text-[#1f6448] underline" onClick={() => { localStorage.removeItem(SKIPPED_KEY); setSkipped([]) }}>Reset skipped sources</button>}
            <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto">
              {busy === 'sources' ? <p role="status" className="py-4 text-sm">Loading case performance...</p> : visible.length === 0 ? <p className="py-4 text-sm text-[#637268]">No matching sources. Try including more diagnoses or recently drafted cases.</p> : visible.map(s => <button disabled={Boolean(busy)} key={s.source.id} onClick={() => { setSelected(s.source.id); setDraft(null); setReviewed(false); setError('') }} className={`w-full rounded-xl p-3 text-left transition ${selected === s.source.id ? 'bg-[#eaf4ee] ring-1 ring-[#1f6448]' : 'bg-[#fcfbf8] hover:bg-[#f1f7f3]'}`}>
                <div className="font-semibold text-[#102018]">{s.source.answer}</div><div className="mt-1 text-xs text-[#637268]">{s.source.case_date} · Score {s.score.toFixed(2)}</div>
                <div className="mt-2 text-xs text-[#1f6448]">{s.plays} played · {s.great} Great case / {s.reviews} reviews</div>
                <div className="mt-1 text-xs text-[#637268]">{Math.round(s.reviewRate * 100)}% reviewed · Latest diagnosis: {s.lastDiagnosisDate}</div>
              </button>)}
            </div>
          </section>
          <section className="px-1"><h2 className="font-serif text-lg font-bold">Draft shelf</h2><p className="mt-1 text-xs text-[#637268]">Saved on this browser. Source history stays private.</p><div className="mt-2 space-y-1">{shelf.map(d => <button disabled={Boolean(busy)} key={d.id} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white" onClick={() => { setSelected(d.source.id); setDraft(d); setReviewed(false) }}>{d.source.answer}<span className="mt-0.5 block text-xs text-[#637268]">{new Date(d.generatedAt).toLocaleDateString()} · {d.status === 'used' ? `Sent to editor (${d.usedDate})` : d.status}</span></button>)}</div><button className="mt-3 text-xs text-[#1f6448] underline" onClick={restoreEditor}>Restore previous editor draft</button></section>
        </aside>
        <section className="min-w-0 rounded-2xl border border-[#e7e1d6] bg-white p-4 sm:p-5">
          {!selected ? <div className="py-12 text-center"><h2 className="font-serif text-2xl font-bold">Start with a case that worked</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#637268]">Choose a diagnosis from the library to see its source and generate a fresh variation.</p></div> : <>
            <div className="flex flex-wrap justify-between gap-3"><h2 className="font-serif text-2xl font-bold">{draft?.source.answer || source?.source.answer}</h2><button className={button} disabled={Boolean(busy)} onClick={skip}>Skip source</button></div>
            <details className="mt-3 rounded-xl bg-[#fcfbf8] p-3 text-sm leading-6"><summary className="cursor-pointer font-semibold text-[#637268]">Original case · {draft?.source.case_date || source?.source.case_date}</summary><p className="mt-2">{(draft?.source || source?.source)?.prompt}</p><ol className="ml-5 mt-2 list-decimal">{(draft?.source || source?.source) && caseClues(draft?.source || source!.source).map((c, i) => <li key={i}>{c}</li>)}</ol></details>
            <label className="mt-4 block text-sm font-semibold">Variation direction <span className="font-normal text-[#637268]">(optional)</span><input className={`${field} mt-1`} value={direction} maxLength={1200} onChange={e => setDirection(e.target.value)} placeholder="e.g. A recreational athlete presenting after a weekend game" /></label>
            <button className={`${button} mt-3 border-[#1f6448] bg-[#1f6448] text-white hover:bg-[#174d37]`} disabled={Boolean(busy) || !generationReady} onClick={generate}>{busy === 'generate' ? 'Generating draft...' : draft ? 'Generate another variation' : 'Generate draft'}</button>
            {draft && <fieldset disabled={Boolean(busy)} className="mt-6 min-w-0 space-y-4">
              <div className="rounded-xl bg-[#f1f7f3] p-3 text-sm leading-6"><p className="font-semibold">What changed</p><p>{draft.text.changes}</p><p className="mt-2 font-semibold">Review notes</p><p>{draft.text.reviewNotes}</p></div>
              <label className="block text-sm font-semibold">Presentation<textarea rows={4} className={`${field} mt-1`} value={draft.text.prompt} onChange={e => updateText({ ...draft.text, prompt: e.target.value })} /></label>
              <div className="grid gap-3 sm:grid-cols-2">{draft.text.clues.map((clue, i) => <label key={i} className="block text-sm font-semibold">Clue {i + 1}{protectedClueIndices(draft.source).includes(i) && <span className="ml-2 text-xs font-normal text-[#637268]">Image finding preserved</span>}<textarea rows={3} readOnly={protectedClueIndices(draft.source).includes(i)} className={`${field} mt-1 read-only:bg-[#fcfbf8]`} value={clue} onChange={e => updateText({ ...draft.text, clues: draft.text.clues.map((c, index) => index === i ? e.target.value : c) })} /></label>)}</div>
              <div><h3 className="text-sm font-semibold">Imaging findings</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#637268]">{draft.source.image_findings || 'No separate findings documented; source imaging clues are preserved.'}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">{[draft.source.image_url, draft.source.image_url_2, draft.source.learning_image_url, draft.source.learning_image_url_2].map((url, i) => url && <figure key={i} className="min-w-0"><img src={url} alt={i < 2 ? `Reused case image ${i + 1}` : `Reused teaching image ${i - 1}`} className="max-h-60 w-full rounded-lg object-contain" /><figcaption className="mt-1 text-center text-xs text-[#637268]">{[draft.source.image_credit, draft.source.image_credit_2, draft.source.learning_image_credit, draft.source.learning_image_credit_2][i]}</figcaption></figure>)}</div>
              <h3 className="font-serif text-xl font-bold">Teaching points</h3>
              {TEACHING_SECTIONS.map(section => <label key={section} className="block text-sm font-semibold">{section}<textarea rows={3} className={`${field} mt-1`} value={draft.text.teaching[section]} onChange={e => updateText({ ...draft.text, teaching: { ...draft.text.teaching, [section]: e.target.value } })} /></label>)}
              <p className="text-xs leading-5 text-[#637268]">Answer and accepted aliases, images, credits, captions, reveal timing, and reference links carry into the editor. You can edit those there.</p>
              <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1" />I reviewed the clues, teaching points, and compatibility with the reused images.</label>
              <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Publish date<input type="date" className={`${field} mt-1`} value={date} min={todayISO()} onChange={e => setDate(e.target.value)} /></label><button className={button} onClick={preview}>Preview full case</button><button className={`${button} border-[#1f6448] bg-[#1f6448] text-white hover:bg-[#174d37]`} disabled={!reviewed || !date || Boolean(busy)} onClick={useDraft}>Use Draft</button><button className="px-1 py-2 text-sm text-[#637268] underline" onClick={rejectDraft}>Reject draft</button></div>
              <p className="text-xs text-[#637268]">Use Draft opens the existing case editor. Review the calendar slot and save there to schedule it.</p>
            </fieldset>}
          </>}
        </section>
      </div>
    </>}
  </div></main>
}
