import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAcceptedGuess } from '@/lib/utils'

export async function POST(req: Request) {
  const { caseId, guess, sessionId } = await req.json()
  const requestUrl = new URL(req.url)
  const host = req.headers.get('host') || requestUrl.host || ''
  const isLocalRequest =
    host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0')

  const { data: caseRow, error } = await supabase
    .from('cases')
    .select('answer, synonyms')
    .eq('id', caseId)
    .single()

  if (error || !caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const accepted = [caseRow.answer, ...(caseRow.synonyms || [])]
  const correct = isAcceptedGuess(guess, accepted)

  if (isLocalRequest) {
    return NextResponse.json({ correct, remaining: 6 })
  }

  await supabase.from('guesses').insert({
    case_id: caseId,
    session_id: sessionId,
    guess_text: guess,
    is_correct: correct,
  })

  const { count } = await supabase
    .from('guesses')
    .select('*', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .eq('session_id', sessionId)

  return NextResponse.json({ correct, remaining: Math.max(0, 6 - (count || 0)) })
}
