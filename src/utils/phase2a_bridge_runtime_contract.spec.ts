import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8')

const bridge = read('src-tauri/src/http_server.rs')
const vite = read('vite.config.ts')
const capacitor = read('capacitor.config.ts')
const app = read('src/App.vue')
const ai = read('src/components/AiChatView.vue')
const externalSmoke = read('scripts/test_bridge_http_contract.mjs')

describe('Phase 2A Bridge runtime compatibility', () => {
  it('keeps public navigation resources read-only while protecting mutations', () => {
    expect(bridge).toContain('path.starts_with("/exports/")')
    expect(bridge).toContain('path.starts_with("/module_bundle/content/")')
    expect(bridge).toContain('path.starts_with("/school-website/")')
    expect(bridge).toContain('BridgeRoutePolicy::PublicEmbed')
    expect(bridge).toContain('matches!(*method, Method::GET | Method::HEAD)')
    expect(bridge).toContain('bridge_route_policy("/module_bundle/prepare")')
    expect(bridge).toContain('BridgeRoutePolicy::Protected')
  })

  it('supports Tauri, Vite and Capacitor loopback contexts only', () => {
    expect(bridge).toContain('"tauri" | "capacitor" => host == "localhost"')
    expect(bridge).toContain('"localhost" | "127.0.0.1" | "::1" | "tauri.localhost"')
    expect(vite).toContain("'/bridge'")
    expect(vite).toContain("target: 'http://127.0.0.1:4399'")
    expect(capacitor).toContain("androidScheme: 'https'")
    expect(capacitor).toContain("iosScheme: 'https'")
    expect(app).toContain("hasTauri ? 'http://127.0.0.1:4399' : '/bridge'")
  })

  it('keeps OPTIONS and event-stream request requirements in the CORS contract', () => {
    expect(bridge).toContain('Method::OPTIONS')
    expect(bridge).toContain('AllowHeaders::mirror_request()')
    expect(ai).toContain("import { fetchEventSource } from '@microsoft/fetch-event-source'")
    expect(ai).toContain("method: 'POST'")
    expect(ai).toContain("headers: { 'Content-Type': 'application/json' }")
    expect(ai).toContain('AI_BRIDGE_PATHS.stream')
  })

  it('keeps external automation on explicit Bearer authentication', () => {
    expect(externalSmoke).toContain('HBUT_BRIDGE_TOKEN')
    expect(externalSmoke).toContain('Authorization: `Bearer ${bridgeToken}`')
    expect(externalSmoke).toContain("Origin: 'https://attacker.example'")
    expect(externalSmoke).toContain("'Access-Control-Request-Method': 'POST'")
  })
})
