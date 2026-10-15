# Capture PowerPoint trong app

Capture đã tích hợp vào `/controller` và `/player`, mặc định cho mục Thuyết trình. Người dùng đã xác nhận bản thử capture hoạt động trên máy macOS này.

1. Trong Controller, chọn file PowerPoint, PNG diễn giả và video nền; chọn chế độ Capture, rồi Go Live.
2. Trên Player trong Chrome, bấm **Capture PowerPoint**, chọn cửa sổ Reading View có tên được hiển thị, rồi Share.
3. Bấm **Fullscreen Player**. Bấm vào Player để nhận phím mũi tên hoặc Page Up/Page Down từ pointer. Có thể dùng nút Trước/Sau trong Controller.
4. **Phóng slide** chuyển sang bố cục slide toàn màn hình; thu lại để hiện diễn giả. Slide giữ tỷ lệ 16:9 hoặc 4:3.
5. **Kết thúc** chuyển playlist; **Dừng capture** giải phóng nguồn capture. Reload Player hoặc bắt đầu bài khác cần chọn nguồn lại.

Video nền và nguồn capture tắt âm thanh. Stream chỉ hiển thị tại máy, không ghi file hoặc truyền qua server. Giữ cửa sổ nguồn mở; nếu PowerPoint gom cửa sổ thành tab, chọn đúng tab Reading View trước khi capture. Capture hiện bao gồm viền cửa sổ PowerPoint. Chế độ cửa sổ cũ vẫn có trong tùy chọn, dùng Chrome ở cửa sổ thường.

Build và 39 kiểm thử phần mềm đạt trước khi người dùng yêu cầu ngừng kiểm thử thêm. Kiểm thử giao diện tích hợp, fullscreen và pointer sẽ do người dùng thực hiện.

## Bản thử độc lập

Chạy `npm run build`, rồi `npm run presentation:test`. Mở Chrome tại `http://localhost:3001/presentation-capture`. Bản thử dùng dữ liệu POC cổng 3001, độc lập với playlist chính trên cổng 3000.

1. Chọn bài thử đã tải trên `/presentation-test`, bấm **Mở Reading View thử**.
2. Bấm **Capture PowerPoint**, chọn riêng cửa sổ Reading View của bài thử và Share. Trình duyệt yêu cầu lựa chọn nguồn từ thao tác người dùng, không tự chọn hoặc ghi nhớ quyền capture.
3. Nếu Chrome báo thiếu quyền, vào System Settings → Privacy & Security → Screen & System Audio Recording, cho phép Google Chrome và mở lại Chrome. Bước này cần người dùng xác nhận vì quyền cho phép Chrome đọc màn hình và restart sẽ ngắt các Player đang mở.
4. Hình cửa sổ xuất hiện trong video của bản thử. Bấm **Fullscreen Player**, thử **Slide sau/trước** và phím mũi tên/Page Up/Page Down khi Chrome giữ focus. Lệnh thử gửi phím trực tiếp tới PID PowerPoint, không kích hoạt/raise cửa sổ nguồn. Nếu PowerPoint gom bài thành tab, chọn tab của bài thử trước khi fullscreen; app không chuyển tab ở nền.
5. Kiểm tra số khung hình tăng, hình slide đổi, Player vẫn fullscreen. **Phóng slide/Thu về ¾–¼** chỉ đổi bố cục trang capture, không thay kích thước PowerPoint. Giữ cửa sổ nguồn mở, không minimize; việc nguồn bị che hoặc ở Space khác cần kiểm tra thực tế trên máy.
6. **Dừng capture** dừng mọi track và giải phóng stream. **Kết thúc bài thử** dừng capture và đóng Reading View của bài thử. Nút Stop Sharing của Chrome cũng giải phóng stream trong trang. Reload cần chọn capture lại.

Chỉ xem trực tiếp tại máy: không dùng MediaRecorder, không tạo file và không gửi stream lên mạng. Chỉ yêu cầu video, audio false. Bản thử nhận cửa sổ, từ chối capture cả màn hình/tab Chrome để tránh ảnh lặp. Capture bao gồm viền PowerPoint, chưa cắt viền.

## Trạng thái kiểm tra

Người dùng đã cấp quyền Ghi màn hình, mở lại Chrome và xác nhận bản thử hoạt động. Pointer phần cứng và giao diện tích hợp cần người dùng thử thực tế.
