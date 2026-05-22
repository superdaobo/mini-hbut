import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

const docsEntries = [
  ['docs', 'docs/index.html'],
  ['docsGuide', 'docs/guide/index.html'],
  ['docsConfiguration', 'docs/configuration/index.html'],
  ['docsFaq', 'docs/faq/index.html'],
  ['docsTechnical', 'docs/technical/index.html'],
  ['docsMore', 'docs/more/index.html'],
  ['docsQuickStart', 'docs/quick-start/index.html'],
  ['docsUserGuide', 'docs/user-guide/index.html'],
  ['docsAcademic', 'docs/academic/index.html'],
  ['docsCampusLife', 'docs/campus-life/index.html'],
  ['docsCommunityNotifications', 'docs/community-notifications/index.html'],
  ['docsExtensions', 'docs/extensions/index.html'],
  ['docsSettingsData', 'docs/settings-data/index.html'],
  ['docsTroubleshooting', 'docs/troubleshooting/index.html'],
  ['docsDeveloper', 'docs/developer/index.html'],
  ['docsArchitecture', 'docs/architecture/index.html'],
  ['docsPlatformTauri', 'docs/platform-tauri/index.html'],
  ['docsModuleSystem', 'docs/module-system/index.html'],
  ['docsBuildRelease', 'docs/build-release/index.html'],
  ['docsSecurityPrivacy', 'docs/security-privacy/index.html'],
  ['docsReference', 'docs/reference/index.html'],
  ['docsReferenceTauriApi', 'docs/reference/tauri-api/index.html'],
  ['docsReferenceDevRules', 'docs/reference/dev-rules/index.html'],
  ['docsReferenceNonebot', 'docs/reference/nonebot/index.html'],
  ['docsReferenceImplementationNotes', 'docs/reference/implementation-notes/index.html'],
] as const;

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        releases: path.resolve(__dirname, 'releases/index.html'),
        ...Object.fromEntries(
          docsEntries.map(([name, relativePath]) => [name, path.resolve(__dirname, relativePath)])
        ),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
  },
});
