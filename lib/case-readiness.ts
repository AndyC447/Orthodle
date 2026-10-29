import { validateChoiceQuestion } from './anatomy-quiz'

export function hasTeachingContent(value: string) {
  return value.split('\n').some(line => {
    const text = line.replace(/<[^>]+>/g, '').replace(/[*_#]/g, '').trim()
    return text && !/^(clinical pearls?|who|pathophys(?:iology)?|key clues|tx|treatment|why not the others\??|references):?$/i.test(text)
  })
}

export function getCaseReadiness(input: {
  date: string; category: string; prompt: string; answer: string; teaching: string
  images: string[]; choices: string[]; correctLetters: string[]; isChoice: boolean
  replacing: boolean; revealSteps: string[]
}) {
  const issues: string[] = []
  if (!input.date) issues.push('Choose a publish date.')
  if (!input.category.trim()) issues.push('Add a category.')
  if (!input.prompt.trim()) issues.push('Write the case prompt.')
  if (!input.answer.trim()) issues.push('Enter the correct answer.')
  if (!hasTeachingContent(input.teaching)) issues.push('Add a teaching point; section headings alone are not enough.')
  if (!input.images.some(image => image.trim())) issues.push('No case image attached. Add one if this question needs imaging.')
  if (input.replacing) issues.push('This date and slot already contain a different case. Saving will ask you to confirm replacement.')
  if (input.isChoice) {
    const error = validateChoiceQuestion(input.choices, input.correctLetters)
    if (error) issues.push(error)
  } else {
    if (!input.choices.some(clue => clue.trim())) issues.push('Add at least one clue.')
    input.images.forEach((image, index) => {
      const step = Number(input.revealSteps[index])
      if (image.trim() && Number.isInteger(step) && step > 0 && !input.choices[step - 1]?.trim()) {
        issues.push(`Image ${index + 1} reveals at empty clue ${step}. Add that clue or change the reveal timing.`)
      }
    })
  }
  return issues
}
