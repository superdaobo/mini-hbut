/**
 * 敏感值截断：长度 ≤8 时返回 `<len-N>`，否则保留前 8 字符 + "..."。
 */
export function truncateSensitive(value: string): string {
  if (value.length <= 8) return `<len-${value.length}>`;
  return value.slice(0, 8) + '...';
}
