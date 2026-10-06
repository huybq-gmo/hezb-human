'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchPattern } from '@/lib/list-query'
import { Field } from '@/components/ui'

export function IssueParentPicker({ projectId, excludeId, defaultValue = '', defaultLabel = 'Ticket cha hiện tại', disabled = false }: {
  projectId: string; excludeId?: string; defaultValue?: string; defaultLabel?: string; disabled?: boolean
}) {
  const [search, setSearch] = useState('')
  const [value, setValue] = useState(defaultValue)
  const [options, setOptions] = useState<{ id: string; title: string; type: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      if (!projectId) { setOptions([]); return }
      setLoading(true)
      let request = createClient().from('work_issue').select('id,title,type').eq('project_id', projectId)
        .in('type', ['epic', 'story']).order('title').limit(50)
      if (excludeId) request = request.neq('id', excludeId)
      if (search.trim()) request = request.ilike('title', searchPattern(search))
      const { data, error } = await request.abortSignal(controller.signal)
      if (!controller.signal.aborted) { setOptions(data ?? []); setFailed(!!error); setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [projectId, excludeId, search])
  return <Field label="Epic / story cha">
    <input aria-label="Tìm epic hoặc story cha" placeholder="Tìm epic hoặc story trong dự án…" value={search}
      onChange={(event) => setSearch(event.target.value)} disabled={disabled || !projectId} />
    <select name="parent_id" value={value} onChange={(event) => setValue(event.target.value)} disabled={disabled || !projectId}>
      <option value="">Không có ticket cha</option>
      {value && !options.some((option) => option.id === value) && <option value={value}>{defaultLabel}</option>}
      {options.map((option) => <option key={option.id} value={option.id}>{option.type}: {option.title}</option>)}
    </select>
    <small className="muted">{failed ? 'Không tải được ticket cha. Hãy thử lại.' : loading ? 'Đang tìm…' : 'Tìm theo tên để chọn trong tối đa 50 kết quả.'}</small>
  </Field>
}
