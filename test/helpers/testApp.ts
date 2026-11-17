import { Hono } from 'hono'
export function createTestApp(router: Hono, prefix = '/') { return new Hono().route(prefix, router) }
