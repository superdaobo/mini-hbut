/**
 * 测试密钥常量（仅测试环境使用，与生产环境变量无关）。
 * 注意：均满足 security/hash.ts 的 32 字符最小长度要求。
 */

/** AES-256-GCM KEK：恰好 32 ASCII 字符 = 32 字节 */
export const TEST_KEK = '0123456789abcdef0123456789abcdef'

/** handoff HMAC key */
export const TEST_HANDOFF_HMAC_KEY = 'test-handoff-hmac-key-0123456789abcdef'

/** pairwise subject 派生密钥 */
export const TEST_PAIRWISE_KEY = 'test-pairwise-subject-key-0123456789abcdef'

/** BFF -> Core 服务令牌（仅测试进程；显式注入，避免继承本机生产环境变量） */
export const TEST_SERVICE_TOKEN = 'test-service-token-0123456789abcdef'

/** 过短密钥（用于验证 fail closed） */
export const TEST_SHORT_KEY = 'too-short'
