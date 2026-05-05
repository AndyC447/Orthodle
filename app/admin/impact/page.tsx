import Link from 'next/link'
import { Header } from '@/components/Header'
import { ImpactDashboard } from '@/components/ImpactDashboard'

export default function AdminImpactPage() {
  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-[#ded7ca] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-[#fbfaf7]"
          >
            Back to admin
          </Link>
        </div>

        <ImpactDashboard />
      </section>
    </main>
  )
}
