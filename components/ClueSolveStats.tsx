'use client'

import { useState } from 'react'
import type { ClueStats } from '@/lib/case-learning'

type CaseOption = { id: string; case_date: string; answer: string; level: string; category: string | null }
export function ClueSolveStats({ cases, stats }: { cases: CaseOption[]; stats: Record<string, ClueStats> }) {
  const [selected, setSelected] = useState('')
  const eligible = cases.filter(item => !(item.level === 'attending' && item.case_date >= '2026-05-14'))
  const active = eligible.find(item => item.id === selected) || eligible[0]
  const data = active ? stats[active.id] : null
  return <section className="mt-6 rounded-2xl border border-[#e7e1d6] bg-white p-4 sm:p-5">
    <h2 className="font-serif text-xl font-bold text-[#102018]">Clue-by-clue solves</h2>
    <p className="mt-1 text-sm text-[#637268]">See which clue leads to the answer. Automatically calculated from each browser’s first six guesses; single-answer anatomy quizzes are excluded.</p>
    <label className="mt-4 grid gap-2 text-sm font-semibold text-[#637268]">Case
      <select value={active?.id || ''} onChange={event => setSelected(event.target.value)} className="w-full rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-[#102018]">
        {!eligible.length && <option value="">No cases available</option>}
        {eligible.map(item => <option key={item.id} value={item.id}>{item.case_date} · {item.answer} · {item.level === 'med_student' ? 'Daily' : item.level === 'resident' ? 'Resident' : 'Attending'}</option>)}
      </select>
    </label>
    {!data ? <p className="mt-4 text-sm text-[#637268]">No recorded guesses for this case yet.</p> : <>
      <p className="mt-3 text-sm text-[#637268]">{data.players} players · {data.solves.reduce((sum, count) => sum + count, 0)} solved · {data.exhausted} used all six guesses · {data.unfinished} unfinished</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[#637268]"><tr><th className="pb-2">Clue</th><th className="pb-2">Attempted</th><th className="pb-2">Solved here</th><th className="pb-2">% of all players</th></tr></thead>
          <tbody>{data.solves.map((count, index) => <tr key={index} className="border-t border-[#eee7dc]">
            <th className="py-3 font-semibold">{index + 1}</th><td>{data.reached[index]}</td><td>{count}</td>
            <td className="min-w-[120px]"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-[#edf2ee]"><div className="h-full rounded-full bg-[#1f6448]" style={{ width: `${count / data.players * 100}%` }} /></div><span>{Math.round(count / data.players * 100)}%</span></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#637268]">“Attempted” counts players who submitted a guess with that clue. Unfinished players may return later. Percentages include everyone who submitted a guess, so they may total less than 100%.</p>
    </>}
  </section>
}
