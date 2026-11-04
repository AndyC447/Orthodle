import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', ...Object.keys(globals), code)(name => name in imports ? imports[name] : require(name), exports, ...Object.values(globals))
  return exports
}

const campaignSource = readFileSync(new URL('../lib/streak-thank-you.ts', import.meta.url), 'utf8')
const digests = [...campaignSource.matchAll(/'([0-9a-f]{64})'/g)].map(match => match[1])
const note = { id: 'campaign-test', title: 'A personal thank you', body: 'Thank you for coming back.', signature: 'Andy, creator of Orthodle' }

test('the campaign is fixed to exactly ten hashed recipients and stays server-only', () => {
  assert.equal(digests.length, 10)
  assert.equal(new Set(digests).size, 10)
  assert.match(campaignSource, /^import 'server-only'/)
  assert.doesNotMatch(campaignSource, /getStreakData|buildStreakLeaderboard|NEXT_PUBLIC|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/)
  const client = readFileSync(new URL('../components/PrivateStreakThankYou.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(client, /recipientHashes|from ['"]@\/lib\/streak-thank-you['"]/)
})

test('only a captured recipient receives the note; the response never contains the recipient list', () => {
  let input = ''
  const campaign = load('../lib/streak-thank-you.ts', {
    'server-only': {},
    'node:crypto': { createHash: () => ({ update(value) { input = value; return this }, digest() { return input.endsWith(':eligible') ? digests[0] : createHash('sha256').update(input).digest('hex') } }) },
  })
  const result = campaign.getStreakThankYou('eligible')
  assert.match(input, /^streak-thanks-2026-11-03:eligible$/)
  assert.equal(result.title, 'A personal thank you')
  assert.match(result.body, /top 10 all-time daily streak players/)
  assert.equal(result.signature, 'Andy, creator of Orthodle')
  assert.deepEqual(Object.keys(result).sort(), ['body', 'id', 'signature', 'title'])
  assert.equal(campaign.getStreakThankYou('different-player'), null)
  assert.equal(campaign.getStreakThankYou(''), null)
})

test('the public endpoint returns the private note only for its recipient and never trusts a client-supplied note', async () => {
  const route = load('../app/api/streaks/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/streak-data': { getStreakData: async () => ({ leaders: [] }) },
    '@/lib/streak-rewards': { personalStreakRewards: () => ({ current: 0, longest: 0, topRank: null }) },
    '@/lib/streak-thank-you': { getStreakThankYou: id => id === 'eligible' ? note : null },
  })
  const send = body => route.POST(new Request('https://orthodle.com/api/streaks', { method: 'POST', body: JSON.stringify(body) }))
  const response = await send({ sessionId: 'eligible' })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual((await response.json()).thankYou, note)
  assert.equal((await (await send({ sessionId: 'other', thankYou: note })).json()).thankYou, undefined)
  assert.equal((await send({ sessionId: '' })).status, 400)
})

test('a temporary ranking failure still delivers the fixed note, without inventing streak numbers or rank', async () => {
  const route = load('../app/api/streaks/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/streak-data': { getStreakData: async () => { throw new Error('Unavailable') } },
    '@/lib/streak-rewards': {},
    '@/lib/streak-thank-you': { getStreakThankYou: id => id === 'eligible' ? note : null },
  })
  const response = await route.POST(new Request('https://orthodle.com/api/streaks', { method: 'POST', body: JSON.stringify({ sessionId: 'eligible' }) }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { thankYou: note })
})

function browserHarness(blockStorage = false, blockCookies = false) {
  const stored = new Map(), cookies = new Map()
  const window = Object.assign(new EventTarget(), {
    localStorage: {
      getItem(key) { if (blockStorage) throw Error('Blocked'); return stored.get(key) ?? null },
      setItem(key, value) { if (blockStorage) throw Error('Blocked'); stored.set(key, value) },
    },
    location: { protocol: 'https:' },
  })
  let otherDialog = null
  const observers = new Set()
  const bursts = [], sounds = []
  const dialog = { open: false, isConnected: true, shows: 0, closes: 0,
    getBoundingClientRect: () => ({ left: 10, top: 200, width: 360, height: 240 }),
    showModal() { this.open = true; this.shows++ }, close() { this.open = false; this.closes++ } }
  const document = Object.assign(new EventTarget(), {
    body: { style: { overflow: 'scroll' } }, visibilityState: 'visible',
    querySelectorAll: () => [...(dialog.open ? [dialog] : []), ...(otherDialog ? [otherDialog] : [])],
  })
  class MutationObserver {
    constructor(callback) { this.callback = callback }
    observe() { observers.add(this.callback) }
    disconnect() { observers.delete(this.callback) }
  }
  Object.defineProperty(document, 'cookie', {
    get() { if (blockCookies) throw Error('Blocked'); return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ') },
    set(value) { if (blockCookies) throw Error('Blocked'); const [key, content] = value.split(';')[0].split('='); cookies.set(key, content) },
  })
  const dismissal = load('../lib/streak-thank-you-dismissal.ts', {}, { window, document })
  const effects = new Map(), slots = []
  let cursor = 0, currentTree, ref
  const component = load('../components/PrivateStreakThankYou.tsx', {
    react: {
      useState(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = value }] },
      useRef(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: initial }; ref = slots[slot]; return ref },
      useId: () => 'thank-you-test',
      useEffect(callback, deps) {
        const slot = cursor++, previous = slots[slot]
        if (previous && deps.every((value, index) => value === previous.deps[index])) return
        effects.set(slot, () => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: callback() } })
      },
    },
    '@/lib/streak-thank-you-dismissal': dismissal,
    '@/lib/thank-you-confetti': { burstThankYouConfetti: origin => { bursts.push(origin) } },
    '@/lib/sound-effects': { prepareSoundEffects: () => sounds.push('prepare'), playSoundEffect: effect => sounds.push(effect) },
  }, { window, document, MutationObserver })
  const findDismiss = tree => {
    if (!tree || typeof tree !== 'object') return null
    if (Array.isArray(tree)) return tree.map(findDismiss).find(Boolean)
    if (tree.props?.['aria-label'] === 'Dismiss thank-you note') return tree
    return findDismiss(tree.props?.children)
  }
  const render = (sessionId = 'player', currentNote = note, paused = false) => {
    cursor = 0
    currentTree = component.PrivateStreakThankYou({ sessionId, note: currentNote, paused })
    ref.current = currentTree ? dialog : null
    return currentTree ? renderToStaticMarkup(currentTree) : ''
  }
  return {
    stored, window, dismissal, render, dialog, document, bursts, sounds,
    reloadDismissal: () => load('../lib/streak-thank-you-dismissal.ts', {}, { window, document }),
    mount(sessionId = 'player', currentNote = note, paused = false) {
      let html = render(sessionId, currentNote, paused)
      while (effects.size) {
        const pending = [...effects.values()]; effects.clear(); pending.forEach(callback => callback())
        html = render(sessionId, currentNote, paused)
      }
      return html
    },
    dismiss() { findDismiss(currentTree).props.onClick() },
    escape() { let prevented = false; currentTree.props.onCancel({ preventDefault() { prevented = true } }); return prevented },
    otherDialog(open, closedNative = false) {
      otherDialog = open ? { tagName: closedNative ? 'DIALOG' : 'DIV', hasAttribute: () => !closedNative, getClientRects: () => closedNative ? [] : [{}] } : null
      observers.forEach(callback => callback())
    },
    hidden(hidden) { document.visibilityState = hidden ? 'hidden' : 'visible'; document.dispatchEvent(new Event('visibilitychange')) },
    get observerCount() { return observers.size },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('the modal is hidden until dismissal state loads, then dismisses and stays hidden through refreshes', () => {
  const h = browserHarness()
  assert.equal(h.render(), '')
  assert.match(h.mount(), /A personal thank you/)
  h.dismiss()
  assert.equal(h.render(), '')
  assert.equal(h.mount(), '')
  const key = h.dismissal.thankYouDismissalKey(note.id, 'player')
  assert.equal(h.stored.get(key), 'dismissed')
  assert.equal(h.dismissal.isThankYouDismissed(key), true)
  h.unmount()
})

test('dismissals are scoped to both campaign and player; a new identity never flashes the old note', () => {
  const h = browserHarness()
  h.mount()
  h.dismiss()
  assert.equal(h.render('other-player'), '')
  assert.match(h.mount('other-player'), /A personal thank you/)
  assert.equal(h.render('player'), '')
  assert.equal(h.mount('player'), '')
  assert.match(h.mount('player', { ...note, id: 'new-campaign' }), /A personal thank you/)
  h.unmount()
})

test('dismissal in another tab or another cached section hides the note immediately', () => {
  const h = browserHarness()
  h.mount()
  h.dismissal.dismissThankYou(h.dismissal.thankYouDismissalKey(note.id, 'player'))
  assert.equal(h.render(), '')
  h.unmount()
  const other = browserHarness()
  other.mount()
  const key = other.dismissal.thankYouDismissalKey(note.id, 'player')
  other.stored.set(key, 'dismissed')
  const event = new Event('storage')
  Object.defineProperty(event, 'key', { value: key })
  other.window.dispatchEvent(event)
  assert.equal(other.render(), '')
  other.unmount()
})

test('cookie fallback remembers a dismissal when local storage is blocked, and both blocked never prevent closing', () => {
  const h = browserHarness(true)
  assert.match(h.mount(), /A personal thank you/)
  h.dismiss()
  assert.equal(h.dismissal.isThankYouDismissed(h.dismissal.thankYouDismissalKey(note.id, 'player')), true)
  const reloaded = h.reloadDismissal()
  assert.equal(reloaded.isThankYouDismissed(reloaded.thankYouDismissalKey(note.id, 'player')), true)
  assert.equal(h.render(), '')
  h.unmount()
  const blocked = browserHarness(true, true)
  assert.match(blocked.mount(), /A personal thank you/)
  assert.doesNotThrow(() => blocked.dismiss())
  assert.equal(blocked.render(), '')
  blocked.unmount()
})

test('thank-you UI uses an accessible native modal with a focused close button, not email or a revived inbox', () => {
  const h = browserHarness()
  const html = h.mount()
  assert.match(html, /<dialog/)
  assert.match(html, /class="orthodle-how-to streak-thank-you"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="thank-you-test-title"/)
  assert.match(html, /aria-describedby="thank-you-test-body"/)
  assert.match(html, /autoFocus=""/i)
  assert.match(html, /aria-label="Dismiss thank-you note"/)
  assert.doesNotMatch(html, /role="alert"|notification|inbox|email/i)
  assert.equal(h.dialog.open, true)
  assert.equal(h.document.body.style.overflow, 'hidden')
  h.unmount()
  assert.equal(h.dialog.open, false)
  assert.equal(h.document.body.style.overflow, 'scroll')
  assert.equal(h.observerCount, 0)
})

test('Escape persists dismissal exactly like clicking X', () => {
  const h = browserHarness()
  h.mount()
  assert.equal(h.escape(), true)
  assert.equal(h.mount(), '')
  assert.equal(h.dialog.open, false)
  assert.equal(h.document.body.style.overflow, 'scroll')
  assert.equal(h.reloadDismissal().isThankYouDismissed(h.dismissal.thankYouDismissalKey(note.id, 'player')), true)
  h.unmount()
})

test('thank-you waits behind How to Play or an image dialog and opens once they close', () => {
  const h = browserHarness()
  h.otherDialog(true)
  h.mount()
  assert.equal(h.dialog.open, false)
  assert.equal(h.document.body.style.overflow, 'scroll')
  h.otherDialog(false)
  assert.equal(h.dialog.open, true)
  assert.equal(h.dialog.shows, 1)
  assert.equal(h.document.body.style.overflow, 'hidden')
  h.otherDialog(false)
  assert.equal(h.dialog.shows, 1)
  h.unmount()
})

test('pausing or navigating away closes without marking the note dismissed', () => {
  const h = browserHarness()
  assert.equal(h.mount('player', note, true), '')
  assert.equal(h.dialog.open, false)
  assert.match(h.mount(), /A personal thank you/)
  assert.equal(h.dialog.open, true)
  h.mount('player', note, true)
  assert.equal(h.dialog.open, false)
  assert.equal(h.dismissal.isThankYouDismissed(h.dismissal.thankYouDismissalKey(note.id, 'player')), false)
  h.mount()
  assert.equal(h.dialog.open, true)
  h.unmount()
  assert.equal(h.document.body.style.overflow, 'scroll')
})

test('a hidden tab waits until visible before opening the modal', () => {
  const h = browserHarness()
  h.hidden(true)
  h.mount()
  assert.equal(h.dialog.open, false)
  h.hidden(false)
  assert.equal(h.dialog.open, true)
  h.unmount()
})

test('a closed native dialog from a cached page never blocks the thank-you popup', () => {
  const h = browserHarness()
  h.otherDialog(true, true)
  h.mount()
  assert.equal(h.dialog.open, true)
  h.unmount()
})

test('X and Escape close immediately and trigger one burst from the popup center', () => {
  for (const action of ['dismiss', 'escape']) {
    const h = browserHarness()
    h.mount()
    h[action]()
    assert.equal(h.dialog.open, false)
    assert.deepEqual(h.bursts, [{ x: 190, y: 320 }])
    assert.deepEqual(h.sounds, ['prepare', 'celebration'])
    h.mount()
    assert.equal(h.bursts.length, 1)
    assert.equal(h.render(), '')
    h.unmount()
  }
})

test('route changes, pausing, other-tab dismissal, and re-renders never trigger confetti', () => {
  const h = browserHarness()
  h.mount()
  h.mount()
  h.mount('player', note, true)
  h.mount()
  h.dismissal.dismissThankYou(h.dismissal.thankYouDismissalKey(note.id, 'player'))
  h.mount()
  h.unmount()
  assert.equal(h.bursts.length, 0)
  assert.equal(h.sounds.length, 0)
})
