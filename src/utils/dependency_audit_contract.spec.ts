import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')

describe('dependency audit governance', () => {
  it('runs a pinned cargo-audit CLI without requesting check write access', () => {
    const workflow = read('.github/workflows/dependency-audit.yml')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain('actions/cache@v4')
    expect(workflow).toContain('~/.cargo/bin/cargo-audit')
    expect(workflow).toContain('cargo install cargo-audit --locked --version 0.22.2')
    expect(workflow).toContain('node scripts/verify_rustsec_acceptances.mjs')
    expect(workflow).toContain('cargo audit --file src-tauri/Cargo.lock')
    expect(workflow).not.toContain('rustsec/audit-check')
    expect(workflow).not.toContain('checks: write')
    expect(workflow).not.toContain('token:')
  })

  it('limits ignores to four documented and scope-guarded RustSec IDs', () => {
    const workflow = read('.github/workflows/dependency-audit.yml')
    const guard = read('scripts/verify_rustsec_acceptances.mjs')
    const documentation = read('docs/release-readiness/dependency-audit.md')
    const accepted = [
      'RUSTSEC-2024-0429',
      'RUSTSEC-2026-0097',
      'RUSTSEC-2026-0194',
      'RUSTSEC-2026-0195'
    ]
    for (const id of accepted) {
      expect(workflow).toContain(`--ignore ${id}`)
      expect(guard).toContain(id)
      expect(documentation).toContain(id)
    }
    expect(workflow.match(/--ignore RUSTSEC-/g)).toHaveLength(accepted.length)
  })

  it('pins patched parser and concurrency dependencies before applying acceptances', () => {
    const guard = read('scripts/verify_rustsec_acceptances.mjs')
    for (const requirement of [
      "crossbeam-epoch', '0.9.20'",
      "anyhow', '1.0.103'",
      "event-listener', '5.4.2'",
      "memmap2', '0.9.11'",
      "plist', '1.10.0'",
      "wayland-scanner', '0.31.11'",
      "quick-xml', '0.41.0'"
    ]) {
      expect(guard).toContain(requirement)
    }
    expect(guard).toContain("forbidPackage('quick-xml', '0.38.4'")
    expect(guard).toContain("'xcb@1.7.0': ['build']")
    expect(guard).toContain("'tauri-winrt-notification@0.7.2': ['normal']")
  })

  it('wires the scope guard into local and release-wide checks', () => {
    const packageJson = JSON.parse(read('package.json'))
    const allChecks = read('scripts/check_all.mjs')
    expect(packageJson.scripts['check:rustsec-acceptances']).toBe('node scripts/verify_rustsec_acceptances.mjs')
    expect(allChecks).toContain("['run', 'check:rustsec-acceptances']")
  })
})
