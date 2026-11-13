'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, base64ToBlob, downloadBlob, fileToBase64, makeSaver, MAX_BYTES, safeName, type Item } from '@/lib/client'
import { TopBar, useUnloadGuard, type SaveState } from './TopBar'

/**
 * Editor de diagramas tipo Visio basado en draw.io / diagrams.net (Apache-2.0).
 * draw.io corre dentro de un iframe en "modo embebido" y se comunica por postMessage:
 * el diagrama nunca sale de tu navegador hacia diagrams.net, solo se guarda en tu base.
 * Puedes apuntar a tu propia instancia de draw.io con NEXT_PUBLIC_DRAWIO_URL.
 */
const DRAWIO_URL = (process.env.NEXT_PUBLIC_DRAWIO_URL || 'https://embed.diagrams.net').replace(/\/$/, '')
const DRAWIO_ORIGIN = new URL(DRAWIO_URL).origin
const VISIO_PREFIX = 'data:application/vnd.visio;base64,'

type Msg = { event: string; xml?: string; data?: string; format?: string; message?: { id?: number }; error?: string }

export default function DiagramEditor({ item }: { item: Item }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [title, setTitle] = useState(item.title)
  const [state, setState] = useState<SaveState>('saved')
  const [ready, setReady] = useState(false)
  const xmlRef = useRef(item.content)
  const pending = useRef(new Map<number, (m: Msg) => void>())
  const seq = useRef(0)
  useUnloadGuard(state)

  const saver = useMemo(() => makeSaver(() => api.update(item.id, { content: xmlRef.current }), setState, 1200), [item.id])

  const post = (m: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(m), DRAWIO_ORIGIN)
  const request = (m: Record<string, unknown>) =>
    new Promise<Msg>((resolve) => {
      const id = ++seq.current
      pending.current.set(id, resolve)
      post({ ...m, message: { id } })
    })

  const src = useMemo(() => {
    const p = new URLSearchParams({
      embed: '1',
      proto: 'json',
      spin: '1',
      ui: 'kennedy',
      lang: 'es',
      libraries: '1',
      noSaveBtn: '1',
      noExitBtn: '1',
      saveAndExit: '0',
      // Sin integraciones con Google Drive, OneDrive, GitHub, etc.: todo se guarda en Mi Oficina
      stealth: '1',
    })
    return `${DRAWIO_URL}/?${p}`
  }, [])

  function load(content: string) {
    // content: XML de draw.io, vacío (diagrama nuevo) o un .vsdx/.vsd como data URI
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    post({ action: 'load', xml: content, autosave: 1, title, dark })
  }

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== DRAWIO_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let m: Msg
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      const id = m.message?.id
      if (id != null && pending.current.has(id)) {
        pending.current.get(id)!(m)
        pending.current.delete(id)
        return
      }
      if (m.event === 'init') {
        load(xmlRef.current)
      } else if (m.event === 'load') {
        setReady(true)
        // Un Visio importado se convierte a formato draw.io y se guarda así desde ya
        if (xmlRef.current.startsWith(VISIO_PREFIX)) {
          request({ action: 'export', format: 'xml' }).then((r) => {
            if (!r.xml) return
            xmlRef.current = r.xml
            saver.schedule()
          })
        }
      } else if ((m.event === 'autosave' || m.event === 'save') && m.xml != null) {
        xmlRef.current = m.xml
        saver.schedule()
        if (m.event === 'save') saver.flush()
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      saver.flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saver])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saver.flush()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [saver])

  async function rename(t: string) {
    setTitle(t)
    await api.update(item.id, { title: t })
  }

  async function exportAs(format: 'xmlsvg' | 'xmlpng') {
    const r = await request({ action: 'export', format, spinKey: 'export', border: 10 })
    if (!r.data) return alert(r.error || 'No se pudo exportar')
    const [head, b64] = r.data.split(',')
    const mime = head.slice(5).split(';')[0]
    const blob = head.includes(';base64') ? base64ToBlob(b64, mime) : new Blob([decodeURIComponent(b64)], { type: mime })
    downloadBlob(blob, `${safeName(title)}.${format === 'xmlsvg' ? 'svg' : 'png'}`)
  }

  function exportDrawio() {
    downloadBlob(new Blob([xmlRef.current], { type: 'application/xml' }), `${safeName(title)}.drawio`)
  }

  function importFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.vsdx,.vsd,.drawio,.dio,.xml'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      if (!confirm('Esto reemplaza todo el diagrama actual. ¿Continuar?')) return
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (ext === 'vsdx' || ext === 'vsd') {
        if (f.size * 1.37 > MAX_BYTES) return alert('El archivo de Visio supera el límite de ~2.9 MB')
        xmlRef.current = VISIO_PREFIX + (await fileToBase64(f))
      } else {
        xmlRef.current = await f.text()
        saver.schedule()
      }
      load(xmlRef.current)
    }
    input.click()
  }

  return (
    <>
      <TopBar title={title} onTitle={rename} state={state} kindClass="k-diagram" letter="V">
        <button className="btn" onClick={importFile} disabled={!ready} title="Abrir un .vsdx / .vsd de Visio o un .drawio">
          Importar Visio
        </button>
        <button className="btn" onClick={exportDrawio} disabled={!ready} title="Formato nativo de draw.io (se abre en draw.io de escritorio o en diagrams.net)">
          .drawio
        </button>
        <button className="btn" onClick={() => exportAs('xmlsvg')} disabled={!ready} title="SVG editable: lleva el diagrama dentro">
          SVG
        </button>
        <button className="btn" onClick={() => exportAs('xmlpng')} disabled={!ready} title="PNG editable: lleva el diagrama dentro">
          PNG
        </button>
      </TopBar>
      {!ready && <div className="muted" style={{ position: 'fixed', inset: '53px 0 0 0', display: 'grid', placeItems: 'center' }}>Cargando editor de diagramas…</div>}
      <iframe ref={frame} className="diagram-host" src={src} title="Editor de diagramas" allow="clipboard-read; clipboard-write" />
    </>
  )
}
