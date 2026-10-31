// 月份鍵：依台灣時區（UTC+8）產生 'YYYY-MM'
export const MONTHLY_LIMIT = 5000;

export function monthKeyTW(date = new Date()) {
  const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().slice(0, 7);
}
