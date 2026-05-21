'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'

type ReminderSubscriberRow = {
  id: string
  email: string
  active: boolean
  reminder_mode: 'instant' | 'scheduled' | null
  scheduled_time_minutes: number | null
  timezone: string | null
  source_path: string | null
  sent_count: number | null
  last_sent_at: string | null
  last_sent_on: string | null
  created_at: string
  updated_at: string
}

type ReminderAdminSummary = {
  activeSubscribers: number
  totalSubscribers: number
  isConfigured: boolean
  missingConfig: string[]
  fromEmail: string | null
  siteUrl: string
  subscribers: ReminderSubscriberRow[]
}

function formatPacificTime(minutes: number | null) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '—'
  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix} PT`
}

function formatTimezoneLabel(value: string | null) {
  if (!value) return '—'
  return value.replaceAll('_', ' ')
}

function formatReminderPreference(row: ReminderSubscriberRow) {
  if (row.reminder_mode === 'scheduled') {
    return `${formatPacificTime(row.scheduled_time_minutes)} · ${formatTimezoneLabel(row.timezone)}`
  }
  return 'Daily reminder'
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AdminEmailRemindersPage() {
  const [summary, setSummary] = useState<ReminderAdminSummary | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const response = await fetch('/api/reminders/admin', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setStatusMessage(data.error || 'Could not load reminder data.')
        setLoading(false)
        return
      }

      setSummary(data as ReminderAdminSummary)
      setStatusMessage('')
    } catch {
      setStatusMessage('Could not load reminder data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  async function sendTestReminderEmail() {
    const email = testEmail.trim()
    if (!email) {
      setStatusMessage('Enter a test email address first.')
      return
    }

    const adminPassword = window.sessionStorage.getItem('orthodle_admin_password') || ''
    setSendingTest(true)
    setStatusMessage('')

    try {
      const response = await fetch('/api/reminders/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: adminPassword,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setStatusMessage(data.error || 'Could not send the test reminder email.')
        return
      }

      setStatusMessage(data.message || 'Test reminder sent.')
    } catch {
      setStatusMessage('Could not send the test reminder email.')
    } finally {
      setSendingTest(false)
    }
  }

  const subscribers = useMemo(() => summary?.subscribers || [], [summary])

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-1 font-serif text-3xl font-bold text-[#102018]">
              Email Reminders
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-[#ded7ca] bg-white px-4 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              Back to admin
            </Link>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-full border border-[#ded7ca] bg-white px-4 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#ded7ca] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Active
            </div>
            <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
              {summary?.activeSubscribers ?? '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#ded7ca] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Total
            </div>
            <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
              {summary?.totalSubscribers ?? '—'}
            </div>
          </div>
          <div className={`rounded-2xl border px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] ${
            summary?.isConfigured ? 'border-[#cfded4] bg-[#f7fbf8]' : 'border-[#ead9b7] bg-[#fffaf1]'
          }`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Setup
            </div>
            <div className="mt-1 text-sm leading-6 text-[#355542]">
              {summary?.isConfigured
                ? `Using ${summary.fromEmail || 'your sender email'}`
                : summary?.missingConfig?.length
                  ? `Missing: ${summary.missingConfig.join(', ')}`
                  : 'Loading reminder configuration.'}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
            Test email
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="email"
              value={testEmail}
              onChange={event => setTestEmail(event.target.value)}
              placeholder="you@example.com"
              className="min-h-[40px] flex-1 rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
            />
            <button
              type="button"
              onClick={() => void sendTestReminderEmail()}
              disabled={sendingTest}
              className="rounded-full border border-[#1f6448] bg-[#1f6448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60"
            >
              {sendingTest ? 'Sending...' : 'Send test email'}
            </button>
          </div>
          {statusMessage && (
            <p className="mt-2 text-sm text-[#637268]">{statusMessage}</p>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e7e1d6] bg-white shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="border-b border-[#f0eadf] px-4 py-3">
            <div className="font-serif text-xl font-bold text-[#102018]">
              Subscribers
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-sm text-[#637268]">Loading subscribers...</div>
          ) : subscribers.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#637268]">No subscribers yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-[#f0eadf] bg-[#fcfbf8]">
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Email</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Status</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Preference</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Timezone</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Sends</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Last sent</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map(row => (
                    <tr key={row.id} className="border-b border-[#f6f1e8] last:border-b-0">
                      <td className="px-4 py-3 text-sm font-medium text-[#102018]">{row.email}</td>
                      <td className="px-4 py-3 text-sm text-[#355542]">{row.active ? 'Active' : 'Unsubscribed'}</td>
                      <td className="px-4 py-3 text-sm text-[#355542]">{formatReminderPreference(row)}</td>
                      <td className="px-4 py-3 text-sm text-[#637268]">{formatTimezoneLabel(row.timezone)}</td>
                      <td className="px-4 py-3 text-sm text-[#637268]">{row.sent_count ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-[#637268]">{formatDateTime(row.last_sent_at)}</td>
                      <td className="px-4 py-3 text-sm text-[#637268]">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
