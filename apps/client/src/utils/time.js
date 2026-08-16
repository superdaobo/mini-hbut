export const formatRelativeTime = (input) => {
  if (!input) return '未知时间';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;

  const diff = Date.now() - date.getTime();
  if (diff < 0) return date.toLocaleString();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  return date.toLocaleString();
};
