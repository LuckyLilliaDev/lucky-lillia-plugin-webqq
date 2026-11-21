import type { Context } from 'cordis'
import type { FFmpegAPI } from '@luckylillia-dev/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unlink } from 'node:fs/promises'

export class FFmpegUnavailableError extends Error {
  readonly code = 'FFMPEG_PLUGIN_MISSING'
  constructor(message = '未安装或未启用 FFmpeg 插件（@luckylillia-dev/plugin-ffmpeg），请安装并启用后重试') {
    super(message)
    this.name = 'FFmpegUnavailableError'
  }
}
export function isFFmpegUnavailableError(error: unknown): error is FFmpegUnavailableError {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'FFMPEG_PLUGIN_MISSING'
}
export function getFFmpegAddon(ctx: Context): FFmpegAPI {
  const service = ctx.get('ffmpeg')
  if (!service) throw new FFmpegUnavailableError()
  return service
}
export async function decodeSilk(ctx: Context, input: string, format: 'wav'): Promise<string> {
  const service = getFFmpegAddon(ctx)
  if (!service.silkVersion) throw new FFmpegUnavailableError('当前 FFmpeg 插件不支持 SILK，请更新并启用 FFmpeg 插件后重试')
  const output = path.join(tmpdir(), `webqq-${randomUUID()}.${format}`)
  try { await service.transcodeAudio(input, output, { format }); return output }
  catch (error) { await unlink(output).catch(() => {}); throw error }
}
export function isSilk(data: Buffer): boolean {
  const offset = data[0] === 2 ? 1 : 0
  return data.subarray(offset, offset + 9).equals(Buffer.from('#!SILK_V3'))
}
export function isWav(data: Buffer): boolean {
  return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
}
