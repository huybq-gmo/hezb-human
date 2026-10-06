import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card, EmptyState } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="page">
      <Topbar title="Không tìm thấy" />
      <main id="main-content" className="page-content">
        <Card>
          <EmptyState
            title="Không tìm thấy nội dung"
            description="Nội dung có thể đã bị xóa hoặc nằm ngoài phạm vi bạn được xem."
            action={
              <Link href="/dashboard" className="btn">
                Về Dashboard
              </Link>
            }
          />
        </Card>
      </main>
    </div>
  )
}
