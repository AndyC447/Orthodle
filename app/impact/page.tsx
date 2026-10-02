import type { Metadata } from 'next'
import { getCachedImpactExamples } from '@/lib/impact-examples-server'
import { PublicImpactPage } from '@/components/PublicImpactPage'

export const metadata: Metadata = {
  title: 'Impact',
  description:
    'A live Orthodle impact snapshot and short about-me page from the creator of the daily orthopedics case platform.',
}

// Include the curated examples in the initial HTML, without a client loading phase.
export const dynamic = 'force-dynamic'

export default async function ImpactPage() {
  const initialExamples = await getCachedImpactExamples().catch(() => null)
  return <PublicImpactPage initialExamples={initialExamples} />
}
