// 统一按指定时区输出 YYYY-MM-DD，自然日而不是浏览器本地
export function ymdTZ(date = new Date(), timeZone = 'Asia/Shanghai') {
  const f = new Intl.DateTimeFormat('zh-CN', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = f.formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}
