'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, base64ToBlob, downloadBlob, fileToBase64, formatDate, formatSize, MAX_BYTES, type ItemMeta, type Kind } from '@/lib/client'
import { csvToWorkbook, docxToHtml, emptyWorkbook, xlsxToWorkbook } from '@/lib/convert'
import { emptyDeck } from '@/components/slides-model'

const LABEL: Record<Kind, string> = { doc: 'Documento', sheet: 'Hoja de cálculo', slides: 'Presentación', file: 'Archivo' }
const LETTER: Record<Kind, string> = { doc: 'W', sheet: 'X', slides: 'P', file: '⇩' }

export default function Home() {
  const router = useRouter()
  const [items, setItems] = useState<ItemMeta[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => api.list().then(setItems).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  async function createNew(kind: Exclude<Kind, 'file'>) {
    setBusy('Creando…')
    try {
      const content =
        kind === 'doc' ? '' : kind === 'sheet' ? JSON.stringify(emptyWorkbook()) : JSON.stringify(emptyDeck())
      const it = await api.create({ kind, title: `${LABEL[kind]} sin título`, content })
      router.push(`/d/${it.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy('')
    }
  }

  async function upload(files: FileList | File[]) {
    setError('')
    for (const file of Array.from(files)) {
      setBusy(`Subiendo ${file.name}…`)
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        const base = file.name.replace(/\.[^.]+$/, '')
        if (ext === 'docx') {
          const html = await docxToHtml(await file.arrayBuffer())
          await api.create({ kind: 'doc', title: base, content: JSON.stringify({ html }) })
        } else if (ext === 'xlsx') {
          const wb = await xlsxToWorkbook(await file.arrayBuffer(), base)
          await api.create({ kind: 'sheet', title: base, content: JSON.stringify(wb) })
        } else if (ext === 'csv') {
          await api.create({ kind: 'sheet', title: base, content: JSON.stringify(csvToWorkbook(await file.text(), base)) })
        } else if (ext === 'txt' || ext === 'md') {
          const esc = (await file.text()).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
          const html = esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
          await api.create({ kind: 'doc', title: base, content: JSON.stringify({ html }) })
        } else {
          if (file.size * 1.37 > MAX_BYTES) throw new Error(`${file.name} supera el límite de ~2.9 MB por archivo`)
          await api.create({ kind: 'file', title: file.name, content: await fileToBase64(file), mime: file.type, size: file.size })
        }
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    setBusy('')
    load()
  }

  async function del(it: ItemMeta) {
    if (!confirm(`¿Eliminar "${it.title}"? No se puede deshacer.`)) return
    await api.remove(it.id)
    load()
  }

  async function download(it: ItemMeta) {
    const full = await api.get(it.id)
    downloadBlob(base64ToBlob(full.content, full.mime || ''), full.title)
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const shown = (items ?? []).filter(
    (i) => (filter === 'all' || i.kind === filter) && i.title.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <>
      <header className="topbar">
        <img src="/icon.svg" width={28} height={28} alt="" />
        <strong style={{ fontSize: 17 }}>Mi Oficina</strong>
        <span className="spacer" />
        <button className="btn" onClick={logout}>Salir</button>
      </header>
      <main
        className={`wrap ${drag ? 'drop' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files)
        }}
      >
        <h2 style={{ margin: '4px 0 0' }}>Crear nuevo</h2>
        <div className="new-grid">
          {(['doc', 'sheet', 'slides'] as const).map((k) => (
            <button key={k} className="new-card" onClick={() => createNew(k)} disabled={!!busy}>
              <span className={`badge k-${k}`}>{LETTER[k]}</span>
              <span>{LABEL[k]}</span>
            </button>
          ))}
          <button className="new-card" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <span className="badge k-file">↑</span>
            <span>
              Subir archivo
              <div className="muted">.docx .xlsx .csv se abren para editar</div>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        <div className="toolbar-row">
          <h2 style={{ margin: 0, flex: 1 }}>Mis archivos</h2>
          <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as Kind | 'all')}>
            <option value="all">Todos</option>
            <option value="doc">Documentos</option>
            <option value="sheet">Hojas de cálculo</option>
            <option value="slides">Presentaciones</option>
            <option value="file">Archivos</option>
          </select>
        </div>
        {busy && <p className="muted">{busy}</p>}
        {error && <p className="error">{error}</p>}

        <div className="list">
          {items === null ? (
            <div className="empty">Cargando…</div>
          ) : shown.length === 0 ? (
            <div className="empty">{items.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay nada. Crea un documento o arrastra archivos aquí.'}</div>
          ) : (
            shown.map((it) => (
              <div className="row" key={it.id}>
                <span className={`badge k-${it.kind}`}>{LETTER[it.kind]}</span>
                {it.kind === 'file' ? (
                  <a className="name" href="#" onClick={(e) => { e.preventDefault(); download(it) }}>{it.title}</a>
                ) : (
                  <a className="name" href={`/d/${it.id}`}>{it.title}</a>
                )}
                <span className="muted" style={{ minWidth: 70, textAlign: 'right' }}>{it.kind === 'file' ? formatSize(it.size) : ''}</span>
                <span className="muted" style={{ minWidth: 150, textAlign: 'right' }}>{formatDate(it.updated_at)}</span>
                <button className="btn icon danger" title="Eliminar" onClick={() => del(it)}>✕</button>
              </div>
            ))
          )}
        </div>
        <p className="muted" style={{ marginTop: 16 }}>Consejo: arrastra archivos sobre esta página para subirlos.</p>
      </main>
    </>
  )
}
