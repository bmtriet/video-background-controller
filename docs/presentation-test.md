# Thử thuyết trình trên macOS

Đây là bản thử riêng trên cổng 3001, chưa tích hợp vào playlist. Cấu hình và bản
copy bài trình chiếu nằm trong `data/presentation-test/`. Server hội nghị trên
cổng 3000 không bị dừng hoặc đổi trạng thái.

## Chạy bản thử

1. Build bằng `npm run build`.
2. Chạy `npm run presentation:test` trong thư mục dự án; giữ terminal đang chạy.
3. Mở `http://localhost:3001/presentation-test`.
4. Tải file `.pptx`, chọn PNG diễn giả và video nền có sẵn trong thư viện.
5. Bấm **Đọc màn hình**, chọn màn chiếu, rồi **Mở màn chiếu thử trong Chrome**.
6. Bấm **Mở PowerPoint vào khung**. Bản thử mở bản copy và bấm Reading View của PowerPoint, rồi căn cửa sổ
   đó phía trước Chrome.

macOS có thể hỏi quyền Automation cho tiến trình chạy bản thử để điều khiển
Chrome, và quyền Accessibility để căn cửa sổ PowerPoint. Nếu chưa có quyền,
bản thử báo lỗi, không tự yêu cầu hoặc cấp quyền. Không cần Full Disk Access. Các bài
trình chiếu đã mở trước đó không được chỉnh sửa hoặc đóng. Bài tải vào bản thử
là một bản copy; thay đổi thiết lập trình chiếu không được lưu vào file gốc.

Bản thử biên dịch helper Swift bằng Command Line Tools đã có trên máy này.
Chrome và PowerPoint cần ở cùng Desktop/Space. Giữ Chrome ở cửa sổ thường và
zoom 100%, không dùng fullscreen macOS tạo Space riêng cho Chrome. Chrome
được mở vào vùng làm việc của màn hình đã chọn, vẫn có thanh cửa sổ/trình duyệt.

## Căn khung và điều khiển

- Tự đọc tỉ lệ slide từ `.pptx`; có thể chọn 16:9 hoặc 4:3 thủ công.
- Nội dung giữ tỉ lệ và vừa vùng bên trái. Chiều cao thanh cửa sổ mặc định 28
  điểm; điều chỉnh nếu phiên bản macOS/PowerPoint khác. Dịch ngang/dọc dùng để
  hiệu chỉnh. Sau khi chỉnh, bấm **Căn vào khung**.
- **Phóng slide** / **Trở về ¾–¼** đổi kích thước cửa sổ hiện tại, giữ slide.
- **Trả pointer về PowerPoint** kích hoạt lại PowerPoint sau khi dùng Controller.
- Pointer làm việc trực tiếp với PowerPoint. Không bấm tiếp tục vượt slide cuối
  trong buổi thử; thao tác đó có thể kết thúc Reading View. App không chuyển
  playlist khi PowerPoint kết thúc.
- Nút Slide trước/sau gửi phím mũi tên cho đúng cửa sổ Reading View. Với bài có
  animation, phím có thể chuyển từng bước hiệu ứng. Nút sau dừng ở trang cuối
  để tránh thoát bài; pointer thật vẫn do PowerPoint xử lý.
- **Đọc trạng thái PowerPoint** cập nhật vị trí trang sau khi dùng pointer.
- **Kết thúc bài thử** thoát cửa sổ trình chiếu của riêng bài đã tải. Không đóng
  PowerPoint hoặc các bài khác. Nếu thoát Reading View bằng Esc/pointer thì
  bấm **Đọc trạng thái PowerPoint** để giải phóng bài hiện tại, hoặc
  **Mở PowerPoint vào khung** để mở lại.
- Video nền luôn tắt tiếng và lặp. Chế độ phóng ẩn video nền, header và diễn giả,
  mở rộng slide trong vùng màn chiếu Chrome; chưa chuyển sang fullscreen Space
  của macOS. PowerPoint có thể giữ viền đen quanh nội dung 4:3 để bảo toàn tỉ lệ.
- Preview trong Controller chỉ là bố cục, không bao gồm nội dung của cửa sổ
  PowerPoint. Khung hướng dẫn có thể tắt khi trình chiếu thật.

## Điều kiện đánh giá

Thử trên hai màn hình với deck 16:9, 4:3, file có animation/video và pointer thật.
Kiểm tra thứ tự cửa sổ sau khi bấm Controller, phóng/thu giữ đúng trang, chuẩn
tọa độ trên màn hình Retina và màn chiếu. Nếu Reading View bị đóng, chọn Đọc trạng
thái để giải phóng bài đang chọn. Chưa thể kết luận pointer phần cứng hoặc hiệu ứng của bài thật
chỉ dựa vào kiểm thử phần mềm.

Các bài thử 3 trang ở `output/presentation-test/` được tạo bằng
`scripts/create-presentation-fixtures.py`. Không có bài người dùng nào bị thay
đổi để tạo fixture.

## Kết quả kiểm tra trên máy này

- PowerPoint 16.113.2: Reading View và phím trái/phải chạy được.
- API AppleScript đọc danh sách bài PowerPoint bị timeout; bản thử dùng
  Accessibility của macOS để tìm đúng cửa sổ của bản copy có tên UUID.
- Đã mở tự động bài 4:3, căn khung, chuyển trang; bài 16:9 đã căn khung và
  phóng/thu giữ nguyên slide 2. Cần thử pointer thật và bài có hiệu ứng/video.
- Build và 33 kiểm thử phần mềm đạt. Đây vẫn là bản thử riêng, chưa thêm vào
  playlist của hội nghị.
