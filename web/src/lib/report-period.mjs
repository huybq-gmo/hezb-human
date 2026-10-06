function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0,4)) < 1) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function reportPeriod(start, end, today) {
  const first = `${today.slice(0, 7)}-01`
  const lastDate = new Date(`${first}T12:00:00Z`)
  lastDate.setUTCMonth(lastDate.getUTCMonth() + 1, 0)
  const last = lastDate.toISOString().slice(0, 10)
  if (!start && !end) return { start: first, end: last, invalid: false }
  const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000
  if (!validDate(start) || !validDate(end) || days < 0 || days > 365) return { start: first, end: last, invalid: true }
  return { start, end, invalid: false }
}
