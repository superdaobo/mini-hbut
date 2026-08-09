import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

export const readContractSource = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

export const readContractTree = (
  relativePath: string,
  extensionPattern: RegExp = /\.(?:ts|js|vue|css|html|rs)$/
) => {
  const root = path.join(repoRoot, relativePath)
  if (!fs.existsSync(root)) return ''
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() && extensionPattern.test(entry.name)) files.push(absolute)
    }
  }
  walk(root)
  return files.sort().map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}

const readExternalBlocks = (relativePath: string, source: string) => {
  const directory = path.dirname(path.join(repoRoot, relativePath))
  const blocks: string[] = []
  for (const match of source.matchAll(/<(?:template|style)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)) {
    const absolute = path.resolve(directory, match[1])
    if (fs.existsSync(absolute)) blocks.push(fs.readFileSync(absolute, 'utf8'))
  }
  return blocks.join('\n')
}

export const readVueContractSource = (relativePath: string) => {
  const source = readContractSource(relativePath)
  return `${source}\n${readExternalBlocks(relativePath, source)}`
}

export const readAppContractSources = () =>
  [
    readVueContractSource('src/App.vue'),
    readContractTree('src/app', /\.(?:ts|vue)$/),
    `<style scoped>\n${readContractTree('src/styles/views', /^App(?:\..+)?\.css$/)}\n</style>`
  ].join('\n')

export const readAxiosAdapterContractSources = () =>
  [
    readContractSource('src/utils/axios_adapter.ts'),
    readContractTree('src/utils/axios_adapter', /\.ts$/)
  ].join('\n')
