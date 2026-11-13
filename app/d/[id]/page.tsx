'use client'
import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { api, base64ToBlob, downloadBlob, type Item } from '@/lib/client'

const DocEditor = dynamic(() => import('@/components/DocEditor'), { ssr: false })
const SheetEditor = dynamic(() => import('@/components/SheetEditor'), { ssr: false })
const SlidesEditor = dynamic(() => import('@/components/SlidesEditor'), { ssr: false })
const DiagramEditor = dynamic(() => import('@/components/DiagramEditor'), { ssr: false })

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [item, setItem] = useState<Item | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(id).then(setItem).catch((e) => setError(e.message))
  }, [id])

  if (error)
    return (
      <main className="wrap">
        <p className="error">{error}</p>
        <a className="btn" href="/">← Volver</a>
      </main>
    )
  if (!item) return <main className="wrap muted">Cargando…</main>
  if (item.kind === 'doc') return <DocEditor item={item} />
  if (item.kind === 'sheet') return <SheetEditor item={item} />
  if (item.kind === 'slides') return <SlidesEditor item={item} />
  if (item.kind === 'diagram') return <DiagramEditor item={item} />
  return (
    <main className="wrap">
      <h2>{item.title}</h2>
      <button className="btn primary" onClick={() => downloadBlob(base64ToBlob(item.content, item.mime || ''), item.title)}>Descargar</button>{' '}
      <a className="btn" href="/">← Volver</a>
    </main>
  )
}
