import assert from 'node:assert/strict'
import http from 'node:http'
import { debugCaptureCurrentPage, debugCustomScheduleUpsert } from '../src/utils/debug_bridge_client.js'

const PORT = 43991
const BASE_URL = `http://127.0.0.1:${PORT}`

const readJsonBody = async (request) => {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const send = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const server = http.createServer(async (request, response) => {
  const body = await readJsonBody(request).catch(() => ({}))

  if (request.url === '/debug/custom_schedule/upsert') {
    if (request.headers.authorization !== 'Bearer local-debug-token') {
      send(response, 401, { success: false, error: { message: '未授权' } })
      return
    }
    if (!body?.student_id) {
      send(response, 422, { success: false, error: { message: 'student_id 缺失' } })
      return
    }
    send(response, 200, {
      success: true,
      data: {
        dry_run: !!body.dry_run,
        courses: body.courses || [],
        conflicts: []
      }
    })
    return
  }

  if (request.url === '/debug/screenshot') {
    if (request.headers.authorization !== 'Bearer local-debug-token') {
      send(response, 401, { success: false, error: { message: '未授权' } })
      return
    }
    if (body?.selector === '#missing') {
      send(response, 422, { success: false, error: { message: '未找到截图目标：#missing' } })
      return
    }
    send(response, 200, {
      success: true,
      data: {
        saved_path: 'AppCache/debug-captures/mock.png',
        mime: 'image/png',
        width: 1280,
        height: 720,
        base64: body?.return === 'both' ? 'ZmFrZQ==' : null
      }
    })
    return
  }

  send(response, 404, { success: false, error: { message: 'not found' } })
})

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

try {
  await assert.rejects(
    () =>
      debugCustomScheduleUpsert(
        {
          student_id: '2510231106',
          courses: []
        },
        { baseUrl: BASE_URL }
      ),
    /未授权/
  )

  const upsertResult = await debugCustomScheduleUpsert(
    {
      student_id: '2510231106',
      dry_run: true,
      courses: [
        {
          semester: '2025-2026-2',
          name: '调试课程',
          weekday: 1,
          period: 1,
          djs: 2,
          weeks: [1, 2]
        }
      ]
    },
    { baseUrl: BASE_URL, token: 'local-debug-token' }
  )
  assert.equal(upsertResult.dry_run, true)
  assert.equal(Array.isArray(upsertResult.courses), true)
  assert.equal(upsertResult.courses.length, 1)

  const screenshotResult = await debugCaptureCurrentPage(
    {
      selector: '.view-transition-root',
      return: 'both'
    },
    { baseUrl: BASE_URL, token: 'local-debug-token' }
  )
  assert.equal(screenshotResult.mime, 'image/png')
  assert.equal(screenshotResult.width, 1280)
  assert.equal(screenshotResult.base64, 'ZmFrZQ==')

  await assert.rejects(
    () =>
      debugCaptureCurrentPage(
        {
          selector: '#missing'
        },
        { baseUrl: BASE_URL, token: 'local-debug-token' }
      ),
    /未找到截图目标/
  )

  console.log('[debug-bridge-test] 所有断言通过')
} finally {
  await new Promise((resolve) => server.close(resolve))
}
