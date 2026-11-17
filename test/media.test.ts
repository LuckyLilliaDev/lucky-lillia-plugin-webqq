import { Context, Service } from 'cordis'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { decodeSilk, FFmpegUnavailableError, getFFmpegAddon } from '../src/media'

describe('optional media provider lifecycle', () => {
  it('decodes with the active provider and stops using it after unload', async () => {
    const ctx = new Context()
    const transcodeAudio = vi.fn(async (_input: string, output: string) => { await writeFile(output, 'decoded-wav') })
    class Provider extends Service {
      constructor(ctx: Context) { super(ctx, 'ffmpeg') }
      silkVersion() { return 'test-silk' }
      transcodeAudio = transcodeAudio
    }
    let output: string | undefined
    try {
      const provider = await ctx.plugin(Provider)
      output = await decodeSilk(ctx, 'input.silk', 'wav')
      expect(await readFile(output, 'utf8')).toBe('decoded-wav')
      expect(transcodeAudio).toHaveBeenCalledWith('input.silk', output, { format: 'wav' })
      await provider.dispose()
      expect(() => getFFmpegAddon(ctx)).toThrow(FFmpegUnavailableError)
    } finally {
      await ctx.fiber.dispose()
      if (output) await unlink(output).catch(() => {})
    }
  })

  it('asks for an update when a provider does not advertise SILK support', async () => {
    const ctx = new Context()
    ctx.provide('ffmpeg', {} as never)
    try { await expect(decodeSilk(ctx, 'input.silk', 'wav')).rejects.toThrow('请更新并启用 FFmpeg 插件') }
    finally { await ctx.fiber.dispose() }
  })
})
