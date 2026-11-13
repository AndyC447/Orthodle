import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function load(path, imports = {}, globals = {}) {
  const exports = {}
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', ...Object.keys(globals), code)(
    exports, name => {
      assert.ok(name in imports, `Unexpected import: ${name}`)
      return imports[name]
    }, ...Object.values(globals),
  )
  return exports
}

const next = {
  NextResponse: { json: (body, init) => Response.json(body, init) },
}
const reminders = load('../lib/reminders.ts')
const emailTemplate = load('../lib/reminder-email.ts')
const environment = {
  RESEND_API_KEY: 'test-key',
  REMINDER_FROM_EMAIL: 'orthodle@example.com',
  CRON_SECRET: 'test-secret',
  ADMIN_PASSWORD: 'test-password',
}
const post = (path, body) => new Request(`https://orthodle.com/api/reminders/${path}`, {
  method: 'POST',
  body: JSON.stringify(body),
})

test('daily signup validates input, reports disabled delivery, and preserves existing active subscribers', async () => {
  const writes = []
  const table = {
    async upsert(row, options) { writes.push(['upsert', row, options]); return {} },
    update(row) {
      const update = ['update', row]
      writes.push(update)
      return { eq(...email) { update.push(email); return { eq(...active) { update.push(active); return {} } } } }
    },
  }
  const process = { env: {} }
  const route = load('../app/api/reminders/subscribe/route.ts', {
    'next/server': next,
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ from(name) { assert.equal(name, 'email_reminders'); return table } }) },
    '@/lib/reminders': reminders,
  }, { process })

  assert.equal((await route.POST(post('subscribe', { email: {} }))).status, 400)
  assert.equal((await route.POST(post('subscribe', { email: 'player@example.com' }))).status, 503)
  assert.deepEqual(writes, [])

  process.env = environment
  const response = await route.POST(post('subscribe', { email: ' PLAYER@EXAMPLE.COM ', sourcePath: '/archive' }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).success, true)
  assert.equal(writes[0][1].email, 'player@example.com')
  assert.equal(writes[0][1].source_path, '/archive')
  assert.deepEqual(writes[0][2], { onConflict: 'email', ignoreDuplicates: true })
  assert.deepEqual(writes[1].slice(2), [['email', 'player@example.com'], ['active', false]])
})

test('the daily reminder email contains one case link and a working unsubscribe URL', () => {
  const unsubscribe = 'https://orthodle.com/api/reminders/unsubscribe?token=test'
  const { subject, html } = emailTemplate.buildReminderEmail('https://orthodle.com', unsubscribe, 'Hand & Trauma')
  assert.equal(subject, 'Your Orthodle Daily Case is ready')
  assert.match(html, /Hand &amp; Trauma/)
  assert.ok(html.includes(`href="${unsubscribe}"`))
  assert.doesNotMatch(html, /Today’s lineup|Anatomy Quiz|Resident/)
  assert.match(emailTemplate.buildReminderEmail('https://orthodle.com', unsubscribe).html, /Open Orthodle to play today’s case/)
})

test('subscriber details and delivery require authorization before database access', async () => {
  const db = { getSupabaseAdmin: () => assert.fail('Unauthorized request accessed the database') }
  const process = { env: environment }
  const admin = load('../app/api/reminders/admin/route.ts', {
    'next/server': next,
    '@/lib/admin-auth': { isAdminPassword: value => value === environment.ADMIN_PASSWORD },
    '@/lib/supabase-admin': db,
  }, { process })
  assert.equal(admin.GET, undefined)
  const adminResponse = await admin.POST(post('admin', {}))
  assert.equal(adminResponse.status, 401)
  assert.equal(adminResponse.headers.get('cache-control'), 'private, no-store')

  const send = load('../app/api/reminders/send/route.ts', {
    'next/server': next,
    '@/lib/supabase-admin': db,
    '@/lib/reminders': reminders,
    '@/lib/reminder-email': emailTemplate,
    '@/lib/reminder-case': {},
  }, { process })
  const request = new Request('https://orthodle.com/api/reminders/send', { headers: { 'x-vercel-cron': '1' } })
  assert.equal((await send.GET(request)).status, 401)
})

test('daily delivery skips recipients already sent today and deduplicates provider retries', async () => {
  const today = '2026-11-12'
  const pending = { id: 'pending', email: 'player@example.com', active: true, unsubscribe_token: 'test-token', sent_count: 2 }
  const table = {
    select() {
      return { eq: async () => ({ data: [pending, { ...pending, id: 'sent', last_sent_on: today }] }) }
    },
    update(row) {
      assert.equal(row.last_sent_on, today)
      assert.equal(row.sent_count, 3)
      return { eq: async (column, id) => { assert.deepEqual([column, id], ['id', 'pending']); return {} } }
    },
  }
  const requests = []
  const send = load('../app/api/reminders/send/route.ts', {
    'next/server': next,
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ from: () => table }) },
    '@/lib/reminders': { ...reminders, getPacificDateParts: () => ({ isoDate: today, minutesIntoDay: 390 }) },
    '@/lib/reminder-email': emailTemplate,
    '@/lib/reminder-case': { loadDailyReminderCategory: async date => { assert.equal(date, today); return 'Hand' } },
  }, {
    process: { env: environment },
    fetch: async (url, init) => { requests.push({ url, init }); return new Response(null, { status: 200 }) },
  })
  const response = await send.GET(new Request('https://orthodle.com/api/reminders/send', {
    headers: { Authorization: 'Bearer test-secret' },
  }))
  assert.deepEqual(await response.json(), { success: true, sent: 1, due: 1 })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].init.headers['Idempotency-Key'], `daily-reminder/${today}/pending`)
  assert.deepEqual(JSON.parse(requests[0].init.body).to, ['player@example.com'])
})
