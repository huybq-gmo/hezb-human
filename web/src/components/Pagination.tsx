'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { PAGE_SIZE } from '@/lib/list-query'

export function Pagination({ page, total, parameter = 'page', pageSize = PAGE_SIZE }: {
  page: number; total: number; parameter?: string; pageSize?: number
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  function href(next: number) {
    const query = new URLSearchParams(params.toString())
    query.set(parameter, String(next))
    return `${pathname}?${query}`
  }
  return <nav className="pagination" aria-label="Phân trang">
    <span className="muted">{total} bản ghi · Trang {page}/{pages}</span>
    {page > 1 && <Link className="btn sm ghost" href={href(page - 1)}>← Trang trước</Link>}
    {page < pages && <Link className="btn sm ghost" href={href(page + 1)}>Trang sau →</Link>}
  </nav>
}
