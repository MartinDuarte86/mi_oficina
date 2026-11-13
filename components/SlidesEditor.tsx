'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, downloadBlob, makeSaver, safeName, type Item } from '@/lib/client'
import { TopBar, useUnloadGuard, type SaveState } from './TopBar'
import { newSlide, parseDeck, THEMES, type Deck, type Layout, type Slide } from './slides-model'

export default function SlidesEditor({ item }: { item: Item }) {
  const [title, setTitle] = useState(item.title)
  const [state, setState] = useState<SaveState>('saved')
  const [deck, setDeck] = useState<Deck>(() => parseDeck(item.content))
  const [cur, setCur] = useState(0)
  const [presenting, setPresenting] = useState<number | null>(null)
  const deckRef = useRef(deck)
  deckRef.current = deck
  useUnloadGuard(state)

  const saver = useMemo(() => makeSaver(() => api.update(item.id, { content: JSON.stringify(deckRef.current) }), setState), [item.id])
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    saver.schedule()
  }, [deck, saver])

  const slide = deck.slides[Math.min(cur, deck.slides.length - 1)]
  const patch = (p: Partial<Slide>) =>
    setDeck((d) => ({ ...d, slides: d.slides.map((s) => (s.id === slide.id ? { ...s, ...p } : s)) }))

  function add(layout: Layout) {
    const theme = { name: '', bg: slide.bg, color: slide.color }
    const s = newSlide(layout, theme)
    setDeck((d) => {
      const slides = [...d.slides]
      slides.splice(cur + 1, 0, s)
      return { ...d, slides }
    })
    setCur(cur + 1)
  }
  function duplicate() {
    setDeck((d) => {
      const slides = [...d.slides]
      slides.splice(cur + 1, 0, { ...slide, id: Math.random().toString(36).slice(2, 10) })
      return { ...d, slides }
    })
    setCur(cur + 1)
  }
  function remove() {
    if (deck.slides.length === 1) return
    if (!confirm('¿Eliminar esta diapositiva?')) return
    setDeck((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slide.id) }))
    setCur(Math.max(0, cur - 1))
  }
  function move(dir: -1 | 1) {
    const j = cur + dir
    if (j < 0 || j >= deck.slides.length) return
    setDeck((d) => {
      const slides = [...d.slides]
      ;[slides[cur], slides[j]] = [slides[j], slides[cur]]
      return { ...d, slides }
    })
    setCur(j)
  }
  function applyThemeAll(bg: string, color: string) {
    setDeck((d) => ({ ...d, slides: d.slides.map((s) => ({ ...s, bg, color })) }))
  }
  function pickImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return
      if (f.size > 1_000_000 && !confirm('La imagen pesa más de 1 MB. ¿Insertar igual?')) return
      const fr = new FileReader()
      fr.onload = () => patch({ image: String(fr.result), layout: 'image' })
      fr.readAsDataURL(f)
    }
    input.click()
  }

  async function rename(t: string) {
    setTitle(t)
    await api.update(item.id, { title: t })
  }

  async function exportPptx() {
    const PptxGenJS = (await import('pptxgenjs')).default
    const p = new PptxGenJS()
    p.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 in
    p.title = title
    for (const s of deck.slides) {
      const sl = p.addSlide()
      sl.background = { color: s.bg.replace('#', '') }
      const color = s.color.replace('#', '')
      if (s.layout === 'title') {
        sl.addText(s.title || ' ', { x: 0.8, y: 2.3, w: 11.7, h: 1.6, fontSize: 44, bold: true, color, align: 'center', valign: 'middle' })
        if (s.body) sl.addText(s.body, { x: 0.8, y: 4.0, w: 11.7, h: 1.2, fontSize: 22, color, align: 'center', valign: 'top' })
      } else {
        sl.addText(s.title || ' ', { x: 0.7, y: 0.4, w: 11.9, h: 1.1, fontSize: 34, bold: true, color, valign: 'middle' })
        if (s.layout === 'content') {
          const lines = s.body.split('\n').filter((l) => l.trim())
          if (lines.length)
            sl.addText(
              lines.map((l) => ({ text: l.replace(/^[-•*]\s*/, ''), options: { bullet: true, breakLine: true } })),
              { x: 0.7, y: 1.7, w: 11.9, h: 5.3, fontSize: 22, color, valign: 'top', paraSpaceAfter: 8 },
            )
        } else {
          if (s.image) sl.addImage({ data: s.image.startsWith('data:') ? s.image : undefined, path: s.image.startsWith('data:') ? undefined : s.image, x: 1.5, y: 1.6, w: 10.3, h: 4.9, sizing: { type: 'contain', w: 10.3, h: 4.9 } })
          if (s.body) sl.addText(s.body, { x: 0.7, y: 6.6, w: 11.9, h: 0.6, fontSize: 16, color, align: 'center' })
        }
      }
      if (s.notes) sl.addNotes(s.notes)
    }
    const blob = (await p.write({ outputType: 'blob' })) as Blob
    downloadBlob(blob, `${safeName(title)}.pptx`)
  }

  // Navegación en modo presentación
  useEffect(() => {
    if (presenting === null) return
    const h = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) setPresenting((i) => Math.min((i ?? 0) + 1, deck.slides.length - 1))
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) setPresenting((i) => Math.max((i ?? 0) - 1, 0))
      else if (e.key === 'Escape') setPresenting(null)
    }
    const fs = () => !document.fullscreenElement && setPresenting(null)
    window.addEventListener('keydown', h)
    document.addEventListener('fullscreenchange', fs)
    return () => {
      window.removeEventListener('keydown', h)
      document.removeEventListener('fullscreenchange', fs)
    }
  }, [presenting, deck.slides.length])

  function present(from: number) {
    setPresenting(from)
    document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <>
      <TopBar title={title} onTitle={rename} state={state} kindClass="k-slides" letter="P">
        <button className="btn" onClick={exportPptx}>Descargar .pptx</button>
        <button className="btn primary" onClick={() => present(0)}>▶ Presentar</button>
      </TopBar>
      <div className="slides-layout">
        <aside className="thumbs">
          {deck.slides.map((s, i) => (
            <div key={s.id} className={`thumb ${i === cur ? 'active' : ''}`} onClick={() => setCur(i)} style={{ width: 170 }}>
              <SlideView slide={s} />
              <span className="num">{i + 1}</span>
            </div>
          ))}
        </aside>
        <section className="stage">
          <div className="slide-props">
            <button className="btn" onClick={() => add('content')}>+ Diapositiva</button>
            <select className="btn" value="" onChange={(e) => e.target.value && add(e.target.value as Layout)}>
              <option value="">+ Con diseño…</option>
              <option value="title">Portada</option>
              <option value="content">Título y viñetas</option>
              <option value="image">Título e imagen</option>
            </select>
            <button className="btn" onClick={duplicate}>Duplicar</button>
            <button className="btn icon" title="Mover arriba" onClick={() => move(-1)}>↑</button>
            <button className="btn icon" title="Mover abajo" onClick={() => move(1)}>↓</button>
            <button className="btn danger" onClick={remove} disabled={deck.slides.length === 1}>Eliminar</button>
            <span className="spacer" />
            <label>
              Diseño
              <select className="btn" value={slide.layout} onChange={(e) => patch({ layout: e.target.value as Layout })}>
                <option value="title">Portada</option>
                <option value="content">Título y viñetas</option>
                <option value="image">Título e imagen</option>
              </select>
            </label>
            <label>
              Fondo <input type="color" value={slide.bg} onChange={(e) => patch({ bg: e.target.value })} />
            </label>
            <label>
              Texto <input type="color" value={slide.color} onChange={(e) => patch({ color: e.target.value })} />
            </label>
            <select className="btn" value="" onChange={(e) => {
              const t = THEMES[Number(e.target.value)]
              if (t) applyThemeAll(t.bg, t.color)
            }}>
              <option value="">Tema para todas…</option>
              {THEMES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
            </select>
            {slide.layout === 'image' && <button className="btn" onClick={pickImage}>{slide.image ? 'Cambiar imagen' : 'Elegir imagen'}</button>}
          </div>
          <div style={{ width: '100%', maxWidth: 960 }}>
            <SlideView slide={slide} editable onChange={patch} key={slide.id} />
          </div>
          <textarea
            className="input notes"
            placeholder="Notas del orador (no se muestran al presentar)"
            value={slide.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value })}
          />
          <p className="muted">Escribe directamente sobre la diapositiva. En “Título y viñetas”, cada línea es una viñeta.</p>
        </section>
      </div>
      {presenting !== null && (
        <div className="present" onClick={() => setPresenting((i) => Math.min((i ?? 0) + 1, deck.slides.length - 1))}>
          <SlideView slide={deck.slides[presenting]} />
        </div>
      )}
    </>
  )
}

function Editable({ value, onChange, className, ph, editable }: { value: string; onChange?: (v: string) => void; className: string; ph: string; editable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  useEffect(() => {
    // Solo reescribir el DOM si el valor cambió desde fuera (no mientras se escribe)
    if (ref.current && value !== last.current) {
      ref.current.innerText = value
      last.current = value
    }
  }, [value, editable])
  if (!editable) return value ? <div className={className}>{value}</div> : null
  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-ph={ph}
      onInput={(e) => {
        const v = (e.target as HTMLDivElement).innerText.replace(/\n$/, '')
        last.current = v
        onChange?.(v)
      }}
      onPaste={(e) => {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
    />
  )
}

function SlideView(props: { slide: Slide; editable?: boolean; onChange?: (p: Partial<Slide>) => void }) {
  return <div className="slide-box"><SlideInner {...props} /></div>
}

function SlideInner({ slide: s, editable, onChange }: { slide: Slide; editable?: boolean; onChange?: (p: Partial<Slide>) => void }) {
  const style = { background: s.bg, color: s.color }
  const title = <Editable editable={editable} className="s-title" value={s.title} ph="Haz clic para añadir un título" onChange={(v) => onChange?.({ title: v })} />
  if (s.layout === 'title')
    return (
      <div className="slide l-title" style={style}>
        {title}
        <Editable editable={editable} className="s-body" value={s.body} ph="Subtítulo" onChange={(v) => onChange?.({ body: v })} />
      </div>
    )
  if (s.layout === 'image')
    return (
      <div className="slide l-image" style={style}>
        {title}
        <div className="s-img">{s.image ? <img src={s.image} alt="" /> : editable ? <span style={{ opacity: 0.5, alignSelf: 'center' }}>Sin imagen: usa “Elegir imagen”</span> : null}</div>
        <Editable editable={editable} className="s-body" value={s.body} ph="Pie de imagen (opcional)" onChange={(v) => onChange?.({ body: v })} />
      </div>
    )
  return (
    <div className="slide l-content" style={style}>
      {title}
      {editable ? (
        <Editable editable className="s-body" value={s.body} ph="• Escribe una viñeta por línea" onChange={(v) => onChange?.({ body: v })} />
      ) : (
        <div className="s-body">
          <ul>{s.body.split('\n').filter((l) => l.trim()).map((l, i) => <li key={i}>{l.replace(/^[-•*]\s*/, '')}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
