'use client'

export type Kind = 'doc' | 'sheet' | 'slides' | 'file'
export interface ItemMeta {
  id: string
  kind: Kind
  title: string
  mime: string | null
  size: number
  updated_at: string
}
export interface Item extends ItemMeta {
  content: string
}

async function json<T>(r: Response): Promise<T> {
  if (r.status === 401) {
    window.location.href = '/login'
    throw new Error('Sesión expirada')
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`)
  return r.json()
}

export const api = {
  list: () => fetch('/api/items', { cache: 'no-store' }).then((r) => json<ItemMeta[]>(r)),
  get: (id: string) => fetch(`/api/items/${id}`, { cache: 'no-store' }).then((r) => json<Item>(r)),
  create: (b: { kind: Kind; title: string; content?: string; mime?: string; size?: number }) =>
    fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) =>
      json<ItemMeta>(r),
    ),
  update: (id: string, b: { title?: string; content?: string }) =>
    fetch(`/api/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) =>
      json<ItemMeta>(r),
    ),
  remove: (id: string) => fetch(`/api/items/${id}`, { method: 'DELETE' }).then((r) => json(r)),
}

/** Límite práctico: Vercel acepta cuerpos de hasta ~4.5 MB por petición */
export const MAX_BYTES = 4_000_000

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function safeName(title: string) {
  return (title || 'archivo').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'archivo'
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result).split(',')[1] ?? '')
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
}

export function base64ToBlob(b64: string, mime: string) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(s: string) {
  return new Date(s).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Guardado automático con espera (debounce) */
export function makeSaver(save: () => Promise<unknown>, onState: (s: 'saving' | 'saved' | 'error' | 'dirty') => void, delay = 1200) {
  let t: ReturnType<typeof setTimeout> | null = null
  let running = false
  let again = false
  const run = async () => {
    if (running) {
      again = true
      return
    }
    running = true
    onState('saving')
    try {
      await save()
      onState('saved')
    } catch {
      onState('error')
    } finally {
      running = false
      if (again) {
        again = false
        run()
      }
    }
  }
  return {
    schedule() {
      onState('dirty')
      if (t) clearTimeout(t)
      t = setTimeout(run, delay)
    },
    flush() {
      if (t) {
        clearTimeout(t)
        t = null
        return run()
      }
    },
  }
}
