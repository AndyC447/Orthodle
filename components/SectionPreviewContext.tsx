'use client'

import { createContext, useContext } from 'react'

export const SectionPreviewContext = createContext(false)
export const useSectionPreview = () => useContext(SectionPreviewContext)
