# Nghiên cứu Phase 0: Manager Phase 5

**Ngày**: 2026-09-13 | **Nhánh**: `007-phase5-manager` | **Đặc tả**: [spec.md](spec.md)

Mọi mục NEEDS CLARIFICATION trong Technical Context đã được giải quyết bằng khảo sát mã nguồn hiện có. Không còn câu hỏi mở.

## Quyết định 1: Preload riêng cho Manager, không trộn vào preload runner

- **Decision**: Tạo `src/preload/manager-preload.ts` expose từng API Manager qua `window.zaloview`; `createManagerWindow` trong `src/main/index.ts` (hiện đang dùng `webview-preload.js`) chuyển sang preload riêng; thêm bundle tương ứng trong `scripts/build.mjs`.
- **Rationale**: `webview-preload.ts` phục vụ trang website bên ngoài trong runner — trộn bridge quản lý (đọc/ghi registry, xóa session) vào đó sẽ mở rộng bề mặt tấn công sang website. Preload riêng + validation sender/main frame/URL local đáp ứng P5-01.
- **Alternatives considered**: Dùng chung một preload với cờ phân vai — loại vì website vẫn thấy mặt API; dùng generic `invoke(channel, ...)` — loại vì spec cấm expose cơ chế gọi chung.

## Quyết định 2: Handler tập trung trong manager-handlers.ts, tái sử dụng service hiện có

- **Decision**: Mọi API Manager đi qua `src/main/manager-handlers.ts`, gọi `ProfileManager`, `RunnerControlClient` (socket), `syncProfileShortcut`/`removeProfileShortcut` (`desktop-service.ts`); `index.ts` chỉ đăng ký handler và quản lý vòng đời cửa sổ.
- **Rationale**: Logic CRUD/validation/shortcut/socket đã tồn tại và có test; handlers chỉ là lớp điều phối mỏng: validate → gọi service → chuẩn hóa lỗi từng phần. Tránh trùng lặp và giữ YAGNI.
- **Alternatives considered**: Viết CRUD riêng trong handlers — loại vì tạo bộ type/logic profile song song, trái ràng buộc phase 5.

## Quyết định 3: Trạng thái runner unknown và restartRequired từ configRevision

- **Decision**: `getRunnerStatus` trả `running/stopped/unknown`; lỗi socket → `unknown`, không suy là `stopped`. `restartRequired` so `configRevision` (runner báo, bằng `updatedAt` lúc runner khởi động — đã có trong `RunnerStatusData`) với `updatedAt` hiện tại của profile; không lấy được revision → chưa xác định. Nền R03 (status `starting/running/error` + `did-fail-load`) đã có trong `index.ts`.
- **Rationale**: Đúng P5-02/P5-04 và spec phase 5: "lỗi socket là unknown khi chưa chứng minh stopped", "không suy chỉ từ runner có tồn tại".
- **Alternatives considered**: Ping tiến trình qua PID — loại vì PID tái sử dụng sau crash cho kết luận sai; coi ACK shutdown là đã dừng — spec cấm (P5-07), phải xác nhận dừng thật.

## Quyết định 4: Xóa profile giữ session; chặn ID còn session; xóa session riêng

- **Decision**: Thứ tự `deleteProfile`: xác nhận dừng → gỡ shortcut → xóa registry; giữ thư mục session. `ProfileDataExistsError` (đã có trong `profile-manager.ts`, nền R04) chặn tạo mới với ID còn session. `deleteProfileSession` là API riêng: xác nhận native do main quản lý (không nhận boolean renderer gửi), validate runner dừng + đường dẫn thuộc app.
- **Rationale**: Đáp ứng P5-07/P5-08; cơ chế R04 đã có sẵn chỉ cần nối vào handler.
- **Alternatives considered**: Xóa session cùng lúc xóa profile — loại vì rủi ro mất phiên đăng nhập khó khôi phục, trái spec.

## Quyết định 5: Thử XPath qua socket hiện có, cleanup và validation đã có sẵn

- **Decision**: `testXPath` chuyển `test-xpath` qua socket tới đúng runner (theo profileId), validate response trước khi đưa lên UI, bỏ kết quả document cũ sau navigation. Nền R05 (AbortSignal timeout, dọn map/timer/listener) và R06 (type guard payload, đối chiếu request/mode/selector, giới hạn kích thước) đã có trong `runner-control.ts`/`index.ts`/`xpath-ipc.ts`.
- **Rationale**: P5-06 yêu cầu đúng hành vi này; không cần engine mới, chỉ nối Manager → socket → UI với phân loại lỗi vòng đời/kết nối.
- **Alternatives considered**: Đánh giá XPath trực tiếp từ Manager — loại vì sai document/process, vi phạm sandbox.

## Quyết định 6: Icon-fetcher mới với trần an toàn, dùng fetch/AbortController của Node

- **Decision**: Tạo `src/main/icon-fetcher.ts` dùng `fetch` + `AbortController` hiện có: chỉ HTTP(S), validate từng redirect (tối đa 5), timeout tổng 5000 ms, đếm byte thực khi stream (trần 2 MiB), decode + kiểm tra 1024×1024 + chuẩn hóa PNG bằng công cụ Electron hiện có; không gửi cookie/Authorization; thất bại → fallback PNG kèm lý do. Dialog chọn file đi qua cùng kiểm tra ảnh.
- **Rationale**: Đáp ứng P5-09 với API có sẵn, không thêm dependency (đúng nguyên tắc YAGNI trong AGENTS.md).
- **Alternatives considered**: Thư viện tải/parse ảnh bên thứ ba — loại vì không cần thiết khi Electron/Node đã đủ.

## Quyết định 7: Renderer thuần hiện có, render an toàn không innerHTML

- **Decision**: Hoàn thiện `src/renderer/manager/app.ts` + `index.html` + `styles.css` hiện có bằng HTML/CSS thuần: `textContent` cho mọi dữ liệu profile, poll status có dừng khi ẩn/đóng, keyboard đầy đủ, theme hệ thống + chọn tay.
- **Rationale**: P5-02/P5-10; tránh framework mới cho một dashboard local đơn giản.
- **Alternatives considered**: Thêm framework UI — loại vì quá mức cần thiết, tăng bundle và bề mặt CSP.

## Quyết định 8: Kiểm chứng theo tầng

- **Decision**: Vitest cho handler/validation/icon/socket (`tests/manager.test.ts`, `tests/icon-fetcher.test.ts`, mở rộng các suite hiện có); smoke Electron thật cho preload/sandbox/launcher; `tests/integration.test.ts` cho chuỗi lỗi logic; `docs/verification.md` cho ma trận desktop thực (P5-11/P5-12).
- **Rationale**: Unit test không chứng minh được sandbox/preload/tray/desktop — spec cấm thay kết quả desktop bằng số lượng unit test.
- **Alternatives considered**: Chỉ dùng unit test — loại vì không bao phủ P5-11/P5-12.
