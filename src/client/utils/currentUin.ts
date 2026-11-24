// 按账号隔离的存储 key 都要拼这个前缀, 同一浏览器可能先后登录多个账号。WebQQEntry.tsx 在账号在线时写入,
// 之前返回空串, 调用方见到空串就不要持久化。多实例共享同一端口时按实例隔离, 避免两个标签页互相覆盖

const KEY = 'current-uin'
const PREFIXED = /^\/i\/([^/]+)(?:\/|$)/

function storageKey(): string {
  if (typeof location === 'undefined') return KEY
  const match = PREFIXED.exec(location.pathname)
  if (!match) return KEY
  try {
    return `${KEY}:${decodeURIComponent(match[1])}`
  } catch {
    return `${KEY}:${match[1]}`
  }
}

export function getCurrentUin(): string {
  const key = storageKey()
  return localStorage.getItem(key) || (key !== KEY ? localStorage.getItem(KEY) || '' : '')
}

export function setCurrentUin(uin: string): void {
  localStorage.setItem(storageKey(), uin)
}
