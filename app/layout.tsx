import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'

export const metadata: Metadata = {
  metadataBase: new URL('https://orthodle.com'),
  title: 'Orthodle – Daily Orthopaedic Diagnosis Game',
  description:
    'Guess the orthopaedic diagnosis from clinical clues. A daily orthopaedic case game for medical students, residents, and attendings.',
  keywords: [
    'orthodle',
    'orthopedic cases',
    'orthopaedic cases',
    'orthopedic diagnosis',
    'orthopaedic diagnosis',
    'medical student orthopedics',
    'orthopedic quiz',
    'orthopaedic quiz',
    'orthopedic practice questions',
    'orthopedic education',
  ],
  openGraph: {
    title: 'Orthodle – Daily Orthopaedic Diagnosis Game',
    description:
      'Daily orthopaedic case game for med students, residents, and attendings.',
    url: 'https://orthodle.com',
    siteName: 'Orthodle',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: '7nsFxYXgmXDHxuvuObjayAFGult90NKlzKeT-7IORAA',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
