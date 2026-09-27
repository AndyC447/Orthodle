'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ImpactCasePicker } from '@/components/ImpactCasePicker'
import { EMPTY_EXAMPLES, EXAMPLE_SLOTS, exampleCaseHref, type ExampleCase, type ExampleSelection } from '@/lib/impact-examples'

export function ImpactExamples({ adminMode = false }: { adminMode?: boolean }) {
  const [selection, setSelection] = useState<ExampleSelection>({ ...EMPTY_EXAMPLES })
  const [draft, setDraft] = useState<ExampleSelection>({ ...EMPTY_EXAMPLES })
  const [cases, setCases] = useState<ExampleCase[]>([])
  const [choices, setChoices] = useState<ExampleCase[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let selectionLoaded = false
      try {
        const response = await fetch('/api/impact-examples', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (cancelled) return
        setSelection(data.selection)
        setDraft(data.selection)
        setCases(data.cases)
        selectionLoaded = true
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load saved examples.')
      }
      if (!adminMode || cancelled) return
      try {
        const response = await fetch('/api/impact-examples', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', password: window.sessionStorage.getItem('orthodle_admin_password') }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (cancelled) return
        setChoices(data.cases)
        setAuthorized(true)
        setReady(selectionLoaded)
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load cases.')
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
      {adminMode && authorized && (
        <div className="mt-3 rounded-[16px] border border-[#dfe5dd] bg-white p-3">
          <p className="text-[13px] leading-6 text-[#637268]">Choose the cases shown here. They stay the same until you change them. Only cases dated today or earlier are available.</p>
          {EXAMPLE_SLOTS.map(slot => (
            <ImpactCasePicker key={slot.key} label={slot.label} cases={choices} selectedId={draft[slot.key]} disabled={saving} onSelect={id => { setDraft(current => ({ ...current, [slot.key]: id })); setStatus('') }} />
          ))}
          {loadError && <p role="alert" className="mt-3 text-[12px] text-[#a24d24]">{loadError} Saving is disabled until saved selections can be loaded. Reload after setup.</p>}
          <button type="button" disabled={!ready || saving} onClick={save} className="mt-3 rounded-lg bg-[#1f6448] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save examples'}</button>
          <p role="status" className="mt-2 text-[12px] text-[#637268]">{status}</p>
        </div>
      )}
      {adminMode && !authorized && <p role="status" className="mt-3 text-[12px] text-[#637268]">{status || 'Checking admin access…'} <Link href="/admin" className="underline">Admin sign-in</Link></p>}
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
