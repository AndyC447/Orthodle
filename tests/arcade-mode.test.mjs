import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
function load(path, globals = {}, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', ...Object.keys(globals), code)(name => imports[name] ?? require(name), exports, ...Object.values(globals))
  return exports
}

function themeHarness(initial = {}, cookie = '', { blocked = false, getterBlocked = false, writeBlocked = false } = {}) {
  const stored = new Map(Object.entries(initial))
  const root = { dataset: { arcade: 'off', theme: 'dark' } }
  const storage = {
    get length() { if (blocked) throw Error('Blocked'); return stored.size },
    key(index) { if (blocked) throw Error('Blocked'); return [...stored.keys()][index] ?? null },
    getItem(key) { if (blocked) throw Error('Blocked'); return stored.get(key) ?? null },
    setItem(key, value) { if (blocked || writeBlocked) throw Error('Blocked'); stored.set(key, value) },
  }
  const window = { dispatchEvent() {} }
  Object.defineProperty(window, 'localStorage', { get() { if (getterBlocked) throw Error('Blocked'); return storage } })
  const document = { documentElement: root, cookie }
  const appearance = load('../lib/appearance.ts', {
    window, document,
  })
  return { stored, root, appearance, document, bootstrap() { vm.runInNewContext(appearance.ARCADE_THEME_BOOTSTRAP_SCRIPT, { window, document }) } }
}

test('a new visitor starts in regular theme and theme changes remain independent of night mode', () => {
  const h = themeHarness()
  assert.equal(h.appearance.readArcadeMode(), false)
  assert.equal(h.stored.has('orthodle_arcade_mode'), false)
  h.appearance.setArcadeMode(true)
  assert.equal(h.root.dataset.arcade, 'on')
  assert.equal(h.appearance.readArcadeMode(), true)
  const reloaded = themeHarness(Object.fromEntries(h.stored))
  reloaded.bootstrap()
  assert.equal(reloaded.root.dataset.arcade, 'on')
  assert.equal(h.root.dataset.theme, 'dark')
  h.appearance.setArcadeMode(false)
  assert.equal(h.appearance.readArcadeMode(), false)
})

test('returning visitors without a saved preference also start in Regular', () => {
  for (const marker of ['orthodle_session_id', 'orthodle_anonymous_session_id', 'orthodle_account_session_v1', 'orthodle_stats_v1', 'orthodle_visited_impact_page_v1', 'orthodle_theme']) {
    const h = themeHarness({ [marker]: 'existing-browser-data' })
    h.bootstrap()
    assert.equal(h.root.dataset.arcade, 'off', marker)
    assert.equal(h.stored.has('orthodle_arcade_mode'), false, marker)
    assert.equal(h.stored.get(marker), 'existing-browser-data')
    assert.equal(h.appearance.readArcadeMode(), false)
  }
})

test('both explicit saved themes always win over returning-visitor markers', () => {
  for (const saved of ['on', 'off']) {
    const h = themeHarness({ orthodle_arcade_mode: saved, orthodle_session_id: 'returning-player' }, 'orthodle_session_id=returning-player')
    h.bootstrap()
    assert.equal(h.root.dataset.arcade, saved)
    assert.equal(h.appearance.readArcadeMode(), saved === 'on')
    assert.equal(h.stored.get('orthodle_arcade_mode'), saved)
  }
})

test('a session cookie alone never enables Arcade, including with blocked storage', () => {
  for (const options of [{}, { blocked: true }, { getterBlocked: true }]) {
    const h = themeHarness({}, 'other=value; orthodle_session_id=returning-player; another=value', options)
    h.bootstrap()
    assert.equal(h.root.dataset.arcade, 'off')
    assert.equal(h.appearance.readArcadeMode(), false)
  }
})

test('creating a browser identity or cached data never changes the theme', () => {
  for (const options of [{}, { writeBlocked: true }]) {
    const h = themeHarness({}, '', options)
    h.bootstrap()
    assert.equal(h.root.dataset.arcade, 'off')
    h.stored.set('orthodle_session_id', 'created-this-visit')
    h.document.cookie = 'orthodle_session_id=created-this-visit'
    assert.equal(h.appearance.readArcadeMode(), false)
    h.bootstrap()
    assert.equal(h.root.dataset.arcade, 'off')
  }
})

test('new visitors and theme controls work when browser storage is unavailable', () => {
  for (const options of [{ blocked: true }, { getterBlocked: true }, { writeBlocked: true }]) {
    const h = themeHarness({}, '', options)
    h.bootstrap()
    assert.equal(h.appearance.readArcadeMode(), false)
    h.appearance.setArcadeMode(true)
    assert.equal(h.appearance.readArcadeMode(), true)
    h.appearance.setArcadeMode(false)
    assert.equal(h.appearance.readArcadeMode(), false)
  }
})

test('a blocked write does not undo a manual switch during the current visit', () => {
  const h = themeHarness({ orthodle_arcade_mode: 'on' }, '', { writeBlocked: true })
  h.bootstrap()
  assert.equal(h.root.dataset.arcade, 'on')
  h.appearance.setArcadeMode(false)
  assert.equal(h.appearance.readArcadeMode(), false)
  assert.equal(h.stored.get('orthodle_arcade_mode'), 'on')
})

test('saved changes from another tab override the initialized page without touching night mode', () => {
  const h = themeHarness()
  h.bootstrap()
  h.stored.set('orthodle_arcade_mode', 'on')
  assert.equal(h.appearance.readArcadeMode(), true)
  h.stored.set('orthodle_arcade_mode', 'off')
  assert.equal(h.appearance.readArcadeMode(), false)
  assert.equal(h.root.dataset.theme, 'dark')
})

test('an invalid or cleared preference falls back to Regular without storing a choice', () => {
  const h = themeHarness({ orthodle_arcade_mode: 'invalid', other_app: 'some-value' }, 'orthodle_session_id=returning-player')
  h.bootstrap()
  assert.equal(h.root.dataset.arcade, 'off')
  assert.equal(h.stored.get('orthodle_arcade_mode'), 'invalid')
  h.appearance.setArcadeMode(true)
  h.stored.delete('orthodle_arcade_mode')
  assert.equal(h.appearance.readArcadeMode(), false)
  assert.equal(h.stored.has('orthodle_arcade_mode'), false)
})

test('first-paint initialization and the server markup use the same new default', () => {
  const h = themeHarness()
  h.bootstrap()
  assert.equal(h.root.dataset.arcade, 'off')
  const server = load('../lib/appearance.ts')
  assert.equal(server.readArcadeMode(), false)
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /data-arcade="off"/)
  assert.match(layout, /ARCADE_THEME_BOOTSTRAP_SCRIPT/)
  assert.match(layout, /strategy="beforeInteractive"/)
  assert.doesNotMatch(layout, /dataset.arcade = 'on'/)
})

test('theme action names the destination: Regular theme in arcade, Arcade theme in regular', () => {
  let enabled = true, menuCloses = 0
  const saved = []
  const { ArcadeModeToggle } = load('../components/ArcadeModeToggle.tsx', {}, {
    react: { useEffect() {}, useState: () => [enabled, value => { enabled = value }] },
    '@/lib/appearance': { setArcadeMode: value => saved.push(value) },
  })
  const render = () => ArcadeModeToggle({ onToggle: () => { menuCloses++ } })
  let button = render()
  assert.equal(button.props['aria-label'], 'Regular theme')
  assert.match(renderToStaticMarkup(button), /<span>Regular theme<\/span>/)
  assert.equal(button.props.role, undefined)
  assert.equal(button.props['aria-checked'], undefined)
  button.props.onClick()
  button = render()
  assert.equal(button.props['aria-label'], 'Arcade theme')
  assert.match(renderToStaticMarkup(button), /<span>Arcade theme<\/span>/)
  button.props.onClick()
  assert.equal(render().props['aria-label'], 'Regular theme')
  assert.deepEqual(saved, [false, true])
  assert.equal(menuCloses, 2)
})

test('Arcade keeps readable body and form text with pixel branding, without altering regular or admin typography', () => {
  const css = readFileSync(new URL('../app/bone-arcade.css', import.meta.url), 'utf8')
  assert.match(css, /:root\[data-arcade="on"\] \.bone-arcade\[data-arcade-surface\]\s*\{[^}]*font-family: "Orthodle Plex", sans-serif;/)
  assert.match(css, /:is\(\.font-serif, input, button, textarea, select\)\s*\{\s*font-family: "Orthodle Plex", sans-serif;/)
  assert.match(css, /:is\(\.orthodle-wordmark, \.orthodle-home-tab, \.orthodle-home-tab-active\)\s*\{\s*font-family: "Orthodle Pixel", monospace;/)
  assert.doesNotMatch(css, /\[data-arcade-surface\] \*\s*\{\s*font-family:/)
  const fontRules = [...css.matchAll(/([^{}]+)\{[^{}]*font-family:\s*([^;]+);[^{}]*\}/g)]
    .filter(match => !match[1].includes('@font-face'))
  assert.ok(fontRules.length > 0)
  for (const [, selector, font] of fontRules) {
    assert.ok(selector.includes(':root[data-arcade="on"]'))
    assert.ok(selector.includes('.bone-arcade[data-arcade-surface]'))
    assert.ok(['"Orthodle Pixel", monospace', '"Orthodle Plex", sans-serif'].includes(font))
  }
})

test('six clue squares reflect used and remaining guesses', () => {
  const { ClueProgress } = load('../components/ClueProgress.tsx')
  const html = renderToStaticMarkup(createElement(ClueProgress, { used: 4, total: 6, complete: false, won: false }))
  assert.equal((html.match(/data-state="used"/g) || []).length, 4)
  assert.equal((html.match(/data-state="remaining"/g) || []).length, 2)
  assert.match(html, /aria-label="2 of 6 guesses remaining"/)
})

test('a completed or missed case does not report unused guesses as available', () => {
  const { ClueProgress } = load('../components/ClueProgress.tsx')
  const solved = renderToStaticMarkup(createElement(ClueProgress, { used: 2, total: 6, complete: true, won: true }))
  assert.match(solved, /aria-label="Case solved"/)
  assert.equal((solved.match(/data-state="correct"/g) || []).length, 1)
  assert.doesNotMatch(solved, /data-state="remaining"/)
  const missed = renderToStaticMarkup(createElement(ClueProgress, { used: 6, total: 6, complete: true, won: false }))
  assert.match(missed, /aria-label="No guesses remaining"/)
})
