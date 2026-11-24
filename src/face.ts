import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'

const SAFE_FACE_FILE = /^[a-z0-9-]+\.png$/i

/** Serves bundled QQ and Unicode emoji face PNGs under `/face/:file` with long-lived caching. */
export function createFaceRoutes(faceDir = path.resolve(import.meta.dirname, '../assets/face')): Hono {
  const router = new Hono()

  router.on(['GET', 'HEAD'], '/:file', async (c) => {
    const file = c.req.param('file')
    if (!SAFE_FACE_FILE.test(file)) return c.notFound()
    let data: Buffer
    try {
      data = await readFile(path.join(faceDir, file))
    } catch {
      return c.notFound()
    }
    return new Response(c.req.method === 'HEAD' ? null : new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })

  return router
}
