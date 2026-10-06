'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, Card } from '@/components/ui'

export function IssueAttachments({
  projectId,
  issueId,
  canUpload,
  canManage,
}: {
  projectId: string
  issueId: string
  canUpload: boolean
  canManage: boolean
}) {
  const supabase = createClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<{ name: string; url: string; path: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [replacePath, setReplacePath] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    const bucket = supabase.storage.from('issue-attachments')
    const folder = `${projectId}/${issueId}`
    const { data, error } = await bucket.list(folder, { limit: 100 })
    if (error) {
      setFailed(true)
      return
    }
    const entries = (data ?? []).filter((file) => file.id)
    if (!entries.length) {
      setFiles([])
      setFailed(false)
      return
    }
    const { data: signed, error: signError } = await bucket.createSignedUrls(
      entries.map((file) => `${folder}/${file.name}`),
      3600,
    )
    setFailed(!!signError)
    setFiles(
      (signed ?? []).flatMap((file, index) =>
        file.signedUrl
          ? [
              {
                name: entries[index].name.replace(/^[0-9a-f-]{36}-/, ''),
                url: file.signedUrl,
                path: `${folder}/${entries[index].name}`,
              },
            ]
          : [],
      ),
    )
  }, [supabase, projectId, issueId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  async function upload(file?: File, replacing?: string | null) {
    if (!file) return
    setBusy(true)
    try {
      const name = file.name.replace(/[^\p{L}\p{N}._-]/gu, '_')
      const newPath = `${projectId}/${issueId}/${crypto.randomUUID()}-${name}`
      const { error } = await supabase.storage
        .from('issue-attachments')
        .upload(newPath, file)
      if (error) {
        toast.error(
          'Không thể tải tệp lên. Kiểm tra quyền hoặc dung lượng tệp.',
        )
        return
      }
      if (replacing) {
        const { error: referenceError } = await supabase.rpc('update_issue_attachment_reference', {
          p_path: replacing,
          p_new_path: newPath,
        })
        if (referenceError) {
          await supabase.storage.from('issue-attachments').remove([newPath])
          toast.error('Không thể thay tệp đính kèm. Tệp cũ vẫn được giữ nguyên.')
          return
        }
        const { error: removeError } = await supabase.storage
          .from('issue-attachments')
          .remove([replacing])
        if (removeError) {
          await supabase.rpc('update_issue_attachment_reference', {
            p_path: newPath,
            p_new_path: replacing,
          })
          toast.error('Không xóa được tệp cũ; liên kết bình luận đã được khôi phục.')
          await refresh()
          return
        }
        toast.success('Đã thay tệp đính kèm')
      } else toast.success('Đã đính kèm tệp')
      await refresh()
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  async function remove(path: string) {
    if (!window.confirm('Xóa tệp đính kèm này?')) return
    setBusy(true)
    try {
      const { data: commentIds, error: referenceError } = await supabase.rpc('update_issue_attachment_reference', {
        p_path: path,
        p_new_path: null,
      })
      if (referenceError) {
        toast.error('Không thể cập nhật liên kết bình luận của tệp.')
        return
      }
      const { error } = await supabase.storage.from('issue-attachments').remove([path])
      if (error) {
        await supabase.rpc('restore_issue_attachment_reference', {
          p_path: path,
          p_comment_ids: commentIds ?? [],
        })
        toast.error('Không thể xóa tệp. Kiểm tra quyền quản lý dự án.')
        return
      }
      toast.success('Đã xóa tệp đính kèm')
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card
      title="Tệp đính kèm"
      action={
        canUpload && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={14} />
            {busy ? 'Đang tải lên…' : 'Đính kèm'}
          </Button>
        )
      }
    >
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        aria-label="Chọn tệp đính kèm"
        disabled={busy || !canUpload}
        onChange={(event) => {
          void upload(event.target.files?.[0], replacePath)
          setReplacePath(null)
        }}
      />
      <div className="card-body">
        {failed ? (
          <p className="muted">
            Chưa tải được tệp đính kèm.{' '}
            <button className="text-link" onClick={() => void refresh()}>
              Thử lại
            </button>
          </p>
        ) : !files.length ? (
          <p className="muted">Chưa có tệp đính kèm.</p>
        ) : (
          <>
          <ul className="grid gap-2">
            {files.map((file) => (
              <li key={file.path} className="toolbar toolbar-between">
                <a
                  className="text-link inline-flex items-center gap-2"
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Paperclip size={14} />
                  {file.name}
                </a>
                {canManage && <div className="toolbar">
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setReplacePath(file.path); fileInput.current?.click() }}><Pencil size={13} />Thay thế</Button>
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove(file.path)}><Trash2 size={13} />Xóa</Button>
                </div>}
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </Card>
  )
}
