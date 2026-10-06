import { Badge } from '@/components/ui'
import { STATUS_LABELS, STATUS_TONES } from '@/lib/presentation'

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status] || status}</Badge>
  )
}
