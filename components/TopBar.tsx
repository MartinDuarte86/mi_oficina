'use client'
import { useEffect, useState } from 'react'

export type SaveState = 'saved' | 'saving' | 'error' | 'dirty'

const TEXT: Record<SaveState, string> = {
  saved: 'Guardado',
  saving: 'Guardando…',
  dirty: 'Cambios sin guardar',
  error: '⚠ Error al guardar',
}

export function TopBar({
  title,
  onTitle,
  state,
  kindClass,
  letter,
  children,
}: {
  title: string
  onTitle: (t: string) => void
  state: SaveState
  kindClass: string
  letter: string
  children?: React.ReactNode
}) {
  const [t, setT] = useState(title)
  useEffect(() => setT(title), [title])
  return (
    <header className="topbar">
      <a href="/" className="btn icon" title="Volver a Mis archivos">←</a>
      <span className={`badge ${kindClass}`}>{letter}</span>
      <input
        className="title-input"
        value={t}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => t.trim() && t !== title && onTitle(t.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="muted" style={{ color: state === 'error' ? 'var(--danger)' : undefined }}>{TEXT[state]}</span>
      <span className="spacer" />
      {children}
    </header>
  )
}

/** Avisa antes de cerrar la pestaña si hay cambios sin guardar */
export function useUnloadGuard(state: SaveState) {
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (state === 'dirty' || state === 'saving') e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [state])
}
