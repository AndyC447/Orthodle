export type ImagePoint = { x: number; y: number }
export type ImageSize = { width: number; height: number }
export type MeasurementTool = 'slope' | 'angle'

export const measurementPointCount: Record<MeasurementTool, number> = { slope: 2, angle: 3 }

export function imagePointFromClient(
  point: ImagePoint,
  bounds: ImageSize & { left: number; top: number },
  image: ImageSize
): ImagePoint | null {
  const scale = Math.min(bounds.width / image.width, bounds.height / image.height)
  if (!Number.isFinite(scale) || scale <= 0 || image.width <= 0 || image.height <= 0) return null
  // The SVG and image share a centered contain fit, including when zoomed or panned.
  const x = (point.x - bounds.left - (bounds.width - image.width * scale) / 2) / scale
  const y = (point.y - bounds.top - (bounds.height - image.height * scale) / 2) / scale
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > image.width || y > image.height) return null
  return { x, y }
}

export function measureImagePoints(tool: MeasurementTool, points: readonly ImagePoint[]): number | null {
  if (points.length !== measurementPointCount[tool]) return null
  const [a, b, c] = points
  const dx = a.x - b.x, dy = a.y - b.y
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length === 0) return null
  if (tool === 'slope') return Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI

  const ex = c.x - b.x, ey = c.y - b.y
  const otherLength = Math.hypot(ex, ey)
  if (!Number.isFinite(otherLength) || otherLength === 0) return null
  return Math.atan2(Math.abs(dx * ey - dy * ex), dx * ex + dy * ey) * 180 / Math.PI
}
