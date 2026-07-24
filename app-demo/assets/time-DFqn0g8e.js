const formatRelativeTime = (input) => {
  if (!input) return "未知时间";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return date.toLocaleString();
  if (diff < 60 * 1e3) return "刚刚";
  if (diff < 60 * 60 * 1e3) return `${Math.floor(diff / (60 * 1e3))}分钟前`;
  if (diff < 24 * 60 * 60 * 1e3) return `${Math.floor(diff / (60 * 60 * 1e3))}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1e3) return `${Math.floor(diff / (24 * 60 * 60 * 1e3))}天前`;
  return date.toLocaleString();
};
export {
  formatRelativeTime as f
};
