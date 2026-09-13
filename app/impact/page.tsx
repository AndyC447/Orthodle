import type { Metadata } from 'next'
import { PublicImpactPage } from '@/components/PublicImpactPage'

export const metadata: Metadata = {
  title: 'Impact',
  description:
    'A live Orthodle impact snapshot and short about-me page from the creator of the daily orthopedics case platform.',
}

export default function ImpactPage() {
  return <PublicImpactPage />
}
