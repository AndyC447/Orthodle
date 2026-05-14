import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGroupAggregatesFromRows, fetchAllRows } from '../lib/groups-leaderboard.js'

test('fetchAllRows paginates past the first 1000 rows', async () => {
  const source = Array.from({ length: 1074 }, (_, index) => ({ id: index + 1 }))
  const rows = await fetchAllRows(async (from, to) => source.slice(from, to + 1))
  assert.equal(rows.length, 1074)
  assert.equal(rows.at(-1)?.id, 1074)
})

test('group aggregates still count correct solves when the original case row is missing', () => {
  const groups = [{ id: 'g1', name: 'Temple', icon: '🦉' }]
  const members = [
    {
      id: 'm1',
      group_id: 'g1',
      session_id: 's1',
      display_name: 'Roban',
      icon: '🧠',
      created_at: '2026-05-13T10:00:00.000Z',
    },
  ]
  const guessRows = [
    {
      session_id: 's1',
      case_id: 'missing-case',
      is_correct: true,
      created_at: '2026-05-13T18:00:00.000Z',
    },
  ]

  const aggregates = buildGroupAggregatesFromRows(groups, members, guessRows, {})
  assert.equal(aggregates.length, 1)
  assert.equal(aggregates[0].totalSolves, 1)
  assert.ok(aggregates[0].score > 0)
  assert.equal(aggregates[0].memberStats[0].solves, 1)
})
