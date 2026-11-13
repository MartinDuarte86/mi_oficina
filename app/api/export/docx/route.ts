import HTMLtoDOCX from '@turbodocx/html-to-docx'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { html, title } = await req.json()
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${String(title ?? '')}</title></head><body>${String(html ?? '')}</body></html>`
  const out = (await HTMLtoDOCX(doc, null, { title: String(title ?? 'Documento'), table: { row: { cantSplit: true } } })) as ArrayBuffer | Buffer
  const body = out instanceof ArrayBuffer ? new Uint8Array(out) : new Uint8Array(out as Buffer)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  })
}
