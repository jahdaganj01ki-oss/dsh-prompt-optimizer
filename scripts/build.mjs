/** Build the DSH client bundle (esbuild binary invoked directly). */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const bin = join(
  root,
  'node_modules',
  '@esbuild',
  isWin ? 'win32-x64' : 'linux-x64',
  isWin ? 'esbuild.exe' : 'bin-esbuild',
)
if (!existsSync(bin)) {
  console.error(`esbuild binary not found: ${bin} (run npm install first)`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const externals = [
  ...(pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []),
  'react',
  'react-dom',
  'react/jsx-runtime',
]

const args = [
  join(root, 'src/client.tsx'),
  '--bundle',
  '--platform=browser',
  '--format=cjs',
  '--target=es2020',
  '--jsx=automatic',
  ...externals.map((e) => `--external:${e}`),
  `--outfile=${join(root, 'lib', 'client.raw.js')}`,
]
execFileSync(bin, args, { stdio: 'inherit' })

// Wrap in the DSH ModuleLoader envelope (same shape as dsh-provider-extension).
const raw = readFileSync(join(root, 'lib', 'client.raw.js'), 'utf8')
const wrapped = `window.__ModuleLoader__.load({id:"dsh-prompt-optimizer",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${raw}\n;return module.exports;}});\n`
writeFileSync(join(root, 'lib', 'client.js'), wrapped)
unlinkSync(join(root, 'lib', 'client.raw.js'))
console.log('wrote lib/client.js')
