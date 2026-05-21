import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import Script from 'next/script'

export const metadata: Metadata = {
  metadataBase: new URL('https://orthodle.com'),
  title: 'Orthodle – Daily Orthopaedic Diagnosis Game',
  description:
    'Guess the orthopaedic diagnosis from clinical clues. A daily orthopaedic case game for medical students, residents, and attendings.',
  alternates: {
    canonical: '/',
  },
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
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Orthodle daily orthopaedic diagnosis game',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orthodle – Daily Orthopaedic Diagnosis Game',
    description:
      'Daily orthopaedic case game for med students, residents, and attendings.',
    images: ['/opengraph-image'],
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="orthodle-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var saved = localStorage.getItem('orthodle_theme');
                if (saved === 'dark' || saved === 'light') {
                  document.documentElement.dataset.theme = saved;
                }
              } catch (e) {}
            })();
          `}
        </Script>
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
