'use client'

import { useEffect } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Button, Card, EmptyState } from '@/components/ui'
import { logClientError } from '@/lib/logger'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => logClientError(error), [error])
  return (
    <div className="page">
      <Topbar title="Không thể tải trang" />
      <main id="main-content" className="page-content">
        <Card>
          <EmptyState
            title="Có lỗi khi tải dữ liệu"
            description="Vui lòng thử lại để tiếp tục công việc."
            action={<Button onClick={reset}>Thử lại</Button>}
          />
        </Card>
      </main>
    </div>
  )
}
