# Thuyết trình trong playlist trên macOS

## Chuẩn bị

Sau `npm run build`, khởi động lại server và tải lại Controller/Player. Thêm **Thuyết trình** vào playlist, chọn hoặc tải `.pptx` (tối đa 100 MB), PNG có ảnh/thông tin diễn giả và video nền tùy chọn. PPTX trong `media/presentations/` tự xuất hiện ở tab Slides. Mục mới mặc định tắt; bật **Cho phép phát** sau khi chọn đủ file. Kéo bài tới vị trí giữa các quảng cáo. Nếu bật Loop list, đặt bài trong đoạn Start from → End here hoặc mở rộng đoạn lặp để bao gồm bài.

Mở Microsoft PowerPoint trước buổi trình chiếu. Máy cần Command Line Tools để biên dịch helper Swift và quyền Accessibility cho ứng dụng chạy server. Nếu thiếu quyền, app báo lỗi để người vận hành xử lý; không tự cấp quyền.

Mở một Player trong Chrome, chuyển sang màn chiếu, giữ zoom 100% và cửa sổ thường, cùng Desktop/Space với PowerPoint. Không dùng fullscreen macOS tạo Space riêng. Nhiều Player vẫn có thể xem nền nhưng chỉ Player báo khung đầu tiên của phiên được dùng để căn PowerPoint; một Player mất kết nối quá 5 giây có thể được thay thế.

## Trình chiếu

1. Bấm **Go live**. Player hiện nền tắt tiếng/lặp, header và PNG diễn giả bên phải. App mở bản sao riêng của PPTX trong Reading View và căn vào ¾ bên trái.
2. Tỉ lệ **Tự đọc từ PowerPoint** hỗ trợ 16:9, 4:3; có thể chọn thủ công. Cửa sổ và nội dung giữ tỉ lệ trong vùng dành cho slide. Đổi tỉ lệ/căn chỉnh rồi bấm **Mở / căn slide** để áp dụng. Thanh cửa sổ mặc định 32 điểm; nếu có tab hoặc viền khác, điều chỉnh giá trị trong **Căn chỉnh cửa sổ**.
3. **Trả pointer** đưa focus về PowerPoint. Pointer gửi phím trực tiếp cho Reading View. **Trước/Sau** trên Controller cũng gửi phím mũi tên; **Đọc trạng thái** cập nhật trang sau khi dùng pointer.
4. **Phóng slide** mở rộng cửa sổ trong vùng Player, ẩn header/diễn giả/nền. **Thu về ¾–¼** giữ trang hiện tại. Đây là phóng cửa sổ, không chuyển sang fullscreen Space của macOS.
5. Mục thuyết trình giữ vô thời hạn, không tự chuyển khi hết trang hoặc nhận tín hiệu video-ended. **Kết thúc & tiếp tục** đóng Reading View của bản sao hiện tại và phát mục playlist tiếp theo. Nếu không còn mục bật thì dừng; loop playlist vẫn theo đoạn đã cấu hình. Next/Previous/Stop của transport cũng kết thúc phiên hiện tại.

File nguồn không bị chỉnh sửa. App chỉ điều khiển bản sao có tên UUID của phiên hiện tại; khi PowerPoint gom nhiều bài thành tab, helper chọn/đóng tab của bản sao. Nếu không xác định được tab, app báo lỗi thay vì đóng cả cửa sổ. Khi không đóng được bài đã kết thúc, Controller có nút **Thử đóng bài đã kết thúc**.

## Giới hạn và kiểm tra trước hội nghị

Preview trên Controller hiện bố cục và tên file, không chụp nội dung PowerPoint. Pause của playlist chỉ giữ thời gian runtime; PowerPoint/pointer và video nền vẫn do ứng dụng riêng điều khiển. File PowerPoint đang phát không được thay nguồn, cần Stop trước. Bài thuyết trình không có độ dài cố định nên không thể xuất cùng range thành MP4; bỏ mục thuyết trình khỏi range xuất.

Đã kiểm tra trên máy này với Reading View: mở tự động, chuyển trang, phím trái, phóng/thu giữ trang, video nền tắt tiếng/lặp và kết thúc từ Controller. Kiểm thử phần mềm bao gồm giữ vô thời hạn, chuyển mục thủ công, nguồn file, lưu cấu hình, nonce và phiên điều khiển cũ. Vẫn cần chạy thử pointer phần cứng, bài có animation/video, hai màn hình và tỉ lệ/viền cửa sổ ở màn chiếu thật. PowerPoint có thể hiện viền đen để giữ tỉ lệ.

Bản POC cổng 3001 vẫn độc lập; xem [hướng dẫn thử](presentation-test.md). Bản tích hợp dùng `/controller` và `/player` của server chính.
