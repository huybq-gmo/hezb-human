'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from './WorkspaceProvider'
import { formatDateTime } from '@/lib/presentation'
import { Button, Card, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export function Notifications() {
  const user = useWorkspace()
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const refresh = useCallback(async () => {
    const [list, count] = await Promise.all([
      supabase
        .from('core_notification')
        .select('id, title, body, link, is_read, created_at')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('core_notification')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false),
    ])
    setFailed(!!list.error || !!count.error)
    setItems(list.data ?? [])
    setUnread(count.count ?? 0)
    setLoading(false)
  }, [supabase, user.id])
  useEffect(() => {
    if (!user.id) return
    void refresh()
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'core_notification',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          void refresh()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, user.id, refresh])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  async function markRead(item?: Notification) {
    setBusy(true)
    let query = supabase
      .from('core_notification')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
    if (item) query = query.eq('id', item.id)
    const { error } = await query
    setBusy(false)
    if (error) {
      toast.error('Không thể cập nhật thông báo')
      return
    }
    await refresh()
    if (item?.link?.startsWith('/') && !item.link.startsWith('//')) {
      setOpen(false)
      router.push(item.link)
    }
  }
  return (
    <div ref={ref} className="notification-anchor">
      <button
        type="button"
        className="ib"
        aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void refresh()
        }}
      >
        <Bell size={18} />
        {unread > 0 && <span className="unread" />}
      </button>
      {open && (
        <div id="notifications-panel" className="notification-panel card">
          <Card
            title="Thông báo"
            action={
              unread > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void markRead()}
                >
                  <CheckCheck size={14} />
                  Đọc tất cả
                </Button>
              )
            }
          >
            <div role="status">
              {loading ? (
                <p className="card-body muted">Đang tải thông báo…</p>
              ) : failed ? (
                <EmptyState
                  title="Chưa tải được thông báo"
                  description="Vui lòng thử lại sau."
                />
              ) : !items.length ? (
                <EmptyState title="Bạn chưa có thông báo" />
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    className={cn(
                      'notification-item',
                      !item.is_read && 'unread',
                    )}
                    disabled={busy}
                    onClick={() => void markRead(item)}
                  >
                    <strong>{item.title}</strong>
                    {item.body && <p>{item.body}</p>}
                    <small>{formatDateTime(item.created_at)}</small>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
