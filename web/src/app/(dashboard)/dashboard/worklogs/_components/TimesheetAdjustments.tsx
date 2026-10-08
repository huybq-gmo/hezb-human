'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { Dialog } from '@/components/Dialog'
import { Button, Card, EmptyState, Field } from '@/components/ui'
import { Pagination } from '@/components/Pagination'
import { formatDate } from '@/lib/presentation'

type Sheet = {id:string;project_id:string;employee_id:string;created_by:string;version:number}
type Change = {worklog_id:string;previous_hours:number;proposed_hours:number}
export type Adjustment = {id:string;timesheet_id:string;reason:string;requested_by:string;requested_at:string;status:string;version:number;resolution_reason:string|null;
 work_timesheet:Sheet & {period_start:string;period_end:string;hr_employee:{full_name:string}|null;project_project:{name:string}|null};
 work_timesheet_adjustment_line:Change[]}

const messages: Record<string,string> = {
 FORBIDDEN:'Bạn không có quyền thực hiện thao tác này.',SOD_VIOLATION:'Người yêu cầu không thể tự duyệt.',
 STALE_VERSION:'Dữ liệu đã thay đổi. Hãy tải lại trang và tạo yêu cầu mới nếu cần.',
 ADJUSTMENT_PENDING:'Timesheet đã có yêu cầu đang chờ xử lý.',INVALID_STATE:'Yêu cầu đã được xử lý hoặc timesheet đã thay đổi.',
 NO_CHANGES:'Yêu cầu cũ chưa có giờ đề xuất. Hãy từ chối và tạo yêu cầu mới.',
 INVOICED_WORKLOG:'Giờ làm đã dùng cho hóa đơn. Cần xử lý điều chỉnh tài chính riêng.',
 PAYROLL_LOCKED:'Giờ làm thuộc kỳ lương đã khóa.',DAILY_HOURS_EXCEEDED:'Tổng giờ trong một ngày vượt 24 giờ.',
}
function showError(message:string) {toast.error(Object.entries(messages).find(([code])=>message.includes(code))?.[1] || 'Không thể lưu yêu cầu. Kiểm tra thông tin và thử lại.')}

export function AdjustmentRequestDialog({sheet,onClose}:{sheet:Sheet;onClose:()=>void}) {
 const router=useRouter(); const [busy,setBusy]=useState(false)
 const [page,setPage]=useState(1); const [total,setTotal]=useState(0); const [loading,setLoading]=useState(true); const [failed,setFailed]=useState(false)
 const [lines,setLines]=useState<{worklog_id:string;hours:number;work_worklog:{logged_date:string;description:string|null}|null}[]>([])
 const [changes,setChanges]=useState<Record<string,{original:number;hours:string}>>({})
 useEffect(()=>{
   let active=true; setLoading(true); setFailed(false)
   void (async()=>{
     const result=await createClient().from('work_timesheet_line').select('worklog_id,hours,work_worklog:worklog_id(logged_date,description)',{count:'exact'})
       .eq('timesheet_id',sheet.id).order('id').range((page-1)*50,page*50-1)
     if(!active) return
     setFailed(!!result.error);setTotal(result.count ?? 0)
     setLines((result.data ?? []).map(line=>({...line,work_worklog:Array.isArray(line.work_worklog)?line.work_worklog[0]:line.work_worklog})))
     setLoading(false)
   })().catch(()=>{if(active){setFailed(true);setLoading(false)}})
   return ()=>{active=false}
 },[sheet.id,page])
 async function submit(event:React.FormEvent<HTMLFormElement>) {
   event.preventDefault(); if(busy || loading || failed) return
   const proposed=Object.entries(changes).filter(([,change])=>Number(change.hours)!==Number(change.original))
     .map(([worklog_id,change])=>({worklog_id,hours:Number(change.hours)}))
   if(!proposed.length || proposed.length>200 || proposed.some(change=>!Number.isFinite(change.hours)||change.hours<=0||change.hours>24||Number(change.hours.toFixed(2))!==change.hours)) {
     toast.error('Chọn 1–200 dòng cần sửa; giờ mới phải lớn hơn 0, tối đa 24 và có tối đa hai chữ số thập phân.');return
   }
   const reason=String(new FormData(event.currentTarget).get('reason') || '').trim()
   setBusy(true)
   try {
     const {error}=await createClient().rpc('propose_timesheet_adjustment',{p_timesheet_id:sheet.id,p_reason:reason,p_changes:proposed,p_expected_version:sheet.version})
     if(error){showError(error.message);return}
     toast.success('Đã gửi giờ đề xuất cho PM duyệt');onClose();router.refresh()
   } finally {setBusy(false)}
 }
 return <Dialog title="Đề xuất sửa giờ sau khóa" onClose={onClose} busy={busy}>
   <form onSubmit={submit}>
     <p className="muted">Chỉ sửa số giờ trên các dòng hiện có. PM hoặc Owner khác người yêu cầu sẽ duyệt và áp dụng; kỳ vẫn được khóa.</p>
     {loading?<p>Đang tải giờ làm…</p>:failed?<p role="alert">Không thể tải giờ làm. Hãy đóng và mở lại.</p>:<div className="table-scroll"><table><thead><tr><th>Ngày / mô tả</th><th>Giờ hiện tại</th><th>Giờ đề xuất</th></tr></thead><tbody>{lines.map(line=><tr key={line.worklog_id}>
       <td>{formatDate(line.work_worklog?.logged_date)}<small className="block muted">{line.work_worklog?.description || line.worklog_id}</small></td>
       <td>{line.hours}h</td><td><input aria-label={`Giờ đề xuất ${line.worklog_id}`} type="number" min="0.01" max="24" step="0.01"
         value={changes[line.worklog_id]?.hours ?? String(line.hours)} disabled={busy}
         onChange={event=>setChanges({...changes,[line.worklog_id]:{original:line.hours,hours:event.target.value}})} /></td>
     </tr>)}</tbody></table></div>}
     <div className="toolbar"><span>{total} dòng · Trang {page}/{Math.max(1,Math.ceil(total/50))}</span>
       <Button size="sm" variant="ghost" disabled={busy||loading||page<=1} onClick={()=>setPage(page-1)}>Trang trước</Button>
       <Button size="sm" variant="ghost" disabled={busy||loading||page*50>=total} onClick={()=>setPage(page+1)}>Trang sau</Button>
     </div>
     <Field label="Lý do điều chỉnh"><textarea name="reason" required maxLength={2000} /></Field>
     <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button><Button type="submit" disabled={busy||loading||failed}>{busy?'Đang gửi…':'Gửi đề xuất'}</Button></div>
   </form>
 </Dialog>
}

export function TimesheetAdjustments({adjustments,page,total,currentEmployeeId,currentUserId}:{adjustments:Adjustment[];page:number;total:number;currentEmployeeId?:string;currentUserId:string}) {
 const user=useWorkspace();const router=useRouter();const [busy,setBusy]=useState(false)
 const [decision,setDecision]=useState<{row:Adjustment;approve:boolean}|null>(null)
 async function resolve(event:React.FormEvent<HTMLFormElement>) {
   event.preventDefault();if(!decision||busy)return
   const reason=String(new FormData(event.currentTarget).get('reason') || '').trim();setBusy(true)
   try {
     const {error}=await createClient().rpc('resolve_timesheet_adjustment',{p_adjustment_id:decision.row.id,p_approve:decision.approve,p_reason:reason,p_expected_version:decision.row.version})
     if(error){showError(error.message);return}
     toast.success(decision.approve?'Đã duyệt và áp dụng giờ mới':'Đã từ chối yêu cầu');setDecision(null);router.refresh()
   } finally {setBusy(false)}
 }
 return <><Card title="Điều chỉnh timesheet sau khóa">
   {!adjustments.length?<EmptyState title="Chưa có yêu cầu điều chỉnh" />:<div className="table-scroll"><table><thead><tr><th>Nhân sự / kỳ</th><th>Lý do / giờ đề xuất</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
     {adjustments.map(row=>{
       const ts=row.work_timesheet
       const canResolve=row.status==='pending'&&row.requested_by!==currentUserId&&ts.created_by!==currentUserId&&ts.employee_id!==currentEmployeeId
         &&(user.hasRole('company_owner')||user.hasProjectRole(ts.project_id,'pm'))
       return <tr key={row.id}><td>{ts.hr_employee?.full_name || 'Nhân sự'}<small className="block muted">{ts.project_project?.name} · {formatDate(ts.period_start)} – {formatDate(ts.period_end)}</small></td>
         <td>{row.reason}<ul>{row.work_timesheet_adjustment_line.map(line=><li key={line.worklog_id}>{line.previous_hours}h → {line.proposed_hours}h</li>)}</ul>{!row.work_timesheet_adjustment_line.length&&<small>Yêu cầu cũ chưa có giờ đề xuất</small>}</td>
         <td>{({pending:'Chờ xử lý',approved:'Đã áp dụng',rejected:'Từ chối'} as Record<string,string>)[row.status]}<small className="block muted">{row.resolution_reason}</small></td>
         <td>{canResolve&&<div className="toolbar"><Button size="sm" disabled={busy||!row.work_timesheet_adjustment_line.length} onClick={()=>setDecision({row,approve:true})}>Duyệt &amp; áp dụng</Button><Button size="sm" variant="danger" disabled={busy} onClick={()=>setDecision({row,approve:false})}>Từ chối</Button></div>}</td></tr>
     })}
   </tbody></table></div>}
 </Card><Pagination parameter="adjustment_page" page={page} total={total} />
 {decision&&<Dialog title={decision.approve?'Duyệt và áp dụng điều chỉnh':'Từ chối điều chỉnh'} onClose={()=>setDecision(null)} busy={busy}><form onSubmit={resolve}>
   <Field label="Lý do quyết định"><textarea name="reason" required maxLength={2000} /></Field>
   <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={()=>setDecision(null)}>Hủy</Button><Button type="submit" disabled={busy}>Xác nhận</Button></div>
 </form></Dialog>}</>
}
