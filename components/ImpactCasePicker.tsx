'use client'

import { useState } from 'react'
import Link from 'next/link'
import { exampleCaseHref, type ExampleCase } from '@/lib/impact-examples'
import { todayISO } from '@/lib/utils'

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function ImpactCasePicker({ label, cases, selectedId, disabled, onSelect }: {
  label: string
  cases: ExampleCase[]
  selectedId: string | null
  disabled: boolean
  onSelect: (id: string | null) => void
}) {
  const selected = cases.find(item => item.id === selectedId)
  const [date, setDate] = useState(selected?.case_date || cases[0]?.case_date || todayISO())
  const weekStart = shiftDate(date, -new Date(`${date}T12:00:00Z`).getUTCDay())
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index))
  const available = cases.filter(item => item.case_date === date)
  const levelLabels: Record<string, string> = { med_student: 'Medical student', resident: 'Resident', attending: 'Attending / anatomy' }
  return (
    <fieldset disabled={disabled} className="mt-4 min-w-0 rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-2.5">
      <legend className="px-1 text-[12px] font-bold text-[#102018]">{label}</legend>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label={`${label}: previous week`} onClick={() => setDate(shiftDate(date, -7))} className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[12px]">{'<'}</button>
        <label className="text-center text-[11px] font-bold text-[#637268]">
          Browse date
          <input aria-label={`${label}: browse date`} type="date" max={todayISO()} value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} className="block max-w-full rounded-lg border border-[#ded7ca] bg-white px-2 py-1" />
        </label>
        <button type="button" aria-label={`${label}: next week`} disabled={days[6] >= todayISO()} onClick={() => setDate(shiftDate(date, 7))} className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[12px] disabled:opacity-40">{'>'}</button>
      </div>
      <div className="mt-2.5 grid grid-cols-7 gap-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="text-center text-[10px] font-bold uppercase text-[#8b8a84]">{day}</span>)}
        {days.map(day => {
          const count = cases.filter(item => item.case_date === day).length
          return <button key={day} type="button" aria-label={`${day}: ${count} cases`} aria-pressed={day === date} disabled={day > todayISO()} onClick={() => setDate(day)} className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-semibold disabled:opacity-30 ${day === date ? 'border-[#8dbaa0] bg-[#e0f0e4] text-[#1f6448]' : count ? 'border-[#d0e4d5] bg-[#eef7f0] text-[#2c6b4d]' : 'border-[#ece6dc] bg-white text-[#637268]'}`}>
            {Number(day.slice(-2))}<span className="text-[8px]">{count ? `${count} cases` : '—'}</span>
          </button>
        })}
      </div>
      <div className="mt-3 grid gap-2">
        {available.map(item => <button key={item.id} type="button" aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)} className={`rounded-xl border p-3 text-left ${item.id === selectedId ? 'border-[#8dbaa0] bg-[#e0f0e4]' : 'border-[#ded7ca] bg-white hover:bg-[#f7fbf8]'}`}>
          <span className="block text-[10px] font-bold uppercase text-[#637268]">{levelLabels[item.level] || item.level}{item.id === selectedId ? ' · Selected' : ''}</span>
          <span className="mt-1 block text-[13px] font-bold text-[#102018]">{item.answer || item.category || 'Case'}</span>
          <span className="mt-1 block line-clamp-2 text-[12px] text-[#637268]">{item.prompt}</span>
        </button>)}
        {!available.length && <p className="text-[12px] text-[#637268]">No published cases on this date. Choose another day.</p>}
      </div>
      <div className="mt-3 border-t border-[#e7e1d6] pt-2 text-[12px] text-[#637268]">
        {selected ? <><p>Selected: {selected.case_date} · {selected.answer || selected.category}</p><Link href={exampleCaseHref(selected)} target="_blank" rel="noopener noreferrer" className="mr-3 text-[#1f6448] underline">Preview (new tab)</Link><button type="button" onClick={() => onSelect(null)} className="underline">Remove selection</button></> : 'No case selected for this showcase slot.'}
      </div>
    </fieldset>
  )
}
