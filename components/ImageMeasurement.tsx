'use client'

import { useState } from 'react'
import { imagePointFromClient, measureImagePoints, measurementPointCount, type ImagePoint, type ImageSize, type MeasurementTool } from '@/lib/image-measurement'

export type ImageMeasurement = { tool: MeasurementTool; points: ImagePoint[] }

const tools = [
  { id: 'slope', label: 'Slope', instructions: ['Mark the first point on the line.', 'Mark the second point to measure against horizontal.'] },
  { id: 'angle', label: 'Angle', instructions: ['Mark a point on the first arm.', 'Mark the vertex.', 'Mark a point on the second arm.'] },
] as const

export function ImageMeasurementToolbar({ measurement, onChange }: {
  measurement: ImageMeasurement
  onChange: (measurement: ImageMeasurement) => void
}) {
  const { tool, points } = measurement
  const result = measureImagePoints(tool, points)
  const current = tools.find(item => item.id === tool)!
  const complete = points.length === measurementPointCount[tool]
  const hint = complete
    ? (result === null ? 'Choose distinct points.' : 'Mark a point to start a new measurement.')
    : current.instructions[points.length]

  return (
    <div className="orthodle-image-modal-header shrink-0 rounded-t-xl bg-white p-2 sm:px-5" onClick={event => event.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Image measurement tools">
        {tools.map(item => (
          <button key={item.id} type="button" aria-pressed={tool === item.id}
            className={`orthodle-home-secondary-action min-h-9 rounded-lg border border-[#ded7ca] bg-white px-2.5 text-xs font-semibold ${tool === item.id ? 'ring-2 ring-inset ring-current' : ''}`}
            onClick={() => { if (tool !== item.id) onChange({ tool: item.id, points: [] }) }}>
            {item.label}
          </button>
        ))}
        <button type="button" disabled={points.length === 0}
          className="orthodle-home-secondary-action ml-auto min-h-9 rounded-lg border border-[#ded7ca] bg-white px-2.5 text-xs font-semibold disabled:opacity-40"
          onClick={() => onChange({ tool, points: points.slice(0, -1) })}>Undo</button>
        <button type="button" disabled={points.length === 0}
          className="orthodle-home-secondary-action min-h-9 rounded-lg border border-[#ded7ca] bg-white px-2.5 text-xs font-semibold disabled:opacity-40"
          onClick={() => onChange({ tool, points: [] })}>Clear</button>
      </div>
      <div className="mt-1.5 flex min-h-8 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs" role="status">
        <p>{hint}</p>
        {result !== null && <strong className="tabular-nums">{result.toFixed(1)}{'\u00b0'}</strong>}
      </div>
    </div>
  )
}

export function ImageMeasurementOverlay({ size, measurement, onPoint }: {
  size: ImageSize
  measurement: ImageMeasurement
  onPoint: (point: ImagePoint) => void
}) {
  const [cursor, setCursor] = useState<ImagePoint | null>(null)
  const { points, tool } = measurement
  const [a, b] = points
  const radius = Math.max(size.width, size.height) * 0.008
  const center = { x: size.width / 2, y: size.height / 2 }
  const moveBy: Record<string, ImagePoint> = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  }
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <svg className="block h-full w-full cursor-crosshair touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5ce5cb]"
      viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet" tabIndex={0} role="application"
      aria-label="Measure image. Use arrow keys to move and Enter to mark a point."
      onBlur={() => setCursor(null)}
      onClick={event => {
        event.stopPropagation()
        setCursor(null)
        const point = imagePointFromClient({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), size)
        if (point) onPoint(point)
      }}
      onKeyDown={event => {
        const point = cursor ?? center
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onPoint(point)
          return
        }
        const direction = moveBy[event.key]
        if (!direction) return
        event.preventDefault()
        event.stopPropagation()
        const step = Math.max(1, Math.min(size.width, size.height) / 100) * (event.shiftKey ? 5 : 1)
        setCursor({
          x: Math.max(0, Math.min(size.width, point.x + direction.x * step)),
          y: Math.max(0, Math.min(size.height, point.y + direction.y * step)),
        })
      }}>
      <g pointerEvents="none" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
        {tool === 'slope' && a && b && (
          <path d={`M ${a.x} ${a.y} H ${b.x}`} stroke="#ffd447" strokeWidth="2" strokeDasharray="5 4" fill="none" vectorEffect="non-scaling-stroke" />
        )}
        {b && <>
          <path d={path} stroke="#102018" strokeWidth="4" fill="none" vectorEffect="non-scaling-stroke" />
          <path d={path} stroke="#5ce5cb" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
        </>}
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={radius} fill="#5ce5cb" stroke="#102018" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {cursor && <circle cx={cursor.x} cy={cursor.y} r={radius * 1.5} fill="none" stroke="#ffd447" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </g>
    </svg>
  )
}
