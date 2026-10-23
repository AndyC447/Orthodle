import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('example images have explicit non-collapsing sizing without a clipping animation', () => {
  const player = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const imageStyle = player.match(/\.orthodle-embedded-example \.orthodle-image-tile img \{([^}]+)\}/)[1]
  assert.match(imageStyle, /width: 100%/)
  assert.match(imageStyle, /height: auto/)
  assert.match(imageStyle, /object-fit: contain/)
  const shellStyle = player.match(/\.orthodle-embedded-example \.orthodle-imaging-shell \{([^}]+)\}/)[1]
  assert.match(shellStyle, /animation: none !important/)
  assert.match(shellStyle, /clip-path: none !important/)
  assert.match(shellStyle, /opacity: 1/)
})

test('embedded players remeasure on accordion reopening and clean up the frame observer', () => {
  const player = readFileSync(new URL('../components/EmbeddedCasePlayer.tsx', import.meta.url), 'utf8')
  assert.match(player, /const frameObserver = new ResizeObserver\(resize\)/)
  assert.match(player, /frameObserver.observe\(frame.current\)/)
  assert.match(player, /frameObserver.disconnect\(\)/)
})
