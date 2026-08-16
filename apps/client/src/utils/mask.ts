/**
 * 学号脱敏：保留前 2 位与后 2 位，中间用 **** 替代。
 */
export function maskStudentId(sid: string): string {
  if (!sid || sid.length < 4) return '****';
  return sid.slice(0, 2) + '****' + sid.slice(-2);
}
