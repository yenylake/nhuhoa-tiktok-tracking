# TikTok Tracking – Thẩm mỹ Như Hoa

Web theo dõi các kênh TikTok của các bộ phận, lấy danh sách kênh + lịch tick ✓ từ Google Sheet "2. Tracking TikTok".

- **Tự cập nhật 10:00 (giờ VN) mỗi ngày** bằng GitHub Actions (`.github/workflows/update.yml`).
- Cập nhật ngay: tab **Actions → Cập nhật dữ liệu TikTok → Run workflow**.
- Thêm kênh: Leader dán **link kênh TikTok** (vd. `https://www.tiktok.com/@tenkenh`) vào cột "Tên các kênh & link" trên Sheet.
- Nếu không muốn sửa Sheet: khai báo trong `scripts/handles.json`, vd. `{ "HR": "lifeofnhuhoa" }`.
- Chạy tay trên máy: `node scripts/update.mjs`
