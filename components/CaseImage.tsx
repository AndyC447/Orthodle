'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Props = {
  src: string
  alt: string
  onOpen?: () => void
  className?: string
  imageClassName?: string
  imageStyle?: CSSProperties
}

export function CaseImage(props: Props) {
  // A new source starts a fresh loading cycle, including in reused preview slots.
  return <ImageAttempt key={props.src} {...props} />
}

function ImageAttempt({ src, alt, onOpen, className = '', imageClassName = '', imageStyle }: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const image = imageRef.current
    if (image?.complete) setStatus(image.naturalWidth > 0 ? 'loaded' : 'error')
  }, [attempt])

  useEffect(() => {
    if (status !== 'loading') return
    const timer = window.setTimeout(() => setStatus('error'), 20000)
    return () => window.clearTimeout(timer)
  }, [status, attempt])

  const picture = <img
    key={attempt}
    ref={imageRef}
    src={src}
    alt={alt}
    draggable={false}
    onLoad={() => setStatus('loaded')}
    onError={() => setStatus('error')}
    className={`block h-full w-full object-contain ${status === 'loaded' ? '' : 'invisible'} ${imageClassName}`}
    style={imageStyle}
  />

  return (
    <div className={`relative w-full ${className}`} aria-busy={status === 'loading'}>
      {onOpen ? <button type="button" onClick={onOpen} disabled={status !== 'loaded'} aria-label={`Enlarge ${alt.toLowerCase()}`} className="block h-full w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6448]">{picture}</button> : picture}
      {status !== 'loaded' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-[#f7f8f5] px-4 text-center text-[13px] text-[#637268]">
        <p role="status">{status === 'loading' ? 'Loading image…' : 'Image could not load.'}</p>
        {status === 'error' && <button type="button" className="min-h-[44px] rounded-lg border border-[#d6e2da] bg-white px-4 py-2 font-semibold text-[#1f6448]" onClick={event => {
          event.stopPropagation()
          setStatus('loading')
          // Remount the image without changing signed or externally hosted URLs.
          setAttempt(value => value + 1)
        }}>Retry image</button>}
      </div>}
    </div>
  )
}
