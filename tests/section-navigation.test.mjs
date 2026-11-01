import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const exports = {}
const code = ts.transpileModule(readFileSync(new URL('../components/SectionNavigation.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function('require', 'exports', code)(name => {
  if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => createElement('a', props, children) }
  if (name === '@/hooks/useSectionSwipe') return { useSectionSwipe: () => ({ preview: null, offset: 0, style: {} }) }
  if (name === '@/components/SectionPreviewContext') return { useSectionPreview: () => false }
  if (name === '@/components/SectionPagePreview') return { SectionPagePreview: () => null }
  return require(name)
}, exports)

for (const path of ['/', '/archive', '/impact']) {
  test(`section rail uses the shared active theme for ${path}`, () => {
    const html = renderToStaticMarkup(createElement(exports.SectionNavigation, { active: path }))
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0])
    assert.equal(links.length, 3)
    const selected = links.filter(link => link.includes('aria-current="page"'))
    assert.equal(selected.length, 1)
    assert.ok(selected[0].includes(`href="${path}"`))
    assert.match(selected[0], /class="orthodle-home-tab-active /)
    assert.doesNotMatch(selected[0], /class="orthodle-home-tab /)
    for (const link of links.filter(link => !selected.includes(link))) {
      assert.match(link, /class="orthodle-home-tab /)
    }
  })
}
