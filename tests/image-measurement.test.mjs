import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

function load(file, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', code)(name => imports[name], exports)
  return exports
}
const math = load('../lib/image-measurement.ts')
const point = (x, y) => ({ x, y })
const { imagePointFromClient, measureImagePoints } = math
const image = { width: 800, height: 400 }

test('contained images map clicks to source pixels and reject letterboxed space', () => {
  const bounds = { left: 20, top: 100, width: 320, height: 400 }
  assert.deepEqual(imagePointFromClient(point(180, 300), bounds, image), point(400, 200))
  assert.deepEqual(imagePointFromClient(point(20, 220), bounds, image), point(0, 0))
  assert.equal(imagePointFromClient(point(180, 190), bounds, image), null)
  const portrait = { width: 400, height: 800 }
  assert.deepEqual(imagePointFromClient(point(180, 300), bounds, portrait), point(200, 400))
  assert.equal(imagePointFromClient(point(25, 300), bounds, portrait), null)
})

test('zooming, panning and resizing preserve measurements in image coordinates', () => {
  for (const bounds of [{ left: 10, top: 30, width: 400, height: 200 }, { left: -50, top: 70, width: 1200, height: 600 }, { left: 23, top: 80, width: 200, height: 100 }]) {
    const scale = bounds.width / image.width
    const select = (x, y) => imagePointFromClient(point(bounds.left + x * scale, bounds.top + y * scale), bounds, image)
    const points = [select(100, 100), select(400, 400)]
    assert.deepEqual(points, [point(100, 100), point(400, 400)])
    assert.equal(measureImagePoints('slope', points), 45)
  }
})

test('slope is measured against horizontal independently of drawing direction', () => {
  assert.equal(measureImagePoints('slope', [point(0, 0), point(40, 0)]), 0)
  assert.equal(measureImagePoints('slope', [point(0, 80), point(0, 0)]), 90)
  const a = point(200, 50), b = point(100, 150)
  assert.equal(measureImagePoints('slope', [a, b]), 45)
  assert.equal(measureImagePoints('slope', [b, a]), 45)
})

test('three-point angles use the middle point as the vertex and support obtuse angles', () => {
  assert.equal(measureImagePoints('angle', [point(0, 20), point(20, 20), point(20, 0)]), 90)
  assert.equal(measureImagePoints('angle', [point(10, 0), point(0, 0), point(-10, 10)]), 135)
  assert.equal(measureImagePoints('angle', [point(0, 0), point(10, 0), point(20, 0)]), 180)
})

test('incomplete or degenerate measurements never show a fabricated number', () => {
  for (const tool of ['slope', 'angle']) {
    assert.equal(measureImagePoints(tool, []), null)
    assert.equal(measureImagePoints(tool, [point(5, 5), point(5, 5)]), null)
  }
  assert.equal(measureImagePoints('angle', [point(5, 5), point(10, 10), point(10, 10)]), null)
  assert.equal(imagePointFromClient(point(1, 1), { left: 0, top: 0, width: 0, height: 0 }, image), null)
})

const { ImageMeasurementToolbar, ImageMeasurementOverlay } = load('../components/ImageMeasurement.tsx', {
  '@/lib/image-measurement': math, 'react/jsx-runtime': jsx, react: { useState: initial => [initial, () => {}] },
})
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []

test('toolbar offers only angle measurements in degrees and supports undo or clear', () => {
  const points = [point(0, 0), point(40, 40)], updates = []
  const elements = nodes(ImageMeasurementToolbar({ measurement: { tool: 'slope', points }, onChange: value => updates.push(value) }))
  const buttons = elements.filter(node => node.type === 'button')
  assert.deepEqual(buttons.map(node => node.props.children), ['Slope', 'Angle', 'Undo', 'Clear'])
  assert.deepEqual(elements.find(node => node.type === 'strong').props.children, ['45.0', '\u00b0'])
  for (const label of ['Undo', 'Clear', 'Angle']) buttons.find(node => node.props.children === label).props.onClick()
  assert.deepEqual(updates, [{ tool: 'slope', points: points.slice(0, 1) }, { tool: 'slope', points: [] }, { tool: 'angle', points: [] }])
})

test('overlay handles taps and keyboard placement without activating viewer gestures', () => {
  const points = []
  const svg = ImageMeasurementOverlay({ size: image, measurement: { tool: 'slope', points: [] }, onPoint: value => points.push(value) })
  let stopped = 0
  const target = { getBoundingClientRect: () => ({ left: 20, top: 100, width: 320, height: 400 }) }
  const click = (clientX, clientY) => svg.props.onClick({ clientX, clientY, currentTarget: target, stopPropagation: () => stopped++ })
  click(180, 190)
  click(220, 260)
  svg.props.onKeyDown({ key: 'Enter', preventDefault() {}, stopPropagation: () => stopped++ })
  assert.deepEqual(points, [point(500, 100), point(400, 200)])
  assert.equal(stopped, 3)
  assert.equal(svg.props.tabIndex, 0)
})
