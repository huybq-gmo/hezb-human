'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  FolderKanban,
  KeyRound,
  ListChecks,
  Search,
  ShieldCheck,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

type IllustrationKind = 'dashboard' | 'kanban' | 'timeline' | 'people' | 'finance'

type GuideSection = {
  id: string
  title: string
  intro: string
  keywords: string
  icon: LucideIcon
  visual: IllustrationKind
  caption: string
  content: ReactNode
}

function GuideIllustration({
  kind,
  label,
}: {
  kind: IllustrationKind
  label: string
}) {
  return (
    <div className="guide-illustration">
      <svg viewBox="0 0 560 330" role="img" aria-label={label}>
        <rect x="12" y="12" width="536" height="306" rx="20" fill="var(--sf)" stroke="var(--ln)" />
        <rect x="12" y="12" width="536" height="40" rx="20" fill="var(--bg)" />
        <path d="M12 32a20 20 0 0 1 20-20h496a20 20 0 0 1 20 20v20H12z" fill="var(--bg)" />
        <circle cx="35" cy="32" r="5" fill="#fb7185" />
        <circle cx="53" cy="32" r="5" fill="#fbbf24" />
        <circle cx="71" cy="32" r="5" fill="#34d399" />
        <rect x="102" y="25" width="180" height="14" rx="7" fill="var(--ln)" />
        {kind === 'dashboard' && (
          <>
            <rect x="28" y="68" width="112" height="232" rx="12" fill="var(--bg)" />
            <rect x="44" y="84" width="80" height="13" rx="6" fill="var(--pri)" opacity=".8" />
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <rect x="44" y={115 + i * 31} width="12" height="12" rx="4" fill={i === 1 ? 'var(--pri)' : 'var(--ln)'} />
                <rect x="64" y={118 + i * 31} width={i === 1 ? 49 : 58} height="7" rx="3.5" fill={i === 1 ? 'var(--pri)' : 'var(--mut)'} opacity={i === 1 ? '.8' : '.42'} />
              </g>
            ))}
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={158 + i * 123} y="68" width="108" height="59" rx="10" fill="var(--bg)" stroke="var(--ln)" />
                <rect x={171 + i * 123} y="82" width="49" height="7" rx="3.5" fill="var(--mut)" opacity=".6" />
                <rect x={171 + i * 123} y="99" width={i === 1 ? 42 : 30} height="16" rx="5" fill={i === 1 ? 'var(--ok)' : 'var(--pri)'} opacity=".82" />
              </g>
            ))}
            <rect x="158" y="141" width="362" height="159" rx="12" fill="var(--bg)" stroke="var(--ln)" />
            <rect x="175" y="158" width="154" height="9" rx="4.5" fill="var(--ink)" opacity=".72" />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <circle cx="184" cy={193 + i * 25} r="6" fill={i === 2 ? 'var(--ok)' : 'var(--pri)'} />
                <rect x="199" y={189 + i * 25} width={i === 1 ? 92 : 112} height="7" rx="3.5" fill="var(--mut)" opacity=".56" />
                <rect x="370" y={188 + i * 25} width="125" height="9" rx="4.5" fill="var(--ln)" />
                <rect x="370" y={188 + i * 25} width={[80, 57, 105, 92][i]} height="9" rx="4.5" fill={i === 2 ? 'var(--ok)' : 'var(--pri)'} />
              </g>
            ))}
          </>
        )}
        {kind === 'kanban' && (
          <>
            {[0, 1, 2].map((col) => (
              <g key={col}>
                <rect x={30 + col * 171} y="70" width="158" height="228" rx="12" fill="var(--bg)" stroke="var(--ln)" />
                <circle cx={49 + col * 171} cy="90" r="5" fill={['var(--mut)', 'var(--pri)', 'var(--ok)'][col]} />
                <rect x={62 + col * 171} y="86" width={col === 1 ? 70 : 57} height="8" rx="4" fill="var(--ink)" opacity=".7" />
              </g>
            ))}
            {[
              { x: 42, y: 110, color: 'var(--mut)' },
              { x: 42, y: 194, color: 'var(--mut)' },
              { x: 213, y: 110, color: 'var(--pri)' },
              { x: 213, y: 194, color: 'var(--pri)' },
              { x: 384, y: 110, color: 'var(--ok)' },
            ].map((card, i) => (
              <g key={i}>
                <rect x={card.x} y={card.y} width="134" height="68" rx="9" fill="var(--sf)" stroke="var(--ln)" />
                <rect x={card.x + 11} y={card.y + 12} width="38" height="7" rx="3.5" fill={card.color} opacity=".8" />
                <rect x={card.x + 11} y={card.y + 28} width={i % 2 ? 85 : 102} height="7" rx="3.5" fill="var(--ink)" opacity=".55" />
                <rect x={card.x + 11} y={card.y + 44} width="58" height="6" rx="3" fill="var(--mut)" opacity=".35" />
                <circle cx={card.x + 119} cy={card.y + 52} r="6" fill={card.color} opacity=".8" />
              </g>
            ))}
            <path d="M178 156h22m0 0-7-7m7 7-7 7M349 156h22m0 0-7-7m7 7-7 7" fill="none" stroke="var(--mut)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === 'timeline' && (
          <>
            <rect x="32" y="72" width="496" height="224" rx="14" fill="var(--bg)" stroke="var(--ln)" />
            <path d="M98 158h351" stroke="var(--ln)" strokeWidth="6" strokeLinecap="round" />
            <path d="M98 158h235" stroke="var(--pri)" strokeWidth="6" strokeLinecap="round" />
            {[
              { x: 98, title: 'Ghi giờ', sub: 'Lưu worklog', done: true },
              { x: 215, title: 'Gửi kỳ', sub: 'Theo dự án', done: true },
              { x: 333, title: 'Duyệt', sub: 'TL → PM', done: false },
              { x: 450, title: 'Khóa', sub: 'Chốt kỳ', done: false },
            ].map((step, i) => (
              <g key={i}>
                <circle cx={step.x} cy="158" r="18" fill={step.done ? 'var(--pri)' : 'var(--sf)'} stroke={step.done ? 'var(--pri)' : 'var(--ln)'} strokeWidth="3" />
                {step.done ? <path d={`M${step.x - 6} 158l4 4 8-9`} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : <text x={step.x} y="163" textAnchor="middle" fill="var(--mut)" fontSize="12" fontWeight="700">{i + 1}</text>}
                <text x={step.x} y="205" textAnchor="middle" fill="var(--ink)" fontSize="12" fontWeight="700">{step.title}</text>
                <text x={step.x} y="224" textAnchor="middle" fill="var(--mut)" fontSize="10">{step.sub}</text>
              </g>
            ))}
            <rect x="58" y="255" width="444" height="24" rx="8" fill="var(--pri-s)" />
            <text x="280" y="271" textAnchor="middle" fill="var(--pri)" fontSize="10" fontWeight="600">Kỳ đã khóa: gửi yêu cầu điều chỉnh, không sửa worklog trực tiếp</text>
          </>
        )}
        {kind === 'people' && (
          <>
            <rect x="31" y="73" width="220" height="224" rx="14" fill="var(--bg)" stroke="var(--ln)" />
            <circle cx="80" cy="126" r="24" fill="var(--pri-s)" />
            <circle cx="80" cy="118" r="8" fill="var(--pri)" opacity=".8" />
            <path d="M62 143c2-12 10-17 18-17s16 5 18 17" fill="var(--pri)" opacity=".55" />
            <rect x="117" y="110" width="97" height="8" rx="4" fill="var(--ink)" opacity=".7" />
            <rect x="117" y="127" width="70" height="7" rx="3.5" fill="var(--mut)" opacity=".45" />
            <rect x="50" y="169" width="182" height="1" fill="var(--ln)" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x="52" y={187 + i * 28} width="72" height="7" rx="3.5" fill="var(--mut)" opacity=".55" />
                <rect x="145" y={187 + i * 28} width={i === 1 ? 53 : 68} height="7" rx="3.5" fill="var(--ink)" opacity=".42" />
              </g>
            ))}
            <path d="M270 184h43m0 0-9-9m9 9-9 9" fill="none" stroke="var(--pri)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="326" y="73" width="202" height="224" rx="14" fill="var(--bg)" stroke="var(--ln)" />
            <rect x="348" y="98" width="158" height="40" rx="10" fill="var(--sf)" stroke="var(--ln)" />
            <circle cx="370" cy="118" r="10" fill="var(--ok-s)" />
            <path d="M365 118l4 4 7-8" fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="388" y="113" width="91" height="8" rx="4" fill="var(--ink)" opacity=".6" />
            <rect x="348" y="153" width="158" height="117" rx="10" fill="var(--sf)" stroke="var(--ln)" />
            <rect x="364" y="169" width="78" height="7" rx="3.5" fill="var(--ink)" opacity=".6" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={364 + i * 43} y="194" width="34" height="47" rx="7" fill={i === 1 ? 'var(--pri-s)' : 'var(--bg)'} />
                <rect x={372 + i * 43} y={211 - (i % 2) * 8} width="18" height={22 + (i % 2) * 8} rx="4" fill={i === 1 ? 'var(--pri)' : 'var(--ok)'} opacity=".7" />
              </g>
            ))}
          </>
        )}
        {kind === 'finance' && (
          <>
            <rect x="32" y="73" width="496" height="224" rx="14" fill="var(--bg)" stroke="var(--ln)" />
            <rect x="52" y="92" width="145" height="185" rx="11" fill="var(--sf)" stroke="var(--ln)" />
            <rect x="68" y="110" width="78" height="8" rx="4" fill="var(--ink)" opacity=".7" />
            <rect x="68" y="129" width="105" height="6" rx="3" fill="var(--mut)" opacity=".4" />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x="68" y={153 + i * 24} width="75" height="6" rx="3" fill="var(--mut)" opacity=".45" />
                <rect x="153" y={151 + i * 24} width="28" height="10" rx="5" fill={i === 3 ? 'var(--ok-s)' : 'var(--pri-s)'} />
              </g>
            ))}
            <path d="M211 176h40m0 0-8-8m8 8-8 8" fill="none" stroke="var(--pri)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="266" y="92" width="240" height="185" rx="11" fill="var(--sf)" stroke="var(--ln)" />
            <rect x="283" y="108" width="77" height="9" rx="4.5" fill="var(--ink)" opacity=".72" />
            <rect x="283" y="129" width="205" height="1" fill="var(--ln)" />
            <rect x="283" y="144" width="83" height="6" rx="3" fill="var(--mut)" opacity=".48" />
            <rect x="405" y="144" width="75" height="6" rx="3" fill="var(--mut)" opacity=".48" />
            <rect x="283" y="162" width="116" height="6" rx="3" fill="var(--mut)" opacity=".36" />
            <rect x="405" y="162" width="50" height="6" rx="3" fill="var(--ink)" opacity=".52" />
            <rect x="283" y="180" width="205" height="1" fill="var(--ln)" />
            <rect x="283" y="193" width="79" height="6" rx="3" fill="var(--mut)" opacity=".4" />
            <rect x="405" y="193" width="50" height="6" rx="3" fill="var(--ink)" opacity=".5" />
            <rect x="283" y="219" width="205" height="38" rx="9" fill="var(--ok-s)" />
            <circle cx="302" cy="238" r="8" fill="var(--ok)" />
            <path d="M298 238l3 3 5-6" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="318" y="234" width="116" height="7" rx="3.5" fill="var(--ok)" opacity=".75" />
          </>
        )}
      </svg>
      <span className="guide-illustration-label">{label}</span>
    </div>
  )
}

function GuideSectionCard({ section }: { section: GuideSection }) {
  const Icon = section.icon
  return (
    <section className="guide-section" id={section.id}>
      <div className="guide-section-heading">
        <span className="guide-icon"><Icon size={20} /></span>
        <div>
          <p className="guide-eyebrow">HƯỚNG DẪN THEO CHỦ ĐỀ</p>
          <h2>{section.title}</h2>
          <p>{section.intro}</p>
        </div>
      </div>
      <div className="guide-section-grid">
        <div className="guide-section-copy">{section.content}</div>
        <GuideIllustration kind={section.visual} label={section.caption} />
      </div>
    </section>
  )
}

export function GuideClient() {
  const [query, setQuery] = useState('')
  const sections = useMemo<GuideSection[]>(() => [
    {
      id: 'bat-dau',
      title: 'Đăng nhập và tài khoản',
      intro: 'Bắt đầu đúng tài khoản để thấy dự án và thao tác của bạn.',
      keywords: 'đăng nhập email mật khẩu mời tài khoản quên khôi phục reset liên kết quyền owner HR Admin',
      icon: KeyRound,
      visual: 'people',
      caption: 'Minh họa hồ sơ nhân sự được liên kết với tài khoản đăng nhập',
      content: (
        <>
          <ol className="guide-steps">
            <li><span>1</span><div><strong>Đăng nhập bằng email được mời</strong><p>Mở đường dẫn ứng dụng do quản trị viên cung cấp. Tài khoản được tạo cho từng người, không có mật khẩu mặc định dùng chung.</p></div></li>
            <li><span>2</span><div><strong>Nhận lời mời và đặt mật khẩu</strong><p>Nếu chưa có tài khoản, nhờ Owner hoặc HR Admin tạo hồ sơ nhân sự và mời đúng email. Mở thư mời, xác nhận rồi tự đặt mật khẩu.</p></div></li>
            <li><span>3</span><div><strong>Khôi phục khi quên mật khẩu</strong><p>Ở trang đăng nhập chọn <b>Quên mật khẩu?</b>, nhập email và mở liên kết trong thư để đặt mật khẩu mới. Kiểm tra thư rác nếu chưa nhận được email.</p></div></li>
          </ol>
          <div className="guide-callout info"><CircleHelp size={18} /><p><b>Không thấy dữ liệu sau khi vào được web?</b> Tài khoản cần được gán vai trò và liên kết với hồ sơ nhân sự; để vào dự án còn cần được thêm làm thành viên dự án.</p></div>
          <p className="guide-small-note">Web không còn chế độ xem dữ liệu mẫu: sau khi đăng nhập, các trang đọc database theo quyền tài khoản. Nếu danh sách trống, xóa bộ lọc và kiểm tra dự án/khoảng ngày; nếu vẫn chưa thấy dữ liệu, nhờ Owner/HR kiểm tra role và membership.</p>
        </>
      ),
    },
    {
      id: 'dashboard',
      title: 'Đọc Dashboard',
      intro: 'Chọn đúng kỳ và dự án trước khi diễn giải các chỉ số.',
      keywords: 'dashboard tổng quan utilization năng lực capacity giờ duyệt ngày dự án bộ lọc nhân sự timesheet',
      icon: ChartNoAxesCombined,
      visual: 'dashboard',
      caption: 'Minh họa thẻ tổng quan và danh sách giờ đã duyệt',
      content: (
        <>
          <ol className="guide-steps compact">
            <li><span>1</span><div><strong>Chọn phạm vi báo cáo</strong><p>Ở đầu trang, chọn dự án, ngày bắt đầu và ngày kết thúc rồi bấm <b>Áp dụng</b>. Hãy chắc rằng bộ lọc phù hợp với câu hỏi bạn cần trả lời.</p></div></li>
            <li><span>2</span><div><strong>Đọc các thẻ tổng quan</strong><p>Thẻ nhân sự, issue đang mở, timesheet chờ duyệt và dự án đang chạy có phạm vi thời gian khác nhau. Issue và dự án phản ánh trạng thái hiện tại; timesheet xét các kỳ giao với khoảng ngày đã chọn.</p></div></li>
            <li><span>3</span><div><strong>Hiểu biểu đồ Utilization</strong><p>Utilization so sánh giờ đã duyệt với capacity khả dụng của từng người trong kỳ. Capacity dựa trên 8 giờ mỗi ngày làm việc, trừ nghỉ phép đã duyệt; khi lọc dự án, capacity dựa trên allocation đã duyệt.</p></div></li>
          </ol>
          <div className="guide-callout warning"><ArrowDownRight size={18} /><p>Nếu thấy dấu <b>—</b>, kỳ đó chưa có capacity để tính tỷ lệ. Dấu này không đồng nghĩa người đó chưa ghi giờ. Giờ chưa được duyệt cũng chưa được tính vào phần giờ đã duyệt.</p></div>
          <Link className="guide-inline-link" href="/dashboard"><span>Mở Dashboard</span><ArrowRight size={15} /></Link>
        </>
      ),
    },
    {
      id: 'du-an-ticket',
      title: 'Dự án, thành viên và ticket',
      intro: 'Từ đề xuất được duyệt đến công việc được theo dõi trên board.',
      keywords: 'dự án khách hàng đề xuất proposal tạo duyệt PM owner director thành viên allocation phân bổ sprint milestone board ticket kanban',
      icon: FolderKanban,
      visual: 'kanban',
      caption: 'Minh họa ticket di chuyển qua các cột trạng thái',
      content: (
        <>
          <div className="guide-subsection">
            <h3>Tạo dự án và thêm thành viên</h3>
            <ol className="guide-number-list">
              <li>Người có quyền tạo đề xuất tại <b>Dự án → Đề xuất</b>, điền thông tin và lưu bản nháp.</li>
              <li>Gửi duyệt. Owner/Director xem xét; người tạo không thể tự duyệt đề xuất của mình. Đề xuất được duyệt sẽ tạo dự án.</li>
              <li>Thêm tài khoản vào dự án trong <b>Thành viên dự án</b>, chọn vai trò dự án và thời gian hiệu lực. Thành viên chỉ thấy/phối hợp trong phạm vi được cấp.</li>
            </ol>
          </div>
          <div className="guide-subsection">
            <h3>Làm việc với ticket</h3>
            <ol className="guide-number-list">
              <li>Mở <b>Board & ticket</b>, lọc theo dự án, sprint, backlog, tiêu đề hoặc ticket quá hạn.</li>
              <li>Tạo ticket trong dự án bạn được tham gia; điền tiêu đề, loại, ưu tiên, ngày cần hoàn thành và ticket cha nếu có.</li>
              <li>Mở chi tiết để đọc mô tả, bình luận, tệp đính kèm và lịch sử. Chuyển trạng thái theo các lựa chọn hiện trên ticket.</li>
            </ol>
          </div>
          <div className="guide-callout info"><ShieldCheck size={18} /><p>Quyền sửa ticket thay đổi theo vai trò, thành viên dự án và trạng thái ticket. Nếu nút sửa không hiện hoặc thao tác bị từ chối, nhờ PM kiểm tra phạm vi quyền.</p></div>
          <div className="guide-link-row">
            <Link className="guide-inline-link" href="/dashboard/projects"><span>Mở Dự án</span><ArrowRight size={15} /></Link>
            <Link className="guide-inline-link" href="/dashboard/issues"><span>Mở Board & ticket</span><ArrowRight size={15} /></Link>
          </div>
        </>
      ),
    },
    {
      id: 'timesheet',
      title: 'Ghi giờ và gửi timesheet',
      intro: 'Ghi giờ theo ticket, gửi đúng kỳ và theo dõi từng bước duyệt.',
      keywords: 'timesheet worklog chấm công checkin checkout log work giờ công gửi duyệt trưởng nhóm team leader PM khóa điều chỉnh sau khóa',
      icon: Clock3,
      visual: 'timeline',
      caption: 'Luồng từ ghi giờ đến duyệt và khóa kỳ',
      content: (
        <>
          <ol className="guide-steps">
            <li><span>1</span><div><strong>Ghi giờ mỗi công việc</strong><p>Chọn <b>Log work</b> trên thanh trên cùng hoặc mở <b>Timesheet của tôi</b>. Chọn dự án, ticket, ngày, số giờ, loại công việc, mô tả và có tính phí hay không. Số giờ nhập theo bước 0,25 giờ.</p></div></li>
            <li><span>2</span><div><strong>Rà lại lịch tuần</strong><p>Dùng lịch tuần để xem tổng giờ theo ngày và ticket. Worklog ở trạng thái nháp có thể sửa hoặc xóa; kiểm tra ngày, ticket và số giờ trước khi gửi.</p></div></li>
            <li><span>3</span><div><strong>Gửi kỳ để duyệt</strong><p>Chọn kỳ và gửi timesheet theo dự án/khoảng ngày trên trang. Luồng thường đi qua trưởng nhóm trước rồi PM. Người tạo không thể tự duyệt timesheet của mình.</p></div></li>
            <li><span>4</span><div><strong>Xử lý yêu cầu bị từ chối hoặc đã khóa</strong><p>Nếu bị từ chối, đọc lý do, chỉnh worklog nháp và gửi lại. Sau khi kỳ được khóa, dùng tab <b>Điều chỉnh sau khóa</b>, chọn nội dung cần đổi và ghi lý do.</p></div></li>
          </ol>
          <div className="guide-callout success"><CheckCheck size={18} /><p>Người duyệt thấy tab <b>Duyệt timesheet</b> khi có quyền trong phạm vi của mình. Việc duyệt và khóa là hai thao tác riêng; worklog đã khóa không sửa trực tiếp được.</p></div>
          <Link className="guide-inline-link" href="/dashboard/worklogs"><span>Mở Timesheet của tôi</span><ArrowRight size={15} /></Link>
        </>
      ),
    },
    {
      id: 'nhan-su-nghi-phep',
      title: 'Hồ sơ nhân sự, nghỉ phép và năng lực',
      intro: 'Quản lý thông tin nhân viên, gửi yêu cầu nghỉ và xem khả năng phân bổ.',
      keywords: 'nhân sự employee hợp đồng kỹ năng đơn giá hồ sơ nghỉ phép leave balance số dư nhóm trưởng nhóm skill matrix capacity năng lực account link mời liên kết',
      icon: UsersRound,
      visual: 'people',
      caption: 'Minh họa hồ sơ nhân sự, tài khoản và dữ liệu năng lực',
      content: (
        <>
          <div className="guide-subsection">
            <h3>Hồ sơ và tài khoản đăng nhập</h3>
            <p>Trong <b>Nhân sự</b>, tìm theo tên hoặc trạng thái rồi mở hồ sơ. Hồ sơ có thể hiển thị thông tin, hợp đồng, kỹ năng, đơn giá và lịch sử nghỉ phép; nội dung nhạy cảm chỉ hiện với vai trò phù hợp.</p>
            <ul className="guide-bullets"><li>Owner/HR Admin chọn <b>Mời tài khoản</b> để gửi email cho tài khoản mới.</li><li>Hoặc liên kết hồ sơ với tài khoản Auth đã có bằng đúng email đăng nhập.</li><li>Sau đó Owner cấp vai trò toàn công ty tại <b>Phân quyền</b>; PM/Owner quản lý thành viên dự án ở trang riêng.</li></ul>
          </div>
          <div className="guide-subsection">
            <h3>Gửi yêu cầu nghỉ phép</h3>
            <ol className="guide-number-list"><li>Mở <b>Nghỉ phép</b>, tạo yêu cầu, chọn loại nghỉ, ngày, số ngày và ghi lý do.</li><li>Theo dõi trạng thái đang chờ, đã duyệt hoặc bị từ chối. Nếu bị từ chối, đọc lý do và trao đổi với người duyệt.</li></ol>
          </div>
          <div className="guide-subsection">
            <h3>Tra cứu năng lực</h3>
            <p>Trong <b>Năng lực</b>, chọn khoảng ngày để xem giờ khả dụng và tỷ lệ phân bổ. Năng lực phụ thuộc vào lịch làm, nghỉ phép và allocation đã duyệt. Skill Matrix trong trang nhóm là bảng tra cứu kỹ năng.</p>
          </div>
          <div className="guide-callout warning"><CircleHelp size={18} /><p>Nếu không thấy nút chỉnh sửa hợp đồng, kỹ năng hoặc đơn giá, hãy liên hệ HR. Một số phần hiện chỉ cho phép xem theo vai trò.</p></div>
          <Link className="guide-inline-link" href="/dashboard/hr/leave"><span>Mở Nghỉ phép</span><ArrowRight size={15} /></Link>
        </>
      ),
    },
    {
      id: 'tai-chinh',
      title: 'Hóa đơn và dữ liệu bảng lương',
      intro: 'Theo dõi khoản phải thu và xuất dữ liệu giờ đã duyệt theo kỳ.',
      keywords: 'hóa đơn invoice thanh toán payment đối soát milestone worklog thuế finance admin auditor bảng lương payroll CSV giờ đơn giá',
      icon: WalletCards,
      visual: 'finance',
      caption: 'Minh họa hóa đơn, trạng thái thanh toán và xuất dữ liệu',
      content: (
        <>
          <div className="guide-subsection">
            <h3>Lập hóa đơn và ghi nhận thanh toán</h3>
            <ol className="guide-number-list"><li>Trong <b>Hóa đơn</b>, tìm số hóa đơn hoặc mở dự án cần lập hóa đơn.</li><li>Người được cấp quyền lập hóa đơn chọn milestone đã nghiệm thu hoặc giờ làm đã duyệt trong khoảng thời gian; nhập thuế, hạn thanh toán và ghi chú.</li><li>Finance/Owner ghi nhận ngày và số tiền thanh toán, mã tham chiếu, phí hoặc ghi chú. Đối soát cần người khác với người phát hành hóa đơn.</li></ol>
            <p className="guide-small-note">Hóa đơn lưu thông tin tại thời điểm lập; thay đổi dữ liệu nguồn sau đó không viết lại hóa đơn đã tạo. Director/Auditor có thể chỉ được xem.</p>
          </div>
          <div className="guide-subsection">
            <h3>Xuất CSV giờ làm</h3>
            <p>Trang <b>Bảng lương</b> cho phép mở kỳ tháng và xuất giờ đã duyệt cùng đơn giá lưu theo dữ liệu kỳ. Đây là dữ liệu đầu vào; trang không tự tính thực nhận, thuế, khấu trừ hoặc phát hành phiếu lương.</p>
          </div>
          <div className="guide-callout info"><BadgeCheck size={18} /><p>Finance, HR, Owner và các vai trò được cấp mới thấy các mục tài chính tương ứng. Không gửi file CSV hoặc dữ liệu đơn giá cho người không có quyền.</p></div>
          <div className="guide-link-row"><Link className="guide-inline-link" href="/dashboard/finance/invoices"><span>Mở Hóa đơn</span><ArrowRight size={15} /></Link><Link className="guide-inline-link" href="/dashboard/payroll"><span>Mở Bảng lương</span><ArrowRight size={15} /></Link></div>
        </>
      ),
    },
    {
      id: 'tien-ich-quyen',
      title: 'Tìm kiếm, thông báo và quyền truy cập',
      intro: 'Tìm nhanh thông tin, theo dõi cập nhật và xử lý khi thiếu quyền.',
      keywords: 'tìm kiếm search thông báo notification chuông hồ sơ profile theme sáng tối vai trò quyền role auditor audit lỗi không tải dữ liệu hỗ trợ',
      icon: Bell,
      visual: 'timeline',
      caption: 'Minh họa các bước tìm thông báo và xử lý vấn đề',
      content: (
        <>
          <div className="guide-feature-grid">
            <div><Search size={18} /><strong>Tìm kiếm chung</strong><p>Tìm nhân sự, dự án và tiêu đề ticket trong phạm vi được phép xem.</p></div>
            <div><Bell size={18} /><strong>Thông báo</strong><p>Mở chuông để xem cập nhật; bấm một mục để đánh dấu đã đọc và đi tới trang liên quan.</p></div>
            <div><BookOpen size={18} /><strong>Hồ sơ cá nhân</strong><p>Xem vai trò và dự án tham gia; sửa tên hiển thị nếu trang cho phép.</p></div>
            <div><ShieldCheck size={18} /><strong>Phạm vi quyền</strong><p>Menu hiện theo role và membership. Có tài khoản chưa có nghĩa là có quyền vào mọi màn hình.</p></div>
          </div>
          <div className="guide-subsection">
            <h3>Không thấy chức năng hoặc trang báo lỗi?</h3>
            <ul className="guide-bullets"><li>Không có menu/nút: nhờ Owner/HR kiểm tra vai trò, quyền tùy chỉnh và membership dự án.</li><li>Danh sách trống: xóa bộ lọc, kiểm tra dự án/kỳ ngày và xác nhận dữ liệu đã được tạo.</li><li>Không gửi được giờ/nghỉ: kiểm tra hồ sơ nhân sự đã liên kết tài khoản chưa.</li><li>Trang lỗi: tải lại một lần, ghi tên trang, thời điểm và thông báo để gửi quản trị viên. Không gửi mật khẩu hoặc link khôi phục.</li></ul>
          </div>
          <div className="guide-callout warning"><CircleHelp size={18} /><p>Role phổ biến: Owner quản trị; HR Admin quản lý nhân sự; Finance Admin phụ trách tài chính; Director duyệt một số quyết định; PM/TL điều phối dự án; Developer/QA làm ticket trong dự án; Auditor xem dữ liệu kiểm tra.</p></div>
        </>
      ),
    },
  ], [])

  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi')
    if (!normalized) return sections
    return sections.filter((section) =>
      `${section.title} ${section.intro} ${section.keywords}`
        .toLocaleLowerCase('vi')
        .includes(normalized),
    )
  }, [query, sections])

  function jumpTo(id: string) {
    setQuery('')
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return (
    <main id="main-content" className="page-content guide-page-content">
      <div className="guide-shell">
        <section className="guide-hero">
          <div className="guide-hero-copy">
            <span className="guide-hero-kicker"><BookOpen size={15} /> TRUNG TÂM HƯỚNG DẪN</span>
            <h2>Từng bước rõ ràng.<br /><span>Công việc trôi chảy hơn.</span></h2>
            <p>Hướng dẫn cách dùng các phân hệ, hiểu trạng thái và biết cần liên hệ ai khi thiếu quyền. Chọn một chủ đề hoặc tìm theo thao tác bạn đang cần.</p>
            <div className="guide-hero-actions">
              <Link href="/dashboard/worklogs" className="btn"><Clock3 size={16} /> Ghi giờ làm <ArrowRight size={15} /></Link>
              <Link href="/dashboard/issues" className="btn ghost"><ListChecks size={16} /> Mở Board & ticket</Link>
            </div>
            <div className="guide-hero-meta"><span><Check size={14} /> Theo giao diện hiện tại</span><span><Check size={14} /> Có minh họa luồng</span><span><Check size={14} /> Dùng được trên mobile</span></div>
          </div>
          <div className="guide-hero-art"><GuideIllustration kind="dashboard" label="Sơ đồ minh họa Dashboard, bộ lọc và số liệu theo kỳ" /></div>
          <div className="guide-hero-glow" aria-hidden="true" />
        </section>

        <section className="guide-start-panel" aria-label="Lối tắt và tìm hướng dẫn">
          <div className="guide-search-area">
            <div><p className="guide-eyebrow">BẠN ĐANG TÌM GÌ?</p><h2>Tìm nhanh trong hướng dẫn</h2></div>
            <label className="guide-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Thử: quên mật khẩu, gửi timesheet, hóa đơn…" aria-label="Tìm chủ đề trong hướng dẫn" /></label>
            {query && <p className="guide-search-result">{filteredSections.length ? `Tìm thấy ${filteredSections.length} chủ đề phù hợp.` : 'Chưa tìm thấy chủ đề. Thử từ khóa khác hoặc xem toàn bộ mục lục.'}</p>}
          </div>
          <div className="guide-topic-area">
            <p className="guide-eyebrow">ĐI TỚI CHỦ ĐỀ</p>
            <div className="guide-topic-links">
              {sections.map((section) => {
                const Icon = section.icon
                return <a key={section.id} href={`#${section.id}`} onClick={() => jumpTo(section.id)}><Icon size={15} /><span>{section.title}</span><ChevronRight size={14} /></a>
              })}
            </div>
          </div>
        </section>

        <div className="guide-role-strip">
          <div className="guide-role-icon"><UsersRound size={19} /></div>
          <div><strong>Quyền hiển thị tùy theo vai trò và dự án</strong><p>Owner, HR, Finance, Director, PM, TL, Developer, QA và Auditor có phạm vi khác nhau. Nếu thiếu nút hoặc menu, hãy nhờ Owner/HR kiểm tra quyền và thành viên dự án.</p></div>
          <Link href="/dashboard/profile" className="guide-role-link">Xem hồ sơ <ArrowRight size={14} /></Link>
        </div>

        <div className="guide-sections-heading"><div><p className="guide-eyebrow">THƯ VIỆN HƯỚNG DẪN</p><h2>{query ? 'Kết quả tìm kiếm' : 'Khám phá theo công việc'}</h2></div><span>{filteredSections.length} / {sections.length} chủ đề</span></div>
        <div className="guide-sections">
          {filteredSections.map((section) => <GuideSectionCard key={section.id} section={section} />)}
          {!filteredSections.length && <div className="guide-empty"><CircleHelp size={26} /><h3>Chưa có mục hướng dẫn phù hợp</h3><p>Thử tìm bằng từ khóa ngắn hơn, ví dụ “nghỉ phép”, “ticket” hoặc “tài khoản”.</p><button className="btn ghost sm" onClick={() => setQuery('')}>Xem tất cả chủ đề</button></div>}
        </div>

        <footer className="guide-footer"><div className="guide-footer-icon"><BriefcaseBusiness size={19} /></div><div><strong>Vẫn cần hỗ trợ?</strong><p>Gửi cho quản trị viên tên màn hình, thời điểm, thao tác vừa làm và nội dung báo lỗi. Không gửi mật khẩu, mã xác nhận hay liên kết đặt lại mật khẩu.</p></div><Link href="/dashboard/search" className="guide-footer-link">Mở tìm kiếm <ArrowRight size={14} /></Link></footer>
      </div>
    </main>
  )
}
