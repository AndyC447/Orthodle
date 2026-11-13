import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function loadDailyReminderCategory(date: string) {
  const { data } = await getSupabaseAdmin()
    .from('cases')
    .select('category')
    .eq('case_date', date)
    .eq('level', 'med_student')
    .maybeSingle()

  // The game can fill an empty daily slot on first visit.
  return data?.category ?? null
}
