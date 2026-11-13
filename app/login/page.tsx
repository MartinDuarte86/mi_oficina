'use client'
import { useState } from 'react'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setBusy(false)
    if (r.ok) window.location.href = '/'
    else setError((await r.json().catch(() => ({}))).error || 'Error al entrar')
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/icon.svg" width={36} height={36} alt="" />
          <h1 style={{ margin: 0, fontSize: 22 }}>Mi Oficina</h1>
        </div>
        <input
          className="input"
          type="password"
          placeholder="Contraseña"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy || !password} style={{ justifyContent: 'center' }}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
