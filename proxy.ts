import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next()

  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', req.nextUrl))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
