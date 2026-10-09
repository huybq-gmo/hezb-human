import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'

const requestSchema = z.object({
  action: z.enum(['invite', 'link-existing']),
  employeeId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
})

const accountEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() || null

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error) return { user: null, failed: true }

    const user = data.users.find(
      (candidate) => accountEmail(candidate.email) === email,
    )
    if (user) return { user, failed: false }
    if (data.users.length < 1000) return { user: null, failed: false }
  }

  return { user: null, failed: true }
}

export async function POST(request: Request) {
  const workspaceUser = await getWorkspaceUser()
  if (!workspaceUser) {
    return NextResponse.json({ error: 'Vui lòng đăng nhập.' }, { status: 401 })
  }
  if (
    !workspaceUser.roles.some((role) =>
      ['company_owner', 'hr_admin'].includes(role),
    )
  ) {
    return NextResponse.json(
      { error: 'Bạn không có quyền mời hoặc liên kết tài khoản.' },
      { status: 403 },
    )
  }

  let input: z.infer<typeof requestSchema>
  try {
    input = requestSchema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { error: 'Email hoặc thông tin yêu cầu chưa hợp lệ.' },
      { status: 400 },
    )
  }

  if (
    !process.env.SUPABASE_SECRET_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      {
        error:
          'Chưa cấu hình SUPABASE_SECRET_KEY ở máy chủ. Có thể dùng SUPABASE_SERVICE_ROLE_KEY cũ nếu dự án chưa có secret key.',
      },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user: sessionUser },
    error: sessionError,
  } = await supabase.auth.getUser()
  if (sessionError || !sessionUser || sessionUser.id !== workspaceUser.id) {
    return NextResponse.json(
      { error: 'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại.' },
      { status: 401 },
    )
  }

  const { data: employee, error: employeeError } = await supabase
    .from('hr_employee')
    .select('id, user_id, full_name, email')
    .eq('id', input.employeeId)
    .maybeSingle()

  if (employeeError) {
    return NextResponse.json(
      { error: 'Không thể đọc hồ sơ nhân sự. Vui lòng thử lại.' },
      { status: 500 },
    )
  }
  if (!employee) {
    return NextResponse.json(
      { error: 'Không tìm thấy hồ sơ nhân sự.' },
      { status: 404 },
    )
  }
  if (employee.user_id) {
    return NextResponse.json(
      { error: 'Hồ sơ này đã được liên kết với một tài khoản.' },
      { status: 409 },
    )
  }
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json(
      { error: 'Không thể kết nối Supabase Admin. Kiểm tra cấu hình máy chủ.' },
      { status: 503 },
    )
  }

  const { error: preparationError } = await supabase.rpc(
    'prepare_employee_account_link',
    {
      p_employee_id: input.employeeId,
      p_email: input.email,
    },
  )
  if (preparationError) {
    const message = preparationError.message
    if (preparationError.code === 'PGRST202') {
      return NextResponse.json(
        {
          error:
            'Chưa triển khai migration liên kết tài khoản. Hãy cập nhật Supabase rồi thử lại.',
        },
        { status: 503 },
      )
    }
    if (message.includes('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Bạn không có quyền mời hoặc liên kết tài khoản.' },
        { status: 403 },
      )
    }
    if (message.includes('NOT_FOUND')) {
      return NextResponse.json(
        { error: 'Không tìm thấy hồ sơ nhân sự.' },
        { status: 404 },
      )
    }
    if (
      message.includes('EMPLOYEE_ALREADY_LINKED') ||
      message.includes('EMAIL_MISMATCH')
    ) {
      return NextResponse.json(
        {
          error:
            'Hồ sơ đã được liên kết hoặc email không còn khớp. Hãy tải lại trang.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'Không thể kiểm tra hồ sơ liên kết. Hãy cập nhật Supabase.' },
      { status: 500 },
    )
  }

  let targetUserId: string
  let invited = false
  if (input.action === 'invite') {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
    let redirectTo: string
    try {
      const inviteCallback = new URL('/auth/callback', siteUrl)
      inviteCallback.searchParams.set('next', '/reset-password')
      redirectTo = inviteCallback.toString()
    } catch {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_SITE_URL chưa phải URL hợp lệ.' },
        { status: 503 },
      )
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      input.email,
      {
        data: { full_name: employee.full_name },
        redirectTo,
      },
    )
    if (error || !data.user) {
      const message = error?.message.toLowerCase() || ''
      if (
        message.includes('already') ||
        message.includes('registered') ||
        message.includes('exists')
      ) {
        return NextResponse.json(
          {
            error:
              'Email này đã có tài khoản. Chọn “Liên kết tài khoản có sẵn”.',
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        {
          error:
            'Supabase chưa gửi được lời mời. Kiểm tra cấu hình email/SMTP của dự án.',
        },
        { status: 502 },
      )
    }
    targetUserId = data.user.id
    invited = true
  } else {
    const result = await findAuthUserByEmail(admin, input.email)
    if (result.failed) {
      return NextResponse.json(
        { error: 'Không thể tra cứu tài khoản Auth. Vui lòng thử lại.' },
        { status: 502 },
      )
    }
    if (!result.user) {
      return NextResponse.json(
        {
          error:
            'Không tìm thấy tài khoản theo email này. Hãy chọn “Mời tài khoản mới”.',
        },
        { status: 404 },
      )
    }

    const { data: profile, error: profileError } = await admin
      .from('core_user_profile')
      .select('is_active')
      .eq('id', result.user.id)
      .maybeSingle()
    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Tài khoản chưa có hồ sơ trong hệ thống. Hãy kiểm tra Supabase.' },
        { status: 409 },
      )
    }
    if (!profile.is_active) {
      return NextResponse.json(
        { error: 'Tài khoản này đang bị vô hiệu hóa.' },
        { status: 409 },
      )
    }
    targetUserId = result.user.id
  }

  const { error: linkError } = await supabase.rpc('link_employee_account', {
    p_employee_id: input.employeeId,
    p_user_id: targetUserId,
    p_email: input.email,
  })
  if (linkError) {
    if (invited) {
      return NextResponse.json(
        {
          error:
            'Đã gửi lời mời nhưng hồ sơ chưa liên kết được. Tài khoản đã được tạo; sau khi xử lý lỗi, hãy chọn “Liên kết tài khoản có sẵn”.',
        },
        { status: 409 },
      )
    }
    const message = linkError.message
    if (message.includes('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Bạn không có quyền mời hoặc liên kết tài khoản.' },
        { status: 403 },
      )
    }
    if (message.includes('NOT_FOUND')) {
      return NextResponse.json(
        { error: 'Không tìm thấy hồ sơ nhân sự hoặc tài khoản.' },
        { status: 404 },
      )
    }
    if (message.includes('EMAIL_MISMATCH')) {
      return NextResponse.json(
        { error: 'Email không trùng với email tài khoản Supabase Auth.' },
        { status: 409 },
      )
    }
    if (message.includes('USER_ALREADY_LINKED')) {
      return NextResponse.json(
        { error: 'Tài khoản này đã được liên kết với nhân sự khác.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        error:
          'Hồ sơ vừa thay đổi hoặc tài khoản đã được liên kết nơi khác. Hãy tải lại trang.',
      },
      { status: 409 },
    )
  }

  return NextResponse.json({
    message: invited
      ? 'Đã gửi lời mời và liên kết tài khoản với nhân sự.'
      : 'Đã liên kết tài khoản với nhân sự.',
  })
}
