import type { WebUIContext } from '@luckylillia-dev/plugin-sdk/webui'

let current: WebUIContext | undefined

/** Set by apply(): the API helpers and stores run outside components and have no other way to it. */
export function bindContext(ctx: WebUIContext) {
  current = ctx
}

export function webui(): WebUIContext {
  if (!current) throw new Error('the WebQQ client is used before its apply() ran')
  return current
}

export const showToast = (message: string, type?: 'success' | 'error' | 'warning') => webui().toast(message, type)

/** Resolves a public path (e.g. `/face/0.png`) under the gateway's `/i/<instance>` prefix when present. */
export function assetUrl(path: string): string {
  const ctx = current as (WebUIContext & { url?(p: string): string }) | undefined
  if (ctx?.url) return ctx.url(path)
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/i/')) return path
  const pathname = typeof location === 'undefined' ? '' : location.pathname
  const match = /^\/i\/([^/]+)(?:\/|$)/.exec(pathname)
  return match ? `/i/${match[1]}${path}` : path
}
