import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(path, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', code)(name => imports[name], exports)
  return exports
}
const rewards = load('../lib/streak-rewards.ts')

test('a new milestone is earned every five days with no fixed final tier', () => {
  for (const [days, milestone] of [[0, 0], [4, 0], [5, 5], [9, 5], [10, 10], [15, 15], [20, 20], [44, 40], [365, 365], [-5, 0], [NaN, 0], [Infinity, 0]]) {
    assert.equal(rewards.streakMilestone(days), milestone)
  }
  assert.deepEqual(rewards.earnedStreakMilestones(24), [5, 10, 15, 20])
  assert.equal(rewards.earnedStreakMilestones(365).at(-1), 365)
})

test('only the top three players receive recognition, and no player identities leak', () => {
  const leaders = Array.from({ length: 12 }, (_, index) => ({ sessionId: `player-${index}`, name: 'Private Name', current: index, longest: 60 - index }))
  for (let index = 0; index < leaders.length; index++) {
    assert.deepEqual(rewards.personalStreakRewards(leaders, `player-${index}`), { current: index, longest: 60 - index, topRank: index < 3 ? index + 1 : null })
  }
  assert.deepEqual(rewards.personalStreakRewards(leaders, 'unknown'), { current: 0, longest: 0, topRank: null })
})

test('milestones use the retained longest streak, even after the active run breaks', () => {
  const player = rewards.personalStreakRewards([{ sessionId: 'player', current: 0, longest: 23 }], 'player')
  assert.deepEqual(rewards.earnedStreakMilestones(player.longest), [5, 10, 15, 20])
})

test('public reward endpoint validates the player before loading and exposes only their streak numbers', async () => {
  let reads = 0
  const route = load('../app/api/streaks/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/streak-data': { getStreakData: async () => { reads++; return { leaders: [{ sessionId: 'player', name: 'Private', longest: 20, current: 5 }], trackedPlayers: 1 } } },
    '@/lib/streak-rewards': rewards,
  })
  const send = body => route.POST(new Request('https://orthodle.com/api/streaks', { method: 'POST', body: JSON.stringify(body) }))
  for (const sessionId of [null, '', ' ', 123, 'x'.repeat(129)]) assert.equal((await send({ sessionId })).status, 400)
  assert.equal(reads, 0)
  const response = await send({ sessionId: 'player' })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { longest: 20, current: 5, topRank: 1 })
  assert.deepEqual(await (await send({ sessionId: 'other' })).json(), { longest: 0, current: 0, topRank: null })
})

test('a ranking outage never presents a made-up top-three position', async () => {
  const route = load('../app/api/streaks/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/streak-data': { getStreakData: async () => { throw new Error('Unavailable') } },
    '@/lib/streak-rewards': rewards,
  })
  const response = await route.POST(new Request('https://orthodle.com/api/streaks', { method: 'POST', body: JSON.stringify({ sessionId: 'player' }) }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).topRank, undefined)
})

test('case rewards are suppressed for admin previews and embedded examples, and have no scrolling or repeating animation', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const component = readFileSync(new URL('../components/StreakRewards.tsx', import.meta.url), 'utf8')
  assert.match(page, /<StreakRewards[^>]*disabled=\{isAdminPreview \|\| isEmbeddedExample\}/)
  assert.match(component, /if \(disabled\) return null/)
  assert.match(component, /controller\?\.abort\(\)/)
  assert.doesNotMatch(component, /scrollIntoView|scrollTo|animate-|setNotification/)
})

test('badge collection renders every earned milestone and compact mode shows only the highest, with personalized rank', () => {
  const { StreakRewards } = load('../components/StreakRewards.tsx', {
    react: { useEffect() {}, useState: () => [{ sessionId: 'player', rewards: { current: 2, longest: 23, topRank: 2 } }] },
    'react/jsx-runtime': jsxRuntime,
    '@/lib/streak-rewards': rewards,
    '@/lib/utils': {},
  })
  const collection = renderToStaticMarkup(React.createElement(StreakRewards, { summary: null, collection: true }))
  for (const days of [5, 10, 15, 20]) assert.match(collection, new RegExp(`aria-label="${days}-day streak badge earned"`))
  assert.doesNotMatch(collection, /25-day/)
  assert.match(collection, /#2 in all-time streaks/)
  assert.match(collection, /Your earned badges stay yours/)
  const compact = renderToStaticMarkup(React.createElement(StreakRewards, { summary: null }))
  assert.doesNotMatch(compact, /aria-label="5-day/)
  assert.match(compact, /aria-label="20-day/)
  assert.equal(renderToStaticMarkup(React.createElement(StreakRewards, { summary: null, disabled: true })), '')
})
