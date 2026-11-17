import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context, Service, FiberState, type Fiber } from 'cordis'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FetchHandler } from '@luckylillia/plugin-sdk'
import * as WebQQ from '../../src/index'

let ctx: Context
let directory: string
let routes: Map<string, FetchHandler>
let app: Hono
let protocol: Fiber
function stub(name: string, fields: Record<string, unknown> = {}) {
  return class extends Service {
    constructor(ctx: Context) { super(ctx, name); Object.assign(this, fields) }
  }
}
class MockWebui extends Service {
  constructor(ctx: Context) { super(ctx, 'webuiServer') }
  route(prefix: string, handler: FetchHandler) {
    return this.ctx.effect(() => { routes.set(prefix, handler); return () => { routes.delete(prefix) } })
  }
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'webqq-plugin-'))
  ctx = new Context()
  routes = new Map()
  ctx.accessor('storage', { get: () => ({ dir: async () => directory }) })
  app = new Hono().use('*', c => routes.get('/api/webqq')?.fetch(c.req.raw) ?? c.json({ success: false }, 404))
  for (const name of ['app', 'store', 'ntMsgApi', 'ntFileApi', 'ntUserApi', 'ntGroupApi', 'ntFriendApi']) await ctx.plugin(stub(name))
  protocol = await ctx.plugin(stub('qqProtocol', { selfInfo: { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true } }))
  await ctx.plugin(MockWebui)
})
afterEach(async () => {
  await ctx.fiber.dispose()
  const resolved = path.resolve(directory)
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('webqq-plugin-')) throw new Error('Unsafe cleanup')
  await rm(resolved, { recursive: true, force: true })
})
const request = (pathname: string) => app.request('http://localhost' + pathname)
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string) {
  let received = ''
  const decoder = new TextDecoder()
  while (!received.includes(text)) {
    const { done, value } = await reader.read()
    if (done) throw new Error('Stream ended early: ' + received)
    received += decoder.decode(value)
  }
  return received
}

describe('standalone WebQQ lifecycle', () => {
  it('mounts routes, preserves streams across layout changes and closes them on unload', async () => {
    expect((await request('/api/webqq/events')).status).toBe(404)
    const entry = await ctx.plugin(WebQQ)
    const response = await request('/api/webqq/events')
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/)
    const reader = response.body!.getReader()
    await readUntil(reader, 'event: connected')
    await entry.update({ autoHideSidebar: true, fullscreenButton: false })
    expect((await request('/api/webqq/self')).status).toBe(200)
    await ctx.parallel('nt/message-deleted', {
      msgId: '7001', msgSeq: 42, chatType: 2, peerUid: '987654', peerUin: 987654,
      operatorUid: 'u_1', senderUin: 1, operatorUin: 1, displaySuffix: '',
    } as never)
    expect(await readUntil(reader, 'message-deleted')).toContain('"isSelfOperate":true')
    await entry.dispose()
    await expect(reader.read()).resolves.toMatchObject({ done: true })
    expect((await request('/api/webqq/events')).status).toBe(404)
  })

  it('reports the identity used to isolate the frontend caches', async () => {
    await ctx.plugin(WebQQ)
    expect(await (await request('/api/webqq/self')).json()).toEqual({ success: true,
      data: { online: true, uid: 'test-uid', uin: '123456', nick: 'TestBot' },
    })
  })

  it('waits for required account services and never starts them itself', async () => {
    await protocol.dispose()
    const entry = ctx.plugin(WebQQ)
    await entry
    expect(entry.state).toBe(FiberState.PENDING)
    expect((await request('/api/webqq/self')).status).toBe(404)
  })
})
