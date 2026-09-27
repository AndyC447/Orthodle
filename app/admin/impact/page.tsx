'use client'

import { useEffect, useState } from 'react'
import { PublicImpactPage } from '@/components/PublicImpactPage'

export default function AdminImpactPage() {
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const saved = window.sessionStorage.getItem('orthodle_admin_password')
        if (!saved) return
        const response = await fetch('/api/admin-login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: saved }),
        })
        if (!cancelled) setAuthorized(response.ok)
      } catch {
        if (!cancelled) setError('Could not check your sign-in. Please try again.')
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [])

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setChecking(true)
    setError('')
    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      })
      if (!response.ok) { setError('Incorrect admin password. Please try again.'); return }
      window.sessionStorage.setItem('orthodle_admin_password', password.trim())
      window.sessionStorage.setItem('orthodle_admin_unlocked', 'true')
      setAuthorized(true)
      setPassword('')
    } catch { setError('Could not sign in. Please try again.') }
    finally { setChecking(false) }
  }

  if (authorized) return <PublicImpactPage adminMode />

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-[22px] border border-[#e7e1d6] bg-white p-6">
        <h1 className="font-serif text-2xl font-bold text-[#102018]">ERAS showcase admin</h1>
        <p className="mt-2 text-sm text-[#637268]">Use your existing admin password to choose the cases shown on the public ERAS page.</p>
        <label className="mt-4 block text-sm font-semibold text-[#102018]">Admin password
          <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-[#ded7ca] p-2" />
        </label>
        <button disabled={checking} className="mt-4 rounded-lg bg-[#1f6448] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{checking ? 'Checking sign-in…' : 'Sign in'}</button>
        <p role="status" className="mt-3 text-sm text-[#a24d24]">{error}</p>
      </form>
    </main>
  )
}
