/** Install/uninstall this plugin into a DSH profile (backup-first). */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const mode = args.includes('uninstall') ? 'uninstall' : 'install'
const get = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const dshHome = get('--dsh-home') ?? join(homedir(), '.dsh')
const harnessHome = process.env.APPDATA
  ? join(process.env.APPDATA, 'dsh-desktop', 'harness')
  : join(dshHome, 'harness')
const profile = get('--profile') ?? 'web'
const profileDir = join(harnessHome, 'profiles', profile)
const pluginName = 'dsh-prompt-optimizer'
const here = new URL('..', import.meta.url)
const herePath = decodeURIComponent(new URL(here).pathname).replace(/^\/([A-Za-z]:)/, '$1')

if (!existsSync(join(profileDir, 'package.json'))) {
  console.error(`profile not found: ${profileDir}`)
  process.exit(1)
}

const backup = (file) => {
  if (!existsSync(file)) return
  const stamp = `${file}.bak-${Date.now()}`
  copyFileSync(file, stamp)
  console.log(`backup: ${stamp}`)
}

const pkgPath = join(profileDir, 'package.json')
const patchPath = join(profileDir, 'cordis.patch.yml')

if (mode === 'install') {
  // 1. Build artifacts must exist (host entry compiled separately or via tsc).
  // 2. Copy runtime into local-plugins allow-list dir.
  const dest = join(harnessHome, 'local-plugins', pluginName)
  mkdirSync(dest, { recursive: true })
  for (const entry of ['package.json', 'cordis.patch.yml', 'lib', 'README.md', 'KNOWN_ISSUES.md']) {
    const src = join(herePath, entry)
    if (!existsSync(src)) continue
    cpSync(src, join(dest, entry), { recursive: true })
  }
  // 3. Declare local file dependency + bundle entry.
  backup(pkgPath)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.dependencies ??= {}
  pkg.dependencies[pluginName] = `file:../../local-plugins/${pluginName}`
  pkg.dsh ??= {}
  pkg.dsh.profile ??= {}
  pkg.dsh.profile.bundles ??= []
  if (!pkg.dsh.profile.bundles.includes(pluginName)) pkg.dsh.profile.bundles.push(pluginName)
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  // 4. Copy runtime into profile node_modules for immediate resolution.
  const modDest = join(profileDir, 'node_modules', pluginName)
  mkdirSync(modDest, { recursive: true })
  cpSync(dest, modDest, { recursive: true })
  backup(patchPath)
  console.log(`installed ${pluginName} into profile "${profile}". Restart DSH Desktop.`)
} else {
  backup(pkgPath)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  delete pkg.dependencies?.[pluginName]
  pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles ?? []).filter((b) => b !== pluginName)
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`uninstalled ${pluginName} from profile "${profile}". Restart DSH Desktop.`)
}
