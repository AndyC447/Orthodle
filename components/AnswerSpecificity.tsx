import { ANSWER_SPECIFICITY, normalizeAnswerSpecificity, type AnswerSpecificity } from '@/lib/answer-specificity'

export function AnswerSpecificityBadge({ value }: { value?: string | null }) {
  const state = normalizeAnswerSpecificity(value)
  if (state === 'off') return null
  const { label, helper } = ANSWER_SPECIFICITY[state]
  return (
    <div className="mt-3">
      <span title={helper} className="inline-flex rounded-full border border-[#cfe2d6] bg-[#f2faf5] px-3 py-1 text-xs font-semibold text-[#1f6448]">{label}</span>
      <p className="mt-1 text-xs leading-relaxed text-[#637268]">{helper}</p>
    </div>
  )
}

export function AnswerSpecificityField({ value, onChange }: { value: AnswerSpecificity; onChange: (value: AnswerSpecificity) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
      <span>Answer specificity</span>
      <select value={value} onChange={event => onChange(normalizeAnswerSpecificity(event.target.value))} className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018]">
        <option value="off">Off (default)</option>
        {Object.entries(ANSWER_SPECIFICITY).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
      </select>
      <span className="text-xs font-normal">{value === 'off' ? 'No indicator shown.' : ANSWER_SPECIFICITY[value].helper} Accepted answers still control grading.</span>
    </label>
  )
}
