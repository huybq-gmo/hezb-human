import { Card, EmptyState } from '@/components/ui'

export interface SkillMatrixRow {
  employee_id: string; full_name: string; employee_code: string | null; team_role: string
  skills: { skill_name: string; level: string | null; certified_at: string | null }[]
}
const levels: Record<string, string> = { beginner: 'Cơ bản', intermediate: 'Trung bình', advanced: 'Nâng cao', expert: 'Chuyên gia' }

export function SkillMatrix({ rows }: { rows: SkillMatrixRow[] }) {
  const skills = [...new Set(rows.flatMap((row) => row.skills.map((skill) => skill.skill_name)))].sort((a, b) => a.localeCompare(b, 'vi'))
  return <Card title="Skill Matrix · thành viên đang hoạt động">
    {!rows.length ? <EmptyState title="Nhóm chưa có thành viên đang hoạt động" /> : <div className="table-scroll"><table>
      <thead><tr><th>Nhân sự</th><th>Vai trò</th>{skills.map((skill) => <th key={skill}>{skill}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.employee_id}>
        <td>{row.full_name}<small className="block muted">{row.employee_code}</small></td>
        <td>{row.team_role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}</td>
        {skills.map((name) => { const skill = row.skills.find((entry) => entry.skill_name === name)
          return <td key={name} title={skill?.certified_at ? `Chứng nhận: ${skill.certified_at}` : undefined}>{skill ? levels[skill.level || ''] || skill.level || 'Đã khai báo' : '—'}</td>
        })}
      </tr>)}</tbody>
    </table></div>}
    {!!rows.length && !skills.length && <p className="card-body muted">Thành viên chưa khai báo kỹ năng. Cập nhật tại hồ sơ nhân sự.</p>}
  </Card>
}
