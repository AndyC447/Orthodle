import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #f7f4ee 0%, #fffaf1 52%, #ead9b7 100%)',
          color: '#102018',
          position: 'relative',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 28,
            borderRadius: 34,
            border: '2px solid rgba(16,32,24,0.10)',
            background: 'rgba(255,253,248,0.86)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '54px 60px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ color: '#c96b37', fontSize: 34 }}>●</div>
            <div style={{ fontSize: 74, fontWeight: 700, letterSpacing: '-0.04em' }}>
              Orthodle
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                fontSize: 56,
                lineHeight: 1.04,
                fontWeight: 700,
                letterSpacing: '-0.04em',
                maxWidth: 820,
              }}
            >
              Daily orthopaedic diagnosis cases.
            </div>
            <div
              style={{
                display: 'flex',
                gap: 18,
                color: '#315f4d',
                fontSize: 20,
                textTransform: 'uppercase',
                letterSpacing: '0.22em',
                fontWeight: 700,
              }}
            >
              <div>Med Student</div>
              <div>Resident</div>
              <div>Attending</div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: 22,
                color: '#637268',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: '#c96b37',
                }}
              />
              Guess the diagnosis. Unlock the clues.
            </div>
            <div
              style={{
                padding: '14px 24px',
                borderRadius: 999,
                background: '#1f6448',
                color: 'white',
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              orthodle.com
            </div>
          </div>
        </div>
      </div>
    ),
    size
  )
}
