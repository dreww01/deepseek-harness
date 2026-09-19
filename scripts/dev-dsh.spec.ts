import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertDevelopmentArtifacts, missingDevelopmentArtifacts } from './dev-dsh.ts'

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

function write(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'export {}\n')
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-dev-launch-'))
  writeJson(join(root, 'apps/cli/package.json'), {
    name: '@deepseek-ai/dsh',
    main: 'lib/bin.js',
    dependencies: { '@deepseek-ai/dsh-web-app': 'workspace:^' },
  })
  write(join(root, 'apps/cli/lib/bin.js'))
  writeJson(join(root, 'packages/bundle/web-app/package.json'), {
    name: '@deepseek-ai/dsh-web-app',
    main: 'lib/index.js',
    dependencies: { '@deepseek-ai/dsh-client-example': 'workspace:^' },
  })
  write(join(root, 'packages/bundle/web-app/lib/index.js'))
  writeJson(join(root, 'packages/client/example/package.json'), {
    name: '@deepseek-ai/dsh-client-example',
    main: 'lib/index.js',
    exports: {
      '.': { default: './lib/index.js' },
      './client': { default: './lib/client.js' },
    },
    dsh: { client: { platform: 'web' } },
  })
  write(join(root, 'packages/client/example/lib/index.js'))
  write(join(root, 'apps/web/dist/index.html'))
  return root
}

describe('development DSH artifact preflight', () => {
  it('reports an incomplete client build before profile boot', () => {
    const root = fixture()

    expect(missingDevelopmentArtifacts(root)).toEqual([
      'packages/client/example/lib/client.js',
    ])
    expect(() => { assertDevelopmentArtifacts(root) }).toThrowError([
      'dsh development launch: required build artifacts are missing:',
      '  - packages/client/example/lib/client.js',
      `Run this exact command from ${root}:`,
      '  pnpm run build',
    ].join('\n'))
  })

  it('accepts a complete development build', () => {
    const root = fixture()
    write(join(root, 'packages/client/example/lib/client.js'))

    expect(missingDevelopmentArtifacts(root)).toEqual([])
    expect(() => { assertDevelopmentArtifacts(root) }).not.toThrow()
  })
})
