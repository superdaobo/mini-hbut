import { execFileSync } from 'node:child_process'

const API_URL = process.env.EDGEONE_API_URL || 'https://pages-api.edgeone.ai/v1'
const PROJECT_ID = process.env.EDGEONE_PROJECT_ID || 'pages-qno4dud9jgqs'
const TOKEN = String(process.env.EDGEONE_API_TOKEN || '').trim()

const callApi = (payload) => {
  const response = execFileSync(
    'curl',
    [
      '-sS',
      '-X',
      'POST',
      API_URL,
      '-H',
      'Content-Type: application/json',
      '-H',
      `Authorization: Bearer ${TOKEN}`,
      '--data-binary',
      '@-'
    ],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8'
    }
  )
  const parsed = JSON.parse(response)
  if (parsed.Code !== 0) {
    throw new Error(`EdgeOne API error: ${response}`)
  }
  return parsed.Data?.Response || parsed
}

const main = () => {
  if (!TOKEN) {
    console.error('[edgeone] EDGEONE_API_TOKEN is required')
    process.exit(1)
  }

  console.log('[edgeone] resetting project to static website-pages mode')
  callApi({
    Action: 'ModifyPagesProject',
    ProjectId: PROJECT_ID,
    RepoBranch: 'website-pages',
    InstallCmd: 'echo skip',
    BuildCmd: 'echo skip',
    OutputDir: '.',
    NodejsVersion: '22.17.1'
  })

  const deployment = callApi({
    Action: 'CreatePagesDeployment',
    ProjectId: PROJECT_ID,
    ViaMeta: 'ReDeploy',
    Env: 'Production',
    Provider: 'Github',
    RepoBranch: 'website-pages'
  })

  console.log('[edgeone] deployment triggered:', deployment.DeploymentId || 'unknown')
}

main()
