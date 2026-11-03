import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const exports = {}
const code = ts.transpileModule(readFileSync(new URL('../components/PublicImpactPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function('require', 'exports', code)(name => {
  if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => createElement('a', props, children) }
  if (name === '@/hooks/useImpactStats') return { useImpactStats: () => ({ metrics: null, loading: true, error: false }) }
  if (name === '@/components/SectionPreviewContext') return { useSectionPreview: () => false }
  if (name === '@/components/SectionNavigation') return { SectionNavigation: () => null, SectionSwipeContent: ({ children }) => children }
  if (name === '@/components/LiveStatNumber') return { LiveStatNumber: () => createElement('span', null, '0') }
  if (name.startsWith('@/components/')) return { [name.split('/').at(-1)]: () => null }
  return require(name)
}, exports)

test('public ERAS uses the arcade theme scope', () => {
  const html = renderToStaticMarkup(createElement(exports.PublicImpactPage))
  const main = html.match(/<main[^>]*>/)[0]
  assert.match(main, /data-arcade-surface=""/)
  assert.match(main, /bone-arcade/)
})

test('admin ERAS editor retains the original design with Arcade mode enabled globally', () => {
  const html = renderToStaticMarkup(createElement(exports.PublicImpactPage, { adminMode: true }))
  const main = html.match(/<main[^>]*>/)[0]
  assert.doesNotMatch(main, /data-arcade-surface|bone-arcade/)
  assert.match(html, /Back to admin/)
})
