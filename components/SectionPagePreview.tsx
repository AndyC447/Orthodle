'use client'

import dynamic from 'next/dynamic'
import { memo, useEffect, useState } from 'react'
import { SectionPreviewContext } from '@/components/SectionPreviewContext'

const ArchivePreview = dynamic(() => import('@/app/archive/page'))
const ErasPreview = dynamic(() => import('@/components/PublicImpactPage').then(module => module.PublicImpactPage))

// Drag updates only move the preview layer; they must not rerender its page tree.
export const SectionPagePreview = memo(function SectionPagePreview({ path }: { path: string }) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  if (!mobile) return null
  return (
    <SectionPreviewContext.Provider value={true}>
      {path === '/archive' ? <ArchivePreview /> : path === '/impact' ? <ErasPreview /> : null}
    </SectionPreviewContext.Provider>
  )
})
