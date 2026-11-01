'use client'

import Link, { useLinkStatus } from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { useSectionSwipe } from '@/hooks/useSectionSwipe'
import { useSectionPreview } from '@/components/SectionPreviewContext'
import { SectionPagePreview } from '@/components/SectionPagePreview'

const sections = [
  { href: '/', label: 'Daily Case', detail: 'A new challenge every day' },
  { href: '/archive', label: 'Archives', detail: 'Explore previous cases' },
  { href: '/impact', label: 'ERAS', detail: 'The story behind Orthodle' },
]

export function SectionNavigation({ active }: { active: string }) {
  const [swipe, setSwipe] = useState<{ target: string | null; progress: number }>({ target: null, progress: 0 })
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.path === active) setSwipe({ target: detail.target, progress: detail.progress })
    }
    window.addEventListener('orthodle-section-swipe', update)
    return () => window.removeEventListener('orthodle-section-swipe', update)
  }, [active])
  return (
    <nav aria-label="Main sections" className="mx-auto mb-3 mt-2 w-full max-w-[700px] px-4 sm:px-0">
      <div className="orthodle-home-rail rounded-[24px] p-[1.25px]">
        <div className="orthodle-home-rail-inner grid grid-cols-3 gap-1 rounded-[22px] p-1 sm:gap-1.5 sm:p-1.5">
          {sections.map(section => (
            <Link key={section.href} href={section.href} aria-current={active === section.href ? 'page' : undefined}
              className={`${active === section.href ? 'orthodle-home-tab-active' : 'orthodle-home-tab'} relative overflow-hidden flex min-h-[42px] items-center justify-center rounded-[16px] border px-1.5 py-2 text-center font-serif text-[12px] font-bold uppercase leading-none transition-colors sm:min-h-[44px] sm:text-[14px]`}>
              {section.label}
              <SectionLinkProgress progress={swipe.target === section.href ? swipe.progress : 0} />
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

function SectionLinkProgress({ progress }: { progress: number }) {
  const { pending } = useLinkStatus()
  return <span aria-hidden="true" className={`pointer-events-none absolute bottom-1 left-3 right-3 h-[2px] overflow-hidden rounded-full ${pending ? 'bg-[#1f6448]/15' : ''}`}>
    <span className={`block h-full origin-left rounded-full bg-[#1f6448] ${pending ? 'orthodle-section-link-loading' : ''}`}
      style={pending ? undefined : { transform: `scaleX(${progress})` }} />
  </span>
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
      <div data-section-swipe-surface={path} className="relative app-surface min-h-screen" style={style}>{children}</div>
    </div>
  )
}
