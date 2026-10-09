# Hướng dẫn sử dụng Hezb ERP

Tài liệu dành cho người dùng ứng dụng. Các màn hình và nút thao tác có thể khác nhau theo vai trò, quyền được cấp và dự án bạn tham gia.

## 1. Đăng nhập và bắt đầu

1. Mở địa chỉ web do quản trị viên cung cấp và đăng nhập bằng email, mật khẩu.
2. Nếu chưa có tài khoản, nhờ Owner hoặc HR Admin tạo hồ sơ nhân sự và gửi lời mời. Mở email mời để xác nhận tài khoản, sau đó tự đặt mật khẩu.
3. Nếu quên mật khẩu, chọn **Quên mật khẩu?**, nhập email tài khoản và làm theo liên kết khôi phục trong email.
4. Sau khi đăng nhập, dùng menu bên trái để mở các phân hệ. Bấm tên để xem hồ sơ cá nhân hoặc **Đăng xuất** để kết thúc phiên.

Không có tài khoản hoặc mật khẩu mặc định dùng chung. Ứng dụng không còn chế độ xem dữ liệu mẫu; sau khi đăng nhập qua Supabase Auth, mỗi trang đọc dữ liệu trong database theo quyền của tài khoản.

Nếu danh sách không có dòng nào, hãy xóa bộ lọc, kiểm tra dự án và khoảng ngày. Nếu vẫn trống, có thể database chưa có dữ liệu phù hợp hoặc tài khoản chưa được cấp quyền; nhờ Owner/HR kiểm tra role và membership. Nếu trang báo lỗi tải dữ liệu, kiểm tra kết nối rồi báo quản trị viên.

### Giao diện chung

- Thanh trên cùng có tìm kiếm nhanh, nút ghi giờ làm (nếu bạn có quyền), thông báo và đổi giao diện sáng/tối.
- Nhiều trang có bộ lọc, tìm kiếm và phân trang. Khi danh sách trống, hãy kiểm tra bộ lọc và khoảng thời gian trước khi báo lỗi.
- Các thông báo thành công/lỗi xuất hiện ngay sau thao tác. Nếu trang báo không tải được dữ liệu, thử tải lại một lần; nếu vẫn lỗi, gửi tên trang và nội dung thông báo cho quản trị viên.
- Thông tin nhạy cảm như đơn giá, chi phí và lương chỉ hiển thị với nhóm được phép.

## 2. Vai trò và quyền truy cập

Quyền trong ứng dụng phụ thuộc vào vai trò toàn công ty, quyền tùy chỉnh và tư cách thành viên trong từng dự án. Bảng dưới đây mô tả phạm vi thường gặp; quyền cụ thể do Owner cấu hình.

| Nhóm vai trò | Công việc thường làm |
| --- | --- |
| Owner | Quản trị toàn hệ thống; phân quyền, quản lý dự án và nhân sự, duyệt các bước được phân quyền, xem tài chính và nhật ký. |
| HR Admin | Hồ sơ nhân sự, nhóm, nghỉ phép, năng lực; mời/liên kết tài khoản; duyệt bước trưởng nhóm của timesheet. |
| Finance Admin | Hóa đơn, ghi nhận thanh toán, dữ liệu tài chính và xuất giờ làm phục vụ tính lương. |
| Director | Xem tổng quan và tài chính theo chính sách; duyệt đề xuất dự án, milestone và các yêu cầu được giao. |
| Project Manager (PM) | Quản lý dự án được giao, ticket, thành viên, phân bổ, timesheet và milestone theo quyền. |
| Team Leader (TL) | Điều phối nhóm/dự án và duyệt bước trưởng nhóm của timesheet theo phạm vi được giao. |
| Developer / QA Reviewer | Làm việc với ticket và ghi giờ trong dự án có tham gia; QA thực hiện quy trình kiểm thử được cấp. |
| Auditor | Xem dữ liệu tài chính và nhật ký để kiểm tra; thường không có quyền sửa. |

Nếu không thấy một mục menu hoặc nút thao tác, hãy nhờ Owner/HR kiểm tra vai trò, quyền tùy chỉnh và thành viên dự án. Việc có tài khoản đăng nhập không tự động cấp quyền vào mọi dự án.

## 3. Dashboard

Mở **Dashboard** để xem tình hình chung. Chọn khoảng thời gian và dự án để lọc các số liệu theo kỳ. Các thẻ tổng quan bao gồm nhân sự đang hoạt động, ticket đang mở, timesheet chờ duyệt và dự án đang hoạt động.

Phần **Utilization theo nhân sự trong kỳ** so sánh giờ làm đã được duyệt với năng lực khả dụng của từng người trong khoảng đã chọn. Năng lực tính theo ngày làm việc, lịch nghỉ đã duyệt và phân bổ dự án đã duyệt. Nếu không có năng lực khả dụng, ô có thể hiển thị dấu gạch. Một số chỉ số như ticket đang mở và dự án hoạt động phản ánh trạng thái hiện tại, không phải ảnh chụp lịch sử tại ngày kết thúc kỳ.

## 4. Khách hàng, dự án và đề xuất

### Khách hàng

Vào **Khách hàng** để tìm hoặc mở hồ sơ khách hàng. Tùy quyền, bạn có thể thêm/sửa thông tin như tên, mã, địa chỉ, website, ghi chú và danh bạ liên hệ. Trong hồ sơ khách hàng, có thể thêm, sửa hoặc xóa liên hệ và chọn liên hệ chính.

### Tạo đề xuất và dự án

1. Vào **Dự án**. Tại tab đề xuất, người có quyền tạo đề xuất nhập thông tin và lưu bản nháp.
2. Gửi đề xuất để xin duyệt. Người tạo không thể tự duyệt đề xuất của mình.
3. Owner hoặc Director có quyền duyệt/từ chối. Đề xuất được duyệt sẽ tạo dự án.
4. Khi tạo hoặc chỉnh sửa dự án, nhập tên, khách hàng, mã, loại tính phí, trạng thái, ngân sách, tiền tệ, ngày bắt đầu/kết thúc và mô tả theo biểu mẫu.

Trong trang chi tiết dự án, người có quyền có thể xem thành viên, milestone, phân bổ, chi phí thực tế, sprint/backlog và giờ làm gần đây. Một số thông tin tài chính chỉ hiện với vai trò được cấp.

### Thành viên và phân bổ dự án

- Owner, Director hoặc PM được cấp quyền quản lý thành viên có thể thêm tài khoản vào dự án, chọn vai trò trong dự án và thời gian hiệu lực tại **Thành viên dự án**.
- Yêu cầu phân bổ nhân sự cần người có quyền tạo và người có quyền duyệt. Khi được duyệt, hệ thống tạo tư cách thành viên dự án.
- Nếu yêu cầu vượt năng lực khả dụng hoặc thiếu đơn giá hiệu lực, yêu cầu có thể không được duyệt; liên hệ HR/Owner để cập nhật dữ liệu liên quan.

### Milestone và sprint

Người quản lý dự án được cấp quyền có thể tạo/chỉnh sửa milestone và sprint. Với milestone, PM/Owner gửi yêu cầu nghiệm thu; người có quyền duyệt có thể chấp nhận hoặc từ chối. Với sprint, PM/TL có quyền đưa ticket vào sprint theo quyền của dự án.

## 5. Board và ticket

Vào **Board & ticket** để xem ticket. Có thể lọc theo dự án, sprint, backlog, tiêu đề hoặc ticket quá hạn; chuyển giữa dạng danh sách và Kanban nếu trang cung cấp lựa chọn đó.

### Tạo và cập nhật ticket

1. Chọn dự án và tạo ticket nếu bạn có quyền trong dự án.
2. Nhập tiêu đề, loại ticket, mức ưu tiên, ngày cần hoàn thành và thông tin liên kết cha nếu có.
3. Mở ticket để xem mô tả, bình luận, tệp đính kèm, ticket cha/con và lịch sử hoạt động.
4. Cập nhật trạng thái hoặc trường thông tin khi thao tác được cho phép. Một số thay đổi chỉ PM/TL hoặc người có quyền mới thực hiện được; ticket đã kết thúc có thể bị khóa.

Chỉ tải lên tệp liên quan đến công việc trong dự án. Nếu không thể sửa ticket, hãy kiểm tra trạng thái ticket và quyền thành viên dự án hoặc nhờ PM hỗ trợ.

## 6. Chấm công và timesheet

### Ghi giờ làm

1. Chọn **Ghi giờ làm** trên thanh trên cùng hoặc mở **Timesheet của tôi**.
2. Nếu cần, chấm công vào/ra theo hướng dẫn trên trang. Hệ thống ghi thời gian theo giờ địa phương hiển thị.
3. Thêm worklog, chọn dự án, ticket, ngày, số giờ (bước 0,25 giờ), loại công việc, mô tả và trạng thái tính phí.
4. Dùng lịch tuần để xem tổng giờ theo ngày và ticket.

Chỉ worklog ở trạng thái nháp mới có thể sửa/xóa. Sau khi gửi, bạn không thể sửa trực tiếp; nếu kỳ đã khóa, hãy gửi yêu cầu điều chỉnh sau khóa. Kiểm tra ticket, ngày và số giờ trước khi gửi.

### Gửi và duyệt timesheet

1. Trong **Timesheet của tôi**, chọn kỳ và gửi timesheet theo dự án/khoảng ngày được hiển thị.
2. Timesheet đi qua bước duyệt trưởng nhóm trước, rồi bước PM. Người duyệt không thể duyệt timesheet của chính mình.
3. Nếu bị từ chối, đọc lý do, chỉnh lại worklog rồi gửi lại.
4. Sau khi PM duyệt, Owner hoặc PM của dự án có thể khóa timesheet. Worklog đã khóa không thể sửa trực tiếp.

Tab **Duyệt timesheet** chỉ xuất hiện với người có bước duyệt trong phạm vi của họ. Tab **Điều chỉnh sau khóa** dùng để gửi yêu cầu thay đổi worklog đã khóa; yêu cầu cần lý do và phải được người có quyền xem xét riêng.

## 7. Nhân sự, nhóm, nghỉ phép và năng lực

### Hồ sơ nhân sự và tài khoản

Trong **Nhân sự**, người có quyền có thể tìm nhân viên theo tên, trạng thái hoặc loại nhân sự và mở hồ sơ chi tiết. Hồ sơ có thể gồm thông tin cá nhân, hợp đồng, kỹ năng, đơn giá và nghỉ phép; một số nội dung chỉ HR/Owner/Finance được xem. Nếu không có nút chỉnh sửa, liên hệ HR để cập nhật.

Owner hoặc HR Admin có thể mời/liên kết tài khoản ở hồ sơ nhân sự:

- **Mời tài khoản mới:** gửi lời mời tới email. Người nhận mở thư để xác nhận và tự đặt mật khẩu.
- **Liên kết tài khoản có sẵn:** nhập đúng email của tài khoản đã tồn tại.

Sau khi liên kết, Owner cần cấp vai trò phù hợp tại **Phân quyền**. Nếu nhân viên chưa được liên kết với tài khoản, một số chức năng cá nhân như gửi nghỉ phép hoặc giờ làm có thể không dùng được.

### Nhóm và năng lực

Trong **Nhóm & trưởng nhóm**, HR/Owner quản lý nhóm, thành viên và thời gian hiệu lực của vai trò trưởng nhóm. Phần Skill Matrix cho phép xem kỹ năng theo nhóm; đây là màn hình tra cứu.

Trong **Năng lực**, chọn khoảng thời gian để xem giờ khả dụng và tỷ lệ phân bổ. Dữ liệu phụ thuộc vào lịch làm, nghỉ phép đã duyệt và phân bổ đã duyệt. Nếu thấy số liệu không đúng, báo HR/PM kiểm tra các dữ liệu nguồn.

### Xin nghỉ phép

1. Mở **Nghỉ phép**, tạo yêu cầu và chọn loại nghỉ, ngày bắt đầu/kết thúc, số ngày cùng lý do.
2. Theo dõi trạng thái pending/approved/rejected trong danh sách.
3. Nếu bị từ chối, đọc lý do hoặc liên hệ người duyệt. Người tạo yêu cầu không tự duyệt yêu cầu của mình.

Số dư nghỉ phép hiển thị trên hồ sơ có thể được HR/Owner điều chỉnh. Nếu số dư không đúng, liên hệ HR.

## 8. Hóa đơn và bảng lương

### Hóa đơn

Trong **Hóa đơn**, tìm theo số hóa đơn và mở hóa đơn để xem chi tiết. Người có quyền lập hóa đơn có thể chọn dự án rồi lập từ milestone đã nghiệm thu hoặc từ worklog đã duyệt trong một khoảng thời gian; nhập thuế, hạn thanh toán và ghi chú theo biểu mẫu.

Thông tin hóa đơn là bản chụp tại thời điểm tạo. Finance/Owner có thể ghi nhận thanh toán (ngày, số tiền, mã tham chiếu, phí và ghi chú). Việc đối soát cần một người khác với người phát hành hóa đơn. Director/Auditor có thể chỉ có quyền xem.

### Xuất dữ liệu giờ cho bảng lương

Trang **Bảng lương** cho phép người có quyền mở kỳ tháng và xuất CSV giờ đã duyệt cùng đơn giá lưu theo dữ liệu kỳ. Đây là dữ liệu giờ phục vụ xử lý tiếp; trang không tính lương thực nhận, thuế hay khấu trừ và không thay thế quy trình duyệt bảng lương bên ngoài.

## 9. Phân quyền, nhật ký và tiện ích

- **Phân quyền:** Owner gán/gỡ vai trò toàn công ty và cấu hình quyền tính năng đã hỗ trợ. Không thể gỡ Owner cuối cùng. HR Admin có thể xem nhưng không quản lý vai trò.
- **Nhật ký hệ thống:** Owner/Auditor có thể lọc theo người thực hiện, bảng, hành động và khoảng ngày. Nhật ký chỉ đọc; một số giá trị được che để bảo vệ dữ liệu.
- **Tìm kiếm:** dùng tìm kiếm chung để tra nhân sự, dự án và tiêu đề ticket trong phạm vi dữ liệu bạn được phép xem.
- **Thông báo:** bấm chuông để xem thông báo; mở một thông báo để đánh dấu đã đọc và đi tới trang liên quan, hoặc chọn đọc tất cả.
- **Hồ sơ cá nhân:** xem vai trò, dự án tham gia và cập nhật tên hiển thị nếu được cho phép.

## 10. Khi gặp vấn đề

| Tình huống | Cách xử lý |
| --- | --- |
| Không thấy menu hoặc nút | Nhờ Owner/HR kiểm tra vai trò, quyền tùy chỉnh và thành viên dự án. |
| Danh sách trống | Xóa bớt bộ lọc, kiểm tra ngày/kỳ và dự án đã chọn; dữ liệu mới chưa được tạo cũng sẽ hiện danh sách trống. |
| Không gửi được giờ làm/nghỉ phép | Kiểm tra bạn đã đăng nhập đúng tài khoản và hồ sơ nhân sự đã được liên kết chưa; báo HR nếu cần. |
| Không sửa được worklog | Kiểm tra worklog đã gửi hoặc kỳ đã khóa chưa. Dùng yêu cầu điều chỉnh sau khóa khi có sẵn. |
| Không duyệt được yêu cầu | Bạn có thể không thuộc bước duyệt, không thuộc phạm vi dự án, hoặc là người tạo yêu cầu. Liên hệ người quản lý quy trình. |
| Không nhận được email mời/khôi phục | Kiểm tra email và thư rác; nếu vẫn không có, nhờ Owner/HR kiểm tra địa chỉ tài khoản và cấu hình email. |
| Trang báo lỗi tải dữ liệu | Tải lại trang một lần, ghi lại tên trang và thông báo lỗi rồi gửi cho quản trị viên. Không gửi mật khẩu hoặc liên kết khôi phục. |

Khi báo sự cố, ghi lại tên trang, thời điểm, bước vừa thực hiện và nội dung thông báo. Không gửi mật khẩu, mã khôi phục hoặc thông tin bí mật qua kênh hỗ trợ.
