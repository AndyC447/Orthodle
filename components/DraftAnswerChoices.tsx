'use client'

import { getDiagnosisAutocompleteLabels } from '@/lib/diagnosis-autocomplete'

export function DraftAnswerChoices({ answer, synonyms, onSelect }: {
  answer: string | null | undefined
  synonyms: string[] | null | undefined
  onSelect: (label: string) => void
}) {
  const labels = getDiagnosisAutocompleteLabels(answer, synonyms)
  if (labels.length === 0) return null

  return (
    <div className="mb-3" role="group" aria-label="Draft answer and synonyms">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#637268]">Draft answer &amp; synonyms</p>
      <div className="flex flex-wrap gap-1.5">
        {labels.map(label => (
          <button key={label} type="button" onClick={() => onSelect(label)}
            className="orthodle-home-secondary-action rounded-md border border-[#ded7ca] px-2.5 py-1.5 text-left text-xs text-[#102018]">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
