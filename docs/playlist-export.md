# Xuất playlist thành MP4

Khởi động ứng dụng bằng `./start.sh`, sau đó chạy:

```sh
sh scripts/export-playlist-720p.sh
```

Lệnh này bỏ qua 6 mục đầu trong playlist của sự kiện đang chọn, xuất các mục còn lại ở 1280×720, 30 fps. Mỗi file mang tên mục playlist; tên trùng được thêm số. File được lưu trong thư mục mới dưới `output/playlist-mp4-*`. Không cần chọn cửa sổ hoặc cấp quyền quay màn hình. Chrome chạy ẩn; playlist đang phát không bị điều khiển hay chỉnh sửa.

Script dùng chính Renderer của ứng dụng để giữ bố cục, logo, tên công ty, ảnh cuộn, video nền và bo góc. Âm thanh được ghép bằng FFmpeg theo tốc độ, mute, âm lượng clip và âm lượng tổng. Thời lượng theo chế độ chuyển clip hiện tại; mục bật lặp dùng durationSeconds để có điểm kết thúc hữu hạn. Mỗi mục được xuất riêng từ đầu, không bao gồm chuyển cảnh giữa hai mục.

Yêu cầu: Google Chrome, FFmpeg/ffprobe và dependencies đã cài bằng `npm install`. Có thể chỉ định Chrome khác bằng biến `CHROME_PATH`.

Các tùy chọn:

```sh
node scripts/export-playlist.mjs --skip 6 --width 1280 --height 720 --out output/my-export
node scripts/export-playlist.mjs --only Bac-Opella --duration 2 --width 1280 --height 720
```

`--skip N`: bỏ N mục đầu; `--only`: tên hoặc ID mục; `--duration`: giới hạn giây để thử; `--fps`: mặc định 30; `--enabled-only`: chỉ mục bật. Mặc định xuất cả mục tắt vì yêu cầu là toàn bộ playlist. Thư mục đích không được chứa MP4 trùng tên: script không ghi đè file đã có.

Mỗi MP4 được kiểm tra codec H.264, kích thước và thời lượng bằng ffprobe trước khi hoàn tất. `playlist-snapshot.json` lưu cấu hình đầu vào; `export-report.json` liệt kê kết quả và lỗi. File `.partial.mp4` là mục chưa hoàn tất. Ctrl+C dừng quá trình, giữ các MP4 đã hoàn thành.
