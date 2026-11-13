import { NextResponse } from 'next/server'
import { db, type Kind } from '@/lib/db'

export const dynamic = 'force-dynamic'
const KINDS: Kind[] = ['doc', 'sheet', 'slides', 'file']

export async function GET() {
  return NextResponse.json(await db().list())
}

export async function POST(req: Request) {
  const b = await req.json()
  if (!KINDS.includes(b.kind)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  const content = typeof b.content === 'string' ? b.content : ''
  const item = await db().create({
    kind: b.kind,
    title: String(b.title || 'Sin título').slice(0, 200),
    content,
    mime: b.mime ? String(b.mime) : null,
    size: typeof b.size === 'number' ? b.size : content.length,
  })
  return NextResponse.json(item)
}
