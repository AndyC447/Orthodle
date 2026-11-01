'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useSectionSwipe } from '@/hooks/useSectionSwipe'
import { useSectionPreview } from '@/components/SectionPreviewContext'
import { SectionPagePreview } from '@/components/SectionPagePreview'

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
              className={`${active === section.href ? 'orthodle-home-tab-active' : 'orthodle-home-tab'} flex min-h-[42px] items-center justify-center rounded-[16px] border px-1.5 py-2 text-center font-serif text-[12px] font-bold uppercase leading-none transition-colors sm:min-h-[44px] sm:text-[14px]`}>
              {section.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

export function SectionSwipeContent({ path, children, enabled = true }: { path: string; children: ReactNode; enabled?: boolean }) {
  const isPreview = useSectionPreview()
  const { preview, offset, style, ...gestures } = useSectionSwipe(path, enabled && !isPreview)
  if (isPreview) return <>{children}</>
  return (
    <div className="relative overflow-x-clip" {...(enabled ? gestures : {})}>
      {enabled && sections.filter(section => section.href !== path && section.href !== '/').map(section => (
        <div key={section.href} aria-hidden="true" inert className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden lg:hidden"
          style={{ visibility: preview === section.href ? 'visible' : 'hidden', transform: `translate3d(${preview === section.href ? Math.sign(offset) * -28 * (1 - Math.min(1, Math.abs(offset) / 160)) : 0}px,0,0)` }}>
          <SectionPagePreview path={section.href} />
        </div>
      ))}
      <div className="relative app-surface min-h-screen" style={style}>{children}</div>
    </div>
  )
}
