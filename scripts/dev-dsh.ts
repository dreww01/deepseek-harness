import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const DEFAULT_DEV_PORT = '3081'
const BUILD_COMMAND = 'pnpm run build'
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

interface PackageManifest {
  readonly name?: string
  readonly main?: string
  readonly exports?: Record<string, string | { readonly default?: string }>
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly client?: { readonly platform?: unknown } }
}

function normalized(path: string): string {
  return path.split(sep).join('/')
}

function packageDirectories(root: string): Map<string, string> {
  const directories = new Map<string, string>()
  const roots = ['apps', 'packages', 'vendor']
  for (const group of roots) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    const stack = [base]
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === undefined) break
      const manifestPath = join(current, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
        if (typeof manifest.name === 'string') directories.set(manifest.name, current)
        continue
      }
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'lib' && entry.name !== 'dist') {
          stack.push(join(current, entry.name))
        }
      }
    }
  }
  return directories
}

/**
 * Resolve the Web profile's required source-build artifacts before Cordis starts.
 * @param root - repository root or a test fixture with a generated directory list.
 * @returns repository-relative paths that are absent.
 */
export function missingDevelopmentArtifacts(root: string): string[] {
  const packages = packageDirectories(root)
  const entry = packages.get('@deepseek-ai/dsh')
  if (entry === undefined) return ['apps/cli/package.json']

  const missing = new Set<string>()
  const visited = new Set<string>()
  const pending = ['@deepseek-ai/dsh']
  while (pending.length > 0) {
    const name = pending.pop()
    if (name === undefined) break
    if (visited.has(name)) continue
    visited.add(name)
    const directory = packages.get(name)
    if (directory === undefined) continue
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as PackageManifest
    const rootExport = manifest.exports?.['.']
    const runtime = typeof rootExport === 'string' ? rootExport : rootExport?.default ?? manifest.main
    if (runtime !== undefined) {
      const path = join(directory, runtime)
      if (!existsSync(path)) missing.add(normalized(relative(root, path)))
    }
    if (manifest.dsh?.client?.platform === 'web') {
      const clientExport = manifest.exports?.['./client']
      const clientRuntime = typeof clientExport === 'string' ? clientExport : clientExport?.default
      if (clientRuntime !== undefined) {
        const path = join(directory, clientRuntime)
        if (!existsSync(path)) missing.add(normalized(relative(root, path)))
      }
    }
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (packages.has(dependency)) pending.push(dependency)
    }
  }

  for (const path of ['apps/cli/lib/bin.js', 'apps/web/dist/index.html']) {
    if (!existsSync(join(root, path))) missing.add(path)
  }
  return [...missing].sort()
}

/** Fail before plugin loading when the source checkout is not fully built. */
export function assertDevelopmentArtifacts(root: string): void {
  const missing = missingDevelopmentArtifacts(root)
  if (missing.length === 0) return
  throw new Error([
    'dsh development launch: required build artifacts are missing:',
    ...missing.map(path => `  - ${path}`),
    `Run this exact command from ${root}:`,
    `  ${BUILD_COMMAND}`,
  ].join('\n'))
}

function developmentArgs(args: readonly string[]): string[] {
  const forwarded = args[0] === '--' ? args.slice(1) : [...args]
  const profile = forwarded[0] === '--profile' ? forwarded[1] : forwarded[0]
  if (profile === 'web' && !forwarded.includes('--port')) forwarded.push('--port', DEFAULT_DEV_PORT)
  if (profile === 'web' && !forwarded.includes('--no-open')) forwarded.push('--no-open')
  return forwarded
}

async function main(): Promise<void> {
  assertDevelopmentArtifacts(repoRoot)
  const home = join(repoRoot, '.dsh-development')
  await mkdir(home, { recursive: true })
  const result = await execa(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts', ...developmentArgs(process.argv.slice(2)),
  ], {
    cwd: repoRoot,
    env: { ...process.env, DSH_HOME: home },
    stdio: 'inherit',
    reject: false,
  })
  process.exitCode = result.exitCode ?? 1
}

if (import.meta.main) await main()
