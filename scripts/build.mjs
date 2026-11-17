import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'lib')
if (path.dirname(output) !== root || path.basename(output) !== 'lib') throw new Error('Unsafe build output')
await fs.rm(output, { recursive: true, force: true })
const backend = await build({
  absWorkingDir: root, entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true,
  format: 'esm', platform: 'node', target: 'node22', sourcemap: true, metafile: true, external: ['cordis', 'cosmokit', 'schemastery', '@luckylillia/plugin-sdk', '@luckylillia/plugin-sdk/*'],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
})
const forbidden = Object.keys(backend.metafile.inputs).filter(file =>
  /(?:^|[/\\])(?:native|qqProtocol|direct-lib)(?:[/\\])/.test(file) || /LuckyLillia\.Bot[/\\]src/.test(file))
if (forbidden.length) throw new Error('WebQQ may only bundle public NTQQ helpers: ' + forbidden.join(', '))
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const program = ts.createProgram(parsed.fileNames.filter(file => !file.replaceAll('\\', '/').includes('/client/')), {
  ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true,
  rootDir: path.join(root, 'src'), outDir: path.join(output, 'types'),
})
const result = program.emit()
const errors = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].filter(item => item.category === ts.DiagnosticCategory.Error)
if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
}))
await build({
  absWorkingDir: root, entryPoints: ['src/client/index.tsx'], outdir: 'lib/client', entryNames: 'module', chunkNames: 'chunks/[name]-[hash]', splitting: true, bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', minify: true,
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@luckylillia/plugin-sdk/webui'],
})
const require = createRequire(import.meta.url)
const tw = path.dirname(require.resolve('tailwindcss/package.json')).replaceAll('\\', '/')
const css = '@import "' + tw + '/theme.css" layer(theme);\n'
  + '@import "' + tw + '/utilities.css" layer(utilities) source(none);\n'
  + '@source "' + path.join(root, 'src/client').replaceAll('\\', '/') + '";\n'
  + '@custom-variant dark (&:where(.dark, .dark *));\n'
const styled = await postcss([tailwind({ base: root, optimize: true })]).process(css, { from: path.join(root, 'client.css') })
await fs.writeFile(path.join(output, 'client/style.css'), styled.css)
await fs.writeFile(path.join(output, 'client/index.js'), `import apply from './module.js'
export default function(ctx) {
  if (ctx.style) { ctx.style('utilities', ${JSON.stringify(styled.css)}, { scope: 'plugin', when: 'loaded' }); return apply(ctx) }
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = new URL('./style.css', import.meta.url).href
  document.head.append(style)
  try { const stop = apply(ctx); return () => { if (typeof stop === 'function') stop(); style.remove() } }
  catch (error) { style.remove(); throw error }
}
`)
console.log('Built standalone WebQQ backend and lazy WebUI')
