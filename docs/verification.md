# Báo cáo nghiệm thu (kết quả thực)

Tài liệu này chỉ ghi kết quả quan sát thực tế. Môi trường không truy cập được giữ nguyên "Chưa kiểm thử".

## Đợt review và sửa Phase 5 — 2026-09-15

- Mã nguồn: `6938513` cùng các sửa tiếp theo trong working tree của nhánh `007-phase5-manager`; phạm vi review từ `844cbbc`.
- Môi trường: Linux headless, Node `v22.23.1`, Electron `44.3.0`, Vitest `3.2.7`, Chrome `153.0.8010.36`. Không có DISPLAY, Wayland hoặc Xvfb.
- `npm ci` đã chạy thành công khi bắt đầu review ngày 2026-09-14.
- `npm run typecheck`, `npm run build`, `npm test` chạy lại ngày 2026-09-15 đều đạt: **22 tệp, 181 test, không bỏ qua test**.

| Phạm vi | Bằng chứng quan sát |
|---|---|
| IPC, lưu profile, revision | `manager-regressions.test.ts`: từ chối URL local giả mạo, ID/config sai kiểu, field lạ; giữ revision tăng khi lưu cùng mili giây |
| Launch/xóa/session | Lỗi spawn thật (`ENOENT`), không xóa khi đang khởi động, chặn mở/sửa đồng thời lúc xóa, xử lý shutdown bị từ chối; kiểm tra lại sau dialog và chặn symlink thoát vùng |
| Icon | Deadline chung cho body/redirect; trần byte của file local; đường icon thuộc app; tìm icon tương đối từ HTML sau redirect; icon đã mất dùng fallback kèm cảnh báo và không chặn lưu |
| Renderer trong Chrome thật | `manager-renderer.test.ts`: retry không trùng ID, giữ bản nháp khi lưu lỗi hoặc save cũ hoàn tất, tên HTML hiển thị nguyên văn, poll hiển thị/ẩn, clear cảnh báo, revision trên card, icon local/fallback kèm lý do, bỏ phản hồi reload/icon/XPath cũ, chọn theme |
| Tích hợp service/socket | Hai `RunnerControlServer` và hai `AttentionController` thật: clear/focus A giữ nguyên cảnh báo B; CRUD, thử XPath, lưu shortcut, xóa giữ session và fault JSON/socket |
| Build/phân phối | Các test kiểm tra bundle/assets, bridge và cấu trúc gói đã đạt; chưa chạy GUI từ bản cài |

Các ca hồi quy mới đã được chạy thất bại trên code cũ trước khi sửa. Test renderer dùng Chrome headless và bridge IPC giả lập; không thay thế kiểm thử preload Electron, Zalo thật hoặc tích hợp desktop. Có thể chọn trình duyệt qua `CHROME_BIN`; test này ghi **skipped** nếu máy không có trình duyệt tương ứng.

Hiệu chỉnh bằng chứng cũ: kiểm tra chuỗi trong bundle không chứng minh sandbox hoạt động; log process khởi động không chứng minh thao tác GUI; các test `manager.test.ts` cũ không chạy DOM và không tự chứng minh form giữ dữ liệu. Báo cáo ngày 2026-09-13 bên dưới được giữ làm lịch sử. Nghiệm thu desktop và GUI bản phân phối vẫn **Chưa kiểm thử**; các mục liên quan trong `tasks.md` được mở lại.

Chi tiết phát hiện và bản sửa: [review Phase 5](../specs/007-phase5-manager/review.md).

## Đợt phase 5 — Manager (nhánh `007-phase5-manager`)

- **Commit**: `02072c4` + thay đổi chưa commit trên nhánh (xem `git status`)
- **Phiên bản**: Electron v44.3.0, Node v24.20.0, Vitest v3.2.7
- **Ngày chạy**: 2026-09-13

### Lệnh đã chạy và kết quả

| Lệnh | Kết quả |
|---|---|
| `npm ci` (lockfile, checkout nhánh) | PASS — cài sạch thành công |
| `npm run typecheck` | PASS — không lỗi kiểu |
| `npm run build` | PASS — đủ bundle `main/index.js`, `preload/webview-preload.js`, `preload/manager-preload.js`, `renderer/manager/*`, `assets/*` |
| `npm test` (full suite) | PASS — 20 file, 166 test (4 lần chạy: 1 lần fail đơn lẻ sau `npm ci` không tái hiện, 3 lần tiếp theo 166/166) |
| Graph change analysis (`detect_changes --scope all`) | PASS — risk medium do file-touch, không đứt process liên quan; 4 process tray intra-community bị chạm gián tiếp qua file `index.ts` (không đổi logic) |
| Smoke Electron `electron dist/main/index.js --manager` (25s) | PASS — log `[ZaloWebView] Khởi chạy Manager Dashboard`, process sống, không crash |
| Kiểm tra bundle preload | PASS — đủ 11 kênh `zaloview:*`; preload website không chứa kênh Manager; main bundle trỏ `manager-preload.js` |

Ghi chú flaky: lần chạy full suite đầu tiên sau `npm ci` có 1 test fail; 3 lần chạy tiếp theo (gồm 1 lần full suite và các suite `manager`/`integration`/`icon-fetcher`/`runner-control*` riêng) đều 166/166. Chưa xác định được test gây fail đơn lẻ; cần theo dõi khi chạy CI.

### Bao phủ theo mã P5

| Mã | Bằng chứng |
|---|---|
| P5-01 | `tests/manager.test.ts` (sender website/iframe/URL sai, null/array bị từ chối, service không được gọi) + `tests/build.test.ts` (bridge hẹp, sandbox) |
| P5-02 | `tests/manager.test.ts` (stopped/unknown/running) + `tests/integration.test.ts` (chuỗi multi-profile) |
| P5-03 | `tests/manager.test.ts` (ID/createdAt/userAgent bất biến, false giữ false, form giữ khi lỗi) |
| P5-04 | `tests/manager.test.ts` (partial failure + retry không trùng, cần mở lại từ revision) |
| P5-05 | `tests/manager.test.ts` + `tests/integration.test.ts` (argument array, spawn lỗi rõ); vòng đời Manager/runner độc lập: smoke khởi động, mở lặp restore dùng single-instance lock hiện có |
| P5-06 | `tests/manager.test.ts` (phân loại + bỏ kết quả cũ + không đổi config) |
| P5-07 | `tests/manager.test.ts` (unknown/timeout/PID còn sống/entry lỗi/registry lỗi đều giữ dữ liệu) + `tests/integration.test.ts` (xóa giữ session) |
| P5-08 | `tests/manager.test.ts` (hủy không đổi, đúng mục tiêu, chặn runner chạy/ID sai) |
| P5-09 | `tests/icon-fetcher.test.ts` (9 ca: protocol/redirect/size/timeout/mạng) + `tests/manager.test.ts` (fallback, lưu vùng app) |
| P5-10 | `tests/build.test.ts` (CSP, sandbox); keyboard/label/Escape/focus/theme: kiểm tra code, chưa có test tự động |
| P5-11 | `tests/integration.test.ts` (chuỗi A/B + fault JSON/socket); thao tác GUI thủ công: Chưa kiểm thử |
| P5-12 | Bản dev: PASS theo bảng trên. Bản phân phối (`package:linux` + đường cài): Chưa kiểm thử |

### Ma trận desktop

| Môi trường | Web/session/quyền | XPath/alert/focus | Badge/tray | Menu/pin | Trạng thái |
|---|---|---|---|---|---|
| KDE Plasma / X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |
| KDE Plasma / Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |
| GNOME / X11 nếu có | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |
| GNOME / Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |

Môi trường chạy lệnh trên là container/headless (không có Xvfb, không tương tác GUI), nên mọi ô desktop giữ "Chưa kiểm thử" theo đúng quy định của spec phase 5.
