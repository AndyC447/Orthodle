'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EMPTY_EXAMPLES, EXAMPLE_SLOTS, exampleCaseHref, type ExampleCase, type ExampleSelection } from '@/lib/impact-examples'

export function ImpactExamples({ adminMode = false }: { adminMode?: boolean }) {
  const [selection, setSelection] = useState<ExampleSelection>({ ...EMPTY_EXAMPLES })
  const [draft, setDraft] = useState<ExampleSelection>({ ...EMPTY_EXAMPLES })
  const [cases, setCases] = useState<ExampleCase[]>([])
  const [choices, setChoices] = useState<ExampleCase[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/impact-examples', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (cancelled) return
        setSelection(data.selection)
        setDraft(data.selection)
        setCases(data.cases)
        if (adminMode) {
          const listResponse = await fetch('/api/impact-examples', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list', password: window.sessionStorage.getItem('orthodle_admin_password') }),
          })
          const list = await listResponse.json()
          if (!listResponse.ok) throw new Error(list.error)
          if (cancelled) return
          setChoices(list.cases)
        }
        if (!cancelled) setReady(true)
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load examples.')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [adminMode])

  async function save() {
    setSaving(true)
    setStatus('')
    try {
      const response = await fetch('/api/impact-examples', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', selection: draft, password: window.sessionStorage.getItem('orthodle_admin_password') }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setSelection({ ...draft })
      setCases(choices.filter(item => Object.values(draft).includes(item.id)))
      setStatus('Examples saved for all visitors.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save examples.')
    } finally { setSaving(false) }
  }

  const visible = EXAMPLE_SLOTS.flatMap(slot => {
    const item = cases.find(item => item.id === selection[slot.key])
    return item ? [{ ...slot, item }] : []
  })
  if (!adminMode && visible.length === 0) return null

  return (
    <section aria-label="Example cases" className="mt-4 border-t border-[#dce8e1] pt-4">
      <h2 className="font-serif text-[22px] font-bold text-[#102018]">Try an example</h2>
      <p className="mt-1 text-[13px] leading-6 text-[#637268]">
        Explore a featured case and earlier anatomy and classification questions.
      </p>
      {adminMode && (
        <div className="mt-3 rounded-[16px] border border-[#dfe5dd] bg-white p-3">
          <p className="text-[13px] leading-6 text-[#637268]">Choose the cases shown here. They stay the same until you change them. Only cases dated today or earlier are available.</p>
          <label className="mt-3 block text-[12px] font-bold text-[#102018]">
            Find a case
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search diagnosis, category, date, or question" className="mt-1 w-full rounded-lg border border-[#ded7ca] bg-white p-2 text-[13px] font-normal" />
          </label>
          {EXAMPLE_SLOTS.map(slot => (
            <label key={slot.key} className="mt-3 block text-[12px] font-bold text-[#102018]">
              {slot.label}
              <select disabled={!ready || saving} value={draft[slot.key] || ''} onChange={event => { setDraft(current => ({ ...current, [slot.key]: event.target.value || null })); setStatus('') }} className="mt-1 w-full rounded-lg border border-[#ded7ca] bg-white p-2 text-[13px] font-normal">
                <option value="">Not shown</option>
                {choices.filter(item => item.id === draft[slot.key] || `${item.case_date} ${item.answer} ${item.category} ${item.prompt} ${item.level}`.toLowerCase().includes(query.toLowerCase())).map(item => (
                  <option key={item.id} value={item.id}>{item.case_date} · {item.answer || item.category || 'Case'} · {item.level}</option>
                ))}
              </select>
              {choices.find(item => item.id === draft[slot.key]) && (
                <Link href={exampleCaseHref(choices.find(item => item.id === draft[slot.key])!)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] font-normal text-[#1f6448] underline">Preview selected case (new tab)</Link>
              )}
            </label>
          ))}
          <button type="button" disabled={!ready || saving} onClick={save} className="mt-3 rounded-lg bg-[#1f6448] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save examples'}</button>
          <p role="status" className="mt-2 text-[12px] text-[#637268]">{status || (!ready ? 'Loading examples…' : '')}</p>
        </div>
      )}
      <div className="mt-3 grid gap-3">
        {visible.map(({ key, label, action, item }) => (
          <article key={key} className="rounded-[16px] border border-[#dfe5dd] bg-white p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1f6448]">{label}</h3>
            <p className="mt-2 text-[11px] font-semibold text-[#637268]">{item.category} · {item.case_date}</p>
            <p className="mt-2 line-clamp-3 font-serif text-[16px] leading-6 text-[#102018]">{item.prompt || 'Open this case to explore the question and teaching points.'}</p>
            <Link href={exampleCaseHref(item)} className="mt-3 inline-flex rounded-lg bg-[#1f6448] px-3 py-2 text-[12px] font-bold text-white hover:bg-[#18543c]">{action}</Link>
          </article>
        ))}
      </div>
    </section>
  )
}
