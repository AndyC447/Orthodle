import { normalizeQuestionType, type QuestionType } from '@/lib/question-type'

export function QuestionTypeField({ value, onChange }: { value: QuestionType; onChange: (value: QuestionType) => void }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[#637268]">
    Question type
    <select value={value} onChange={e => onChange(normalizeQuestionType(e.target.value))} className="w-full rounded-lg border border-[#ded7ca] bg-transparent px-3 py-2.5 text-sm text-[#102018]">
      <option value="diagnosis">Diagnosis</option>
      <option value="anatomy">Anatomy</option>
      <option value="classification">Classification</option>
    </select>
    <span className="text-xs font-normal leading-5">{value === 'diagnosis' ? 'Progressive clues with up to six guesses.' : 'Multiple choice with one submission. Add 2-6 choices and select the correct letter(s).'} Available on any date.</span>
  </label>
}
