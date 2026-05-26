import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const readConfig = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('Android network security config', () => {
  it('keeps localhost debug domains valid for release lint', () => {
    const xml = readConfig('android/app/src/main/res/xml/network_security_config.xml')

    for (const domain of ['127.0.0.1', 'localhost', '10.0.2.2']) {
      const pattern = new RegExp(
        `<domain\\s+includeSubdomains="true"\\s*>\\s*${domain.replaceAll('.', '\\.')}\\s*</domain>`
      )
      expect(xml, domain).toMatch(pattern)
    }
  })
})
