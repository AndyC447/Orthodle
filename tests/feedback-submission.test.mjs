import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const typed = source.slice(source.indexOf('  async function submitTypedFeedback()'), source.indexOf('  function renderFormattedLine('))

function setup(overrides = {}, result = { error: null }) {
  const state = { text: 'My feedback', saving: false, status: '', rows: [] }
  const context = {
    isEmbeddedExample: false, isAdminPreview: false, isSavingFeedback: false,
    dailyCase: { id: 'case', case_date: '2026-11-01', level: 'med_student', answer: 'Answer' },
    feedbackText: state.text,
    isTrackingDisabledForThisBrowser: () => true,
    isLocalhostBrowser: () => false,
    getSessionId: () => 'session',
    setShowCaseFeedback: () => {},
    setFeedbackStatus: value => { state.status = value },
    setFeedbackText: value => { state.text = value },
    setIsSavingFeedback: value => { state.saving = value },
    supabase: { from: table => {
      assert.equal(table, 'case_feedback')
      return { insert: async row => {
        state.rows.push(row)
        if (result instanceof Error) throw result
        return result
      } }
    } },
    ...overrides,
  }
  return { state, submit: new Function(...Object.keys(context), `${typed}; return submitTypedFeedback`)(...Object.values(context)) }
}

test('explicit feedback sends even when analytics tracking is disabled', async () => {
  const { state, submit } = setup()
  await submit()
  assert.equal(state.rows.length, 1)
  assert.equal(state.rows[0].feedback_text, 'My feedback')
  assert.equal(state.text, '')
  assert.match(state.status, /Thanks/)
  assert.equal(state.saving, false)
})

test('failed requests preserve the note and allow retry', async () => {
  for (const result of [{ error: { message: 'Denied' } }, new Error('Offline')]) {
    const { state, submit } = setup({}, result)
    await submit()
    assert.equal(state.text, 'My feedback')
    assert.equal(state.saving, false)
    assert.match(state.status, /try again/)
  }
})

test('previews and local development do not send feedback', async () => {
  for (const override of [{ isAdminPreview: true }, { isEmbeddedExample: true }, { isLocalhostBrowser: () => true }]) {
    const { state, submit } = setup(override)
    await submit()
    assert.equal(state.rows.length, 0)
    assert.equal(state.text, 'My feedback')
  }
})

test('reactions and the feedback inbox are independent of analytics exclusions', () => {
  const reaction = source.slice(source.indexOf('  async function submitQuickReaction('), source.indexOf('  async function submitTypedFeedback()'))
  assert.doesNotMatch(reaction, /isTrackingDisabledForThisBrowser/)
  const inbox = readFileSync(new URL('../app/admin/feedback/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(inbox, /filterExcludedSessionRows|fetchExcludedStatsSessionIds/)
})
