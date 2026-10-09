// Synthetic records used only by the optional database seeding script.
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const EMPLOYEE_ID = '44444444-4444-4444-8444-444444444444'
const ISSUE_ID = '55555555-5555-4555-8555-555555555555'

const id = (group, number) =>
  `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${String(number).padStart(12, '0')}`

export function createDashboardSampleData() {
  const now = new Date().toISOString()
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const monday = new Date(`${today}T12:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const day = (offset) => {
    const date = new Date(monday)
    date.setUTCDate(date.getUTCDate() + offset)
    return date.toISOString().slice(0, 10)
  }
  const names = [
    'Minh Trần',
    'Lan Phạm',
    'Hải Nguyễn',
    'Thảo Đặng',
    'Quang Lê',
    'Ngọc Vũ',
    'Huy Hoàng',
    'Mai Bùi',
    'Tuấn Đỗ',
    'Linh Võ',
    'Bảo Phan',
    'Yến Trương',
  ]
  const profiles = names.map((full_name, index) => ({
    id: index === 0 ? OWNER_ID : id(1, index),
    full_name,
    is_active: index !== 11,
    created_at: now,
    updated_at: now,
  }))
  const employees = profiles.map((profile, index) => ({
    id: index === 0 ? EMPLOYEE_ID : id(2, index),
    user_id: profile.id,
    employee_code: `HZ-${String(12 + index).padStart(4, '0')}`,
    full_name: profile.full_name,
    type: [4, 8].includes(index)
      ? 'part_time'
      : [5, 9].includes(index)
        ? 'freelancer'
        : 'full_time',
    status:
      index === 5
        ? 'onboarding'
        : index === 10
          ? 'offboarding'
          : index === 11
            ? 'terminated'
            : 'active',
    job_title: [
      'Project Manager',
      'Frontend Developer',
      'Backend Developer',
      'HR Admin',
      'QA Reviewer',
      'Designer',
      'Project Manager',
      'Finance Specialist',
      'Frontend Developer',
      'UI/UX Designer',
      'Backend Developer',
      'QA Engineer',
    ][index],
    hire_date: day(-150 - index * 30),
    created_at: now,
  }))
  const projects = [
    {
      id: PROJECT_ID,
      name: 'Cổng thanh toán Vina',
      code: 'VINA',
      client: 'Vina Pay',
      status: 'active',
      budget: 1_200_000_000,
    },
    {
      id: id(3, 2),
      name: 'ERP Sakura',
      code: 'SKR',
      client: 'Sakura JP',
      status: 'active',
      budget: 850_000_000,
    },
    {
      id: id(3, 3),
      name: 'Ứng dụng giao hàng GoShip',
      code: 'SHIP',
      client: 'GoShip',
      status: 'completed',
      budget: 460_000_000,
    },
    {
      id: id(3, 4),
      name: 'CRM Lotus',
      code: 'LOTUS',
      client: 'Lotus Retail',
      status: 'active',
      budget: 720_000_000,
    },
    {
      id: id(3, 5),
      name: 'Cổng học tập EduHub',
      code: 'EDU',
      client: 'EduHub',
      status: 'on_hold',
      budget: 380_000_000,
    },
  ].map((project, index) => ({
    ...project,
    project_client: { name: project.client, code: project.code },
    client_id: id(4, index),
    billing_type: index === 1 ? 'hourly' : 'fixed_price',
    budget_amount: project.budget,
    budget_currency: 'VND',
    currency: 'VND',
    start_date: day(-56),
    end_date: day(index === 2 ? -7 : 42),
    created_at: now,
    description: `${project.name}: triển khai sản phẩm, kiểm thử và bàn giao cho ${project.client}.`,
  }))
  const titles = [
    'Màn hình thanh toán QR',
    'API đối soát giao dịch',
    'Kiểm tra trạng thái thanh toán',
    'Bổ sung bộ lọc nhân sự',
    'Thiết kế trang hồ sơ',
    'Xuất báo cáo chấm công',
    'Đăng nhập bằng SSO',
    'Tối ưu trang quản lý đơn hàng',
    'Bàn giao tài liệu vận hành',
    'Lịch sử tương tác khách hàng',
    'Import danh sách khách hàng',
    'Phân quyền nhóm bán hàng',
    'Trang danh sách khóa học',
    'Thông báo lịch học',
    'Báo cáo tiến độ học tập',
    'Kiểm thử thanh toán hoàn tiền',
    'Rà soát luồng nghỉ phép',
    'Đồng bộ trạng thái giao hàng',
  ]
  const issues = titles.map((title, index) => {
    const project = projects[index < 15 ? Math.floor(index / 3) : index - 15]
    const status =
      project.status === 'completed'
        ? 'done'
        : [
            'todo',
            'in_progress',
            'in_review',
            'done',
            'todo',
            'in_progress',
            'backlog',
            'blocked',
            'done',
            'in_progress',
            'todo',
            'in_review',
            'backlog',
            'blocked',
            'cancelled',
            'in_review',
            'done',
            'done',
          ][index]
    const due_date = day(
      index === 2 || index === 7 || project.status === 'completed'
        ? -1
        : 5 + index,
    )
    const is_overdue =
      !['done', 'cancelled'].includes(status) && due_date < today
    return {
      id: index === 0 ? ISSUE_ID : id(5, index),
      project_id: project.id,
      title,
      project_project: { name: project.name, code: project.code },
      type: index === 2 ? 'bug' : index % 2 ? 'task' : 'story',
      status,
      priority: ['high', 'medium', 'critical', 'medium', 'low', 'high'][
        index % 6
      ],
      story_points: [8, 5, 3, 2, 3, 5][index % 6],
      due_date,
      is_overdue,
      sla_status: is_overdue ? 'overdue' : 'on_track',
      assignee_id: profiles[index % 3].id,
      reporter_id: OWNER_ID,
      created_at: now,
      description: `Hoàn thiện **${title.toLowerCase()}**.\n\nTiêu chí nghiệm thu:\n• Giao diện hoạt động trên desktop và mobile.\n• Có trạng thái tải, lỗi và dữ liệu rỗng.\n• Kiểm tra quyền trước khi lưu.`,
    }
  })
  const timesheets = [
    'draft',
    'submitted',
    'leader_approved',
    'pm_approved',
    'locked',
  ].map((status, index) => {
    const employee = employees[index === 2 ? 0 : index % 3]
    return {
      id: id(6, index),
      employee_id: employee.id,
      project_id: PROJECT_ID,
      hr_employee: { full_name: employee.full_name },
      project_project: { name: projects[0].name },
      period_start: day(index === 2 ? -14 : index >= 3 ? -7 : 0),
      period_end: day(index === 2 ? -8 : index >= 3 ? -1 : 6),
      total_hours: [32, 38, 36, 40, 32][index],
      status,
      created_by: employee.user_id,
      created_at: now,
    }
  })
  const worklogs = Array.from({ length: 8 }, (_, index) => {
    const issue = issues[index % 2]
    return {
      id: id(7, index),
      employee_id: EMPLOYEE_ID,
      issue_id: issue.id,
      project_id: issue.project_id,
      logged_date: day(Math.floor(index / 2)),
      hours: 4,
      description:
        index % 2 ? 'Tích hợp API và kiểm thử' : 'Xây dựng giao diện',
      work_type: index % 2 ? 'test' : 'coding',
      is_billable: index !== 6,
      status: 'draft',
      created_by: OWNER_ID,
      created_at: now,
      work_issue: { title: issue.title },
      hr_employee: { full_name: names[0] },
      project_project: { name: projects[0].name },
    }
  })
  const leaveType = { id: id(8, 1), name: 'Phép năm', code: 'ANNUAL' }
  const rows = {
    core_user_profile: profiles,
    core_role_assignment: profiles.map((profile, index) => ({
      id: id(9, index),
      user_id: profile.id,
      role: [
        'company_owner',
        'developer',
        'team_leader',
        'hr_admin',
        'qa_reviewer',
        'developer',
        'project_manager',
        'finance_admin',
        'developer',
        'developer',
        'developer',
        'qa_reviewer',
      ][index],
      granted_by: OWNER_ID,
      granted_at: now,
      revoked_at: index === 11 ? now : null,
      expires_at: null,
    })),
    hr_employee: employees,
    project_project: projects,
    project_proposal: [
      {
        title: 'Nâng cấp cổng thanh toán Vina',
        status: 'sent',
        client: 'Vina Pay',
        budget: 240_000_000,
      },
      {
        title: 'CRM Lotus',
        status: 'approved',
        client: 'Lotus Retail',
        budget: 720_000_000,
      },
      {
        title: 'Ứng dụng đặt lịch CarePlus',
        status: 'draft',
        client: 'CarePlus',
        budget: 560_000_000,
      },
    ].map((proposal, index) => ({
      id: id(10, index),
      title: proposal.title,
      status: proposal.status,
      billing_type: 'fixed_price',
      estimated_budget: proposal.budget,
      currency: 'VND',
      project_client: { name: proposal.client },
      created_by: profiles[6].id,
      created_at: now,
    })),
    project_membership: projects.flatMap((project, projectIndex) =>
      profiles.slice(0, 3).map((profile, index) => ({
        id: id(22 + projectIndex, index),
        project_id: project.id,
        user_id: profile.id,
        project_role: ['pm', 'developer', 'team_leader'][index],
        status: 'active',
        start_date: day(-56),
        end_date: project.status === 'completed' ? day(-7) : null,
        created_at: now,
        project_project: { name: project.name, code: project.code },
      })),
    ),
    project_milestone: projects.flatMap((project, index) =>
      ['Thiết kế & phân tích', 'Beta sản phẩm', 'Bàn giao'].map(
        (name, stage) => ({
          id: id(11 + index, stage),
          project_id: project.id,
          name,
          due_date: day(
            (project.status === 'completed' ? [-42, -21, -7] : [-14, 14, 42])[
              stage
            ],
          ),
          status:
            project.status === 'completed' || stage === 0 ? 'accepted' : 'open',
        }),
      ),
    ),
    work_issue: issues,
    work_issue_with_sla: issues,
    work_worklog: worklogs,
    work_attendance: [
      {
        id: id(20, 1),
        employee_id: EMPLOYEE_ID,
        work_date: today,
        check_in_at: now,
        check_out_at: null,
      },
    ],
    work_timesheet: timesheets,
    work_issue_comment: issues.flatMap((issue, index) => [
      {
        id: id(14, index * 2),
        issue_id: issue.id,
        created_by: profiles[1].id,
        created_at: now,
        is_deleted: false,
        content:
          index === 0
            ? 'Đã thống nhất luồng **quét QR**. Hiển thị thông báo khi mã hết hạn sau `5 phút`.'
            : `Đã cập nhật yêu cầu cho **${issue.title}**. Cần kiểm tra quyền và trạng thái lỗi trước khi bàn giao.`,
      },
      {
        id: id(14, index * 2 + 1),
        issue_id: issue.id,
        created_by: profiles[2].id,
        created_at: now,
        is_deleted: false,
        content:
          'Đã rà soát tiêu chí nghiệm thu. Nhờ QA kiểm tra thêm trên màn hình mobile.',
      },
    ]),
    hr_contract: employees.map((employee, index) => ({
      id: id(15, index),
      employee_id: employee.id,
      contract_type: 'indefinite',
      start_date: employee.hire_date,
      end_date: null,
      notes: 'Hợp đồng mẫu để xem giao diện.',
    })),
    hr_employee_rate: employees.map((employee, index) => ({
      id: id(16, index),
      employee_id: employee.id,
      rate_type: 'hourly',
      amount: 200_000 + index * 10_000,
      currency: 'VND',
      effective_from: employee.hire_date,
      effective_to: null,
    })),
    hr_skill: employees.flatMap((employee, index) =>
      (index === 3
        ? ['HR Operations', 'Employee Relations']
        : index === 7
          ? ['Financial Reporting', 'Excel']
          : [5, 9].includes(index)
            ? ['Figma', 'UI/UX']
            : ['TypeScript', index % 2 ? 'React' : 'PostgreSQL']
      ).map((skill_name, skillIndex) => ({
        id: id(17, index * 2 + skillIndex),
        employee_id: employee.id,
        skill_name,
        level: skillIndex ? 'intermediate' : 'advanced',
        certified_at: null,
      })),
    ),
    hr_leave_type: [
      { ...leaveType, default_days_per_year: 12 },
      {
        id: id(8, 2),
        name: 'Nghỉ không lương',
        code: 'UNPAID',
        default_days_per_year: 0,
      },
      { id: id(8, 3), name: 'Nghỉ ốm', code: 'SICK', default_days_per_year: 5 },
    ],
    hr_leave_balance: employees.map((employee, index) => ({
      id: id(18, index),
      employee_id: employee.id,
      leave_type_id: leaveType.id,
      hr_leave_type: { name: leaveType.name },
      total_days: 12,
      used_days: index + 1,
      year: Number(today.slice(0, 4)),
    })),
    hr_leave_request: [
      'pending',
      'approved',
      'rejected',
      'pending',
      'approved',
      'pending',
    ].map((status, index) => ({
      id: id(19, index),
      employee_id: employees[index].id,
      leave_type_id: leaveType.id,
      hr_employee: { full_name: names[index] },
      hr_leave_type: { name: leaveType.name, code: leaveType.code },
      start_date: day(7 + index),
      end_date: day(8 + index),
      days_requested: 2,
      status,
      reason: [
        'Việc gia đình',
        'Nghỉ phép đã lên kế hoạch',
        'Tham gia sự kiện cá nhân',
      ][index % 3],
      created_by: profiles[index].id,
      created_at: now,
      approved_at: status === 'approved' ? now : null,
    })),
    core_notification: [
      {
        title: 'Timesheet chờ duyệt',
        body: 'Lan Phạm đã gửi timesheet tuần này',
        link: '/dashboard/worklogs?tab=approval',
      },
      {
        title: 'Ticket cần review',
        body: 'Kiểm tra trạng thái thanh toán đang chờ review',
        link: `/dashboard/issues/${issues[2].id}`,
      },
      {
        title: 'Đơn nghỉ phép mới',
        body: 'Thảo Đặng đã gửi đơn nghỉ phép',
        link: '/dashboard/hr/leave',
      },
      {
        title: 'Milestone sắp đến hạn',
        body: 'Beta sản phẩm của ERP Sakura cần được rà soát',
        link: `/dashboard/projects/${projects[1].id}`,
      },
    ].map((item, index) => ({
      ...item,
      id: id(20, index),
      recipient_id: OWNER_ID,
      is_read: index === 1,
      created_at: now,
    })),
    audit_log: [
      {
        id: id(21, 1),
        table_name: 'core_role_assignment',
        actor_id: OWNER_ID,
        record_id: OWNER_ID,
        occurred_at: now,
        action: 'RPC:assign_role',
        after_masked: { user_id: profiles[1].id, role: 'developer' },
      },
    ],
    dashboard_project_health: projects.map((project) => {
      const projectIssues = issues.filter(
        (issue) => issue.project_id === project.id,
      )
      return {
        project_id: project.id,
        project_name: project.name,
        status: project.status,
        issues_open: projectIssues.filter(
          (issue) => !['done', 'cancelled', 'backlog'].includes(issue.status),
        ).length,
        issues_done: projectIssues.filter((issue) => issue.status === 'done')
          .length,
        issues_backlog: projectIssues.filter(
          (issue) => issue.status === 'backlog',
        ).length,
        issues_overdue: projectIssues.filter((issue) => issue.is_overdue)
          .length,
        milestones_overdue: 0,
      }
    }),
    dashboard_team_utilization: employees
      .filter((employee) => employee.status === 'active')
      .map((employee) => ({
        employee_id: employee.id,
        full_name: employee.full_name,
        approved_hours: timesheets
          .filter(
            (sheet) =>
              sheet.employee_id === employee.id &&
              ['pm_approved', 'locked'].includes(sheet.status),
          )
          .reduce((total, sheet) => total + sheet.total_hours, 0),
        active_projects: profiles
          .slice(0, 3)
          .some((profile) => profile.id === employee.user_id)
          ? projects.filter((project) => project.status === 'active').length
          : 0,
      })),
  }
  rows.project_client = projects.map((project) => ({
    id: project.client_id, name: project.client, code: project.code, address: 'TP. Hồ Chí Minh',
    website: null, notes: 'Khách hàng mẫu', is_active: true, version: 1,
  }))
  rows.project_client_contact = rows.project_client.flatMap((client, index) => [0, 1].map((number) => ({
    id: id(40, index * 2 + number), client_id: client.id, full_name: number ? 'Người liên hệ kỹ thuật' : 'Người liên hệ chính',
    email: `contact${index}${number}@example.test`, phone: null, title: number ? 'Tech Lead' : 'Project Manager',
    is_primary: number === 0, version: 1,
  })))
  rows.work_sprint = projects.flatMap((project, index) => [0, 1].map((number) => ({
    id: id(41, index * 2 + number), project_id: project.id, name: `Sprint ${number + 1} · ${project.code}`,
    start_date: day(number ? 7 : 0), end_date: day(number ? 20 : 13), status: number ? 'planned' : 'active',
  })))
  for (const [index, issue] of issues.entries()) {
    issue.version = 1; issue.parent_id = index === 1 ? issues[0].id : index === 2 ? issues[1].id : null
    issue.sprint_id = index % 3 ? rows.work_sprint.find((sprint) => sprint.project_id === issue.project_id)?.id : null
    if (index === 0) issue.type = 'epic'
    if (index === 1) issue.type = 'story'
  }
  for (const log of worklogs) log.version = 1
  // Mirror approved sheet hours in synthetic worklogs for date-scoped reports.
  for (const [index, sheet] of timesheets.entries()) {
    if (!['pm_approved','locked'].includes(sheet.status)) continue
    const date = new Date(`${sheet.period_start}T12:00:00Z`)
    for (let number = 0; number < 5; number++) {
      rows.work_worklog.push({ ...worklogs[0], id: id(42, index * 5 + number), employee_id: sheet.employee_id,
        logged_date: date.toISOString().slice(0, 10), hours: sheet.total_hours / 5,
        status: 'approved', created_by: sheet.created_by,
        hr_employee: { full_name: sheet.hr_employee.full_name },
      })
      date.setUTCDate(date.getUTCDate() + 1)
    }
  }
  rows.hr_team = ['Engineering','Product'].map((name,index) => ({ id: id(43,index),name,description: 'Nhóm mẫu',is_active: true }))
  rows.hr_team_membership = employees.filter((employee) => employee.status === 'active').map((employee,index) => ({
    id: id(44,index),team_id: rows.hr_team[index % 2].id,employee_id: employee.id,team_role: index < 2 ? 'leader' : 'member',
    start_date: day(-56),end_date: null,status: 'active',hr_team: { name: rows.hr_team[index % 2].name },
    hr_employee: { id: employee.id,full_name: employee.full_name,employee_code: employee.employee_code,status: employee.status },
  }))
  rows.hr_team_skill_matrix = rows.hr_team_membership.map((member) => ({
    team_id: member.team_id,employee_id: member.employee_id,full_name: member.hr_employee.full_name,
    employee_code: member.hr_employee.employee_code,team_role: member.team_role,
    skills: rows.hr_skill.filter((skill) => skill.employee_id === member.employee_id),
  }))
  rows.project_allocation = rows.project_membership.flatMap((member,index) => {
    const employee = employees.find((employee) => employee.user_id === member.user_id)
    return employee ? [{ id: id(45,index),employee_id: employee.id,project_id: member.project_id,
      project_role: member.project_role,allocation_percent: 50,start_date: day(-56),end_date: day(56),status: 'approved',
      created_by: OWNER_ID,created_at: now,hr_employee: { full_name: employee.full_name,user_id: employee.user_id },
    }] : []
  })
  rows.finance_invoice = []
  rows.finance_invoice_line = []
  rows.finance_payment = []
  rows.finance_invoice_payment_summary = []
  rows.finance_project_cost_summary = []
  rows.finance_payroll_period = []
  rows.admin_role_directory=rows.core_role_assignment.map(role=>({...role,full_name:profiles.find(p=>p.id===role.user_id)?.full_name}))
  const capabilities=['hr_admin','finance_admin','director','project_manager','team_leader','developer','qa_reviewer','auditor']
  rows.core_role_permission=capabilities.map(role=>({role,permission:role,enabled:true}))
  rows.core_permission_catalog=capabilities.map(code=>({code,label:code,description:'Quyền hệ thống',capability:code,is_system:true}))
  rows.admin_membership_directory=rows.project_membership.map(member=>({...member,
    full_name:profiles.find(p=>p.id===member.user_id)?.full_name,project_name:member.project_project.name,project_code:member.project_project.code,
    effective_status:member.status!=='active'?member.status:member.end_date&&member.end_date<today?'expired':member.start_date>today?'pending':'active',
  }))
  const weekly=new Map()
  for(const log of rows.work_worklog){
    const key=[log.employee_id,log.project_id,log.issue_id,log.logged_date].join(':')
    const row=weekly.get(key)||{employee_id:log.employee_id,project_id:log.project_id,issue_id:log.issue_id,logged_date:log.logged_date,
      issue_title:issues.find(i=>i.id===log.issue_id)?.title,project_name:projects.find(p=>p.id===log.project_id)?.name,hours:0}
    row.hours+=Number(log.hours);weekly.set(key,row)
  }
  rows.work_weekly_hours=[...weekly.values()]
  for(const sheet of timesheets) sheet.version=1
  rows.work_timesheet_line=timesheets.filter(sheet=>['pm_approved','locked'].includes(sheet.status)).flatMap((sheet,index)=>
    rows.work_worklog.filter(log=>log.employee_id===sheet.employee_id&&log.project_id===sheet.project_id&&log.status==='approved'
      &&log.logged_date>=sheet.period_start&&log.logged_date<=sheet.period_end).map((log,number)=>({
        id:id(46,index*10+number),timesheet_id:sheet.id,worklog_id:log.id,hours:log.hours,is_billable:log.is_billable,logged_date:log.logged_date,
        work_worklog:{logged_date:log.logged_date,description:log.description},
      })))
  const locked=timesheets.find(sheet=>sheet.status==='locked')
  const line=rows.work_timesheet_line.find(line=>line.timesheet_id===locked.id)
  rows.work_timesheet_adjustment=[{id:id(47,0),timesheet_id:locked.id,reason:'Bổ sung một giờ kiểm thử đã ghi thiếu',requested_by:locked.created_by,
    requested_at:now,status:'pending',version:1,resolution_reason:null,work_timesheet:locked,
    work_timesheet_adjustment_line:[{worklog_id:line.worklog_id,previous_hours:line.hours,proposed_hours:line.hours+1}],
  }]
  rows.work_timesheet_adjustment_line=rows.work_timesheet_adjustment[0].work_timesheet_adjustment_line.map(item=>({...item,adjustment_id:id(47,0)}))
  return rows
}
