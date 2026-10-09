import { Topbar } from '@/components/layout/Topbar'
import { GuideClient } from './GuideClient'

export default function GuidePage() {
  return (
    <div className="page">
      <Topbar
        title="Hướng dẫn sử dụng"
        subtitle="Trợ giúp thao tác trong Hezb ERP"
      />
      <GuideClient />
    </div>
  )
}
