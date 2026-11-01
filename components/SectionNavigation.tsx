'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useSectionSwipe } from '@/hooks/useSectionSwipe'

const sections = [
  { href: '/', label: 'Daily Case', detail: 'A new challenge every day' },
  { href: '/archive', label: 'Archives', detail: 'Explore previous cases' },
  { href: '/impact', label: 'ERAS', detail: 'The story behind Orthodle' },
]

export function SectionNavigation({ active }: { active: string }) {
  return (
    <nav aria-label="Main sections" className="mx-auto mb-3 mt-2 w-full max-w-[700px] px-4 sm:px-0">
      <div className="orthodle-home-rail rounded-[24px] p-[1.25px]">
        <div className="orthodle-home-rail-inner grid grid-cols-3 gap-1 rounded-[22px] p-1 sm:gap-1.5 sm:p-1.5">
          {sections.map(section => (
            <Link key={section.href} href={section.href} aria-current={active === section.href ? 'page' : undefined}
              className={`orthodle-home-tab flex min-h-[42px] items-center justify-center rounded-[16px] border px-1.5 py-2 text-center font-serif text-[12px] font-bold uppercase leading-none transition-colors sm:min-h-[44px] sm:text-[14px] ${active === section.href ? '!border-[#1f6448] !bg-[#1f6448] !text-white' : ''}`}>
              {section.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

export function SectionSwipeContent({ path, children, enabled = true }: { path: string; children: ReactNode; enabled?: boolean }) {
  const { preview, offset, style, ...gestures } = useSectionSwipe(path)
  const destination = sections.find(section => section.href === preview)
  return (
    <div className="relative overflow-x-clip" {...(enabled ? gestures : {})}>
      {destination && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 mx-auto max-w-[1080px] px-4 py-6"
          style={{ opacity: Math.min(1, Math.abs(offset) / 100) }}>
          <div className="min-h-[55vh] rounded-[24px] border border-[#dce8e1] bg-[#f7fbf8] p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">{destination.label}</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-[#102018]">{destination.detail}</h2>
            {destination.href === '/impact' ? (
              <><p className="mt-4 max-w-lg text-sm leading-6 text-[#53645a]">Built by a UCLA medical student to bring orthopedic cases, teaching, and daily puzzles together.</p>
                <div className="mt-6 grid grid-cols-2 gap-3">{['Users reached', 'Published cases', 'Learner guesses', 'Countries reached'].map(label => <div key={label} className="rounded-xl bg-white p-4 text-xs font-semibold text-[#1f6448]">{label}</div>)}</div></>
            ) : <div className="mt-6 space-y-3">{['Trauma', 'Sports', 'Anatomy'].map(label => <div key={label} className="rounded-xl bg-white p-4 font-serif text-lg text-[#1f6448]">{label}</div>)}</div>}
          </div>
        </div>
      )}
      <div className="relative app-surface min-h-screen" style={style}>{children}</div>
    </div>
  )
}
