import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  const item = await db().get((await params).id)
  if (!item) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: Request, { params }: Ctx) {
  const b = await req.json()
  const item = await db().update((await params).id, {
    title: typeof b.title === 'string' ? b.title.slice(0, 200) : undefined,
    content: typeof b.content === 'string' ? b.content : undefined,
  })
  if (!item) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(_: Request, { params }: Ctx) {
  await db().remove((await params).id)
  return NextResponse.json({ ok: true })
}
