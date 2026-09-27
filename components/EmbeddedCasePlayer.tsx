'use client'

import { useEffect, useRef, useState } from 'react'

export function EmbeddedCasePlayer({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const [height, setHeight] = useState(420)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => () => cleanup.current?.(), [])

  function resizeOnLoad() {
    cleanup.current?.()
    const doc = frame.current?.contentDocument
    if (!doc) return
    doc.documentElement.style.overflow = 'hidden'
    doc.body.style.overflow = 'hidden'
    let observed: Element | null = null
    let pending = 0
    const resize = () => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(() => {
        const main = doc.querySelector('main')
        if (!main) return
        if (main !== observed) { observer.disconnect(); observer.observe(main); observed = main }
        setHeight(Math.max(240, Math.ceil(main.getBoundingClientRect().height) + 24))
        setLoaded(true)
      })
    }
    const observer = new ResizeObserver(resize)
    const mutations = new MutationObserver(resize)
    mutations.observe(doc.body, { childList: true, subtree: true })
    doc.addEventListener('load', resize, true)
    resize()
    cleanup.current = () => {
      cancelAnimationFrame(pending)
      observer.disconnect()
      mutations.disconnect()
      doc.removeEventListener('load', resize, true)
    }
  }

  return (
    <div className="relative min-w-0" aria-busy={!loaded}>
      {!loaded && <p role="status" className="absolute inset-x-0 top-6 text-center text-sm text-[#637268]">Loading example…</p>}
      <iframe ref={frame} src={src} title={title} onLoad={resizeOnLoad} style={{ height }} className={`block w-full border-0 ${loaded ? '' : 'opacity-0'}`} />
    </div>
  )
}
