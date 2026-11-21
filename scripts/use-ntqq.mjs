import fs from 'node:fs/promises'
import path from 'node:path'

// Development-only linking. Published manifests and lockfiles keep registry package identities.
const root = path.resolve(import.meta.dirname, '..')
const source = await fs.realpath(process.argv[2] ?? path.join(root, '../lucky-lillia-plugin-ntqq-protocol'))
const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'))
if (pkg.name !== '@luckylillia-dev/plugin-nt-protocol') throw new Error('Expected the NTQQ plugin repository')
await fs.access(path.join(source, 'lib/api.js'))
const target = path.join(root, 'node_modules/@luckylillia-dev/plugin-nt-protocol')
await fs.mkdir(path.dirname(target), { recursive: true })
const existing = await fs.lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error })
if (existing) {
  const resolved = await fs.realpath(target).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (resolved === source) process.exit(0)
  if (!existing.isSymbolicLink()) throw new Error('Remove the installed NTQQ development dependency before linking a checkout')
  await fs.unlink(target)
}
await fs.symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir')
console.log('Using built NTQQ checkout for WebQQ development')
