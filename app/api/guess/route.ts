import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAcceptedGuess, normalizeAnswer } from '@/lib/utils'

function isExactAcceptedGuess(guess: string, acceptedAnswers: string[]) {
  const normalizedGuess = normalizeAnswer(guess)
  if (!normalizedGuess) return false

  return acceptedAnswers
    .map(answer => normalizeAnswer(answer))
    .filter(Boolean)
    .includes(normalizedGuess)
}

export async function POST(req: Request) {
  const { caseId, guess, sessionId, doNotTrack } = await req.json()
  const normalizedGuess = typeof guess === 'string' ? guess.trim() : ''
  const requestUrl = new URL(req.url)
  const host = req.headers.get('host') || requestUrl.host || ''
  const isLocalRequest =
    host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0') || doNotTrack === true

  const { data: caseRow, error } = await supabase
    .from('cases')
    .select('answer, synonyms, level, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6')
    .eq('id', caseId)
    .single()

  if (error || !caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const accepted = [caseRow.answer, ...(caseRow.synonyms || [])]
  const anatomyChoiceCount = [
    caseRow.clue_1,
    caseRow.clue_2,
    caseRow.clue_3,
    caseRow.clue_4,
    caseRow.clue_5,
    caseRow.clue_6,
  ].filter(choice => typeof choice === 'string' && choice.trim().length > 0).length
  const shouldUseStrictAnatomyMatching = caseRow.level === 'attending' && anatomyChoiceCount >= 2
  const correct = shouldUseStrictAnatomyMatching
    ? isExactAcceptedGuess(normalizedGuess, accepted)
    : isAcceptedGuess(normalizedGuess, accepted)

  if (isLocalRequest) {
    return NextResponse.json({ correct, remaining: 6 })
  }

  await supabase.from('guesses').insert({
    case_id: caseId,
    session_id: sessionId,
    guess_text: normalizedGuess,
    is_correct: correct,
  })

  const { count } = await supabase
    .from('guesses')
    .select('*', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .eq('session_id', sessionId)

  return NextResponse.json({ correct, remaining: Math.max(0, 6 - (count || 0)) })
}
