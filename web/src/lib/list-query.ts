export const PAGE_SIZE = 50
export type SearchValues = Record<string, string | string[] | undefined>

export function textParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}
export function pageNumber(value: string | string[] | undefined) {
  const parsed = Number(textParam(value))
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10000, Math.trunc(parsed) || 1)) : 1
}
export function uuidParam(value: string | string[] | undefined) {
  const text = textParam(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : ''
}
export function searchPattern(value: string) {
  // Treat PostgREST expression delimiters and SQL wildcards as literal search
  // separators rather than letting them alter an .or() filter.
  return `%${value.replace(/[%_(),.\\]/g, ' ').trim().slice(0, 100)}%`
}
