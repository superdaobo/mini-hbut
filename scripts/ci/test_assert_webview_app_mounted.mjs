import assert from 'node:assert/strict'
import { isAppMounted, isCspViolation, isStrictCspEvalFailure } from './assert_webview_app_mounted.mjs'

assert.equal(isAppMounted({
  readyState: 'complete',
  rootExists: true,
  rootChildren: 3,
  vueAppPresent: true,
  visibleElements: 12,
}), true)
assert.equal(isAppMounted({
  readyState: 'complete',
  rootExists: true,
  rootChildren: 0,
  vueAppPresent: false,
  visibleElements: 2,
}), false)
assert.equal(isStrictCspEvalFailure("EvalError: Refused to evaluate a string because 'unsafe-eval' is not allowed"), true)
assert.equal(isStrictCspEvalFailure('ordinary network timeout'), false)
assert.equal(isStrictCspEvalFailure("script-src 'self' 'wasm-unsafe-eval'"), false)
assert.equal(isStrictCspEvalFailure("script-src 'self' 'unsafe-eval'"), true)
assert.equal(isCspViolation("Applying inline style violates the following Content Security Policy directive 'style-src'"), true)
assert.equal(isCspViolation('ordinary network timeout'), false)

console.log('WebView mount smoke contract passed')
