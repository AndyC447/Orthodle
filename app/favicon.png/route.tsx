import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '999px',
            background: '#C96B37',
          }}
        />
      </div>
    ),
    {
      width: 64,
      height: 64,
    }
  )
}
