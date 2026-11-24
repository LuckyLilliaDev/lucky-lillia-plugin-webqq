import { Context } from 'cordis'
import { createMessagesRoutes } from './messages'
import { createUploadRoutes } from './upload'
import { createProxyRoutes } from './proxy'
import { createMembersRoutes } from './members'
import { createNotificationRoutes } from './notifications'
import { createChatsRoutes } from './chats'
import { createActionsRoutes } from './actions'
import { createGroupFilesRoutes } from './groupFiles'
import { createFaceRoutes } from './face'
import { forwardEvents } from './events'
import { Hono } from 'hono'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type {} from '@luckylillia-dev/plugin-sdk'
import type {} from '@luckylillia-dev/plugin-nt-protocol/contracts'
import { SendElement, installFFmpegBridge } from '@luckylillia-dev/plugin-nt-protocol/api'
import { SendPicElement } from '@luckylillia-dev/plugin-nt-protocol/api'
import { WebQQSchema } from './settings'

export interface WebQQRoutesOptions {
  uploadDir: string
  sseClients: Set<SSEStreamingApi>
  createPicElement: (imagePath: string) => Promise<SendPicElement | null>
}

export function createWebQQRoutes(ctx: Context, options: WebQQRoutesOptions): Hono {
  const router = new Hono()
  const { uploadDir, sseClients, createPicElement } = options

  router.route('/', createMessagesRoutes(ctx, createPicElement))
  router.route('/', createUploadRoutes(ctx, uploadDir))
  router.route('/', createProxyRoutes(ctx))
  router.route('/', createMembersRoutes(ctx))
  router.route('/', createNotificationRoutes(ctx))
  router.route('/', createChatsRoutes(ctx))
  router.route('/', createActionsRoutes(ctx))
  router.route('/', createGroupFilesRoutes(ctx))

  // The account the page scopes its stores and caches to
  router.get('/self', c => c.json({
    success: true,
    data: { online: ctx.qqProtocol.selfInfo.online, uid: ctx.qqProtocol.selfInfo.uid, uin: ctx.qqProtocol.selfInfo.uin, nick: ctx.qqProtocol.selfInfo.nick },
  }))

  router.get('/events', async (c) => {
    return streamSSE(c, async (stream) => {
      stream.writeSSE({
        data: '{}',
        event: 'connected'
      })
      sseClients.add(stream)
      stream.onAbort(() => {
        sseClients.delete(stream)
      })
      return new Promise((resolve) => {
        stream.onAbort(resolve)
      })
    })
  })

  return router
}

/**
 * The standalone WebQQ plugin: its routes, upload dir and SSE stream, plus
 * the NT listeners feeding the stream. It only comes up once everything its routes call is there.
 */
export const WebQQ = {
  name: 'webqq',
  inject: ['webuiServer', 'app', 'store', 'qqProtocol', 'ntMsgApi', 'ntFileApi', 'ntUserApi', 'ntGroupApi', 'ntFriendApi'],
  Config: WebQQSchema,
  async apply(ctx: Context) {
    // The settings are the WebUI's to read: taking them in place keeps the open chats' streams through a change
    ctx.on('internal/update', () => {})
    installFFmpegBridge(ctx)
    const uploadDir = path.join(await ctx.storage.dir(), 'uploads')
    mkdirSync(uploadDir, { recursive: true })
    const sseClients = new Set<SSEStreamingApi>()
    const createPicElement = async (imagePath: string) => {
      try {
        return await SendElement.pic(ctx, imagePath)
      } catch (e) {
        ctx.logger.error('创建图片元素失败:', e)
        return null
      }
    }
    ctx.webuiServer.route('/api/webqq', new Hono().route('/api/webqq', createWebQQRoutes(ctx, { uploadDir, sseClients, createPicElement })))
    ctx.webuiServer.route('/face', new Hono().route('/face', createFaceRoutes()), { public: true })
    forwardEvents(ctx, sseClients)
    // Pages still connected would otherwise wait on a stream nothing writes to any more
    ctx.effect(() => () => {
      for (const client of sseClients) client.abort()
    })
  },
}

export const name = '@luckylillia-dev/plugin-webqq'
export const inject = WebQQ.inject
export const Config = WebQQSchema
export type Config = import('./settings').WebQQSettings
export const apply = WebQQ.apply
