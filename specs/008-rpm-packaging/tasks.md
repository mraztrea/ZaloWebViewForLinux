# Tasks: Đóng gói RPM cho Fedora

**Đặc tả**: [spec.md](./spec.md) | **Kế hoạch**: [plan.md](./plan.md)

## Phase 1: Launcher path theo chế độ chạy

- [x] T001 [US2] Sửa `resolveLauncherPath(isPackaged)` trong `src/main/manager-handlers.ts` để trả đường thực của `process.execPath` khi packaged.
- [x] T002 [US2] Cập nhật điểm gọi `src/main/index.ts:221` truyền `app.isPackaged`.
- [x] T003 [US2] Cập nhật điểm gọi mặc định trong `ManagerService` truyền `deps.isPackaged ?? false`.

## Phase 2: Script đóng gói RPM

- [x] T004 [US1] Tạo `scripts/package-rpm.mjs` với luồng: dựng bundle → cây rpmbuild → spec → `rpmbuild -bb` → copy `.rpm`.
- [x] T005 [US1] Ánh xạ kiến trúc `x64 → x86_64`, `arm64 → aarch64`; báo lỗi rõ cho kiến trúc khác.
- [x] T006 [US1] Ghi spec với `%files` gồm bundle, symlink `/usr/bin/zaloview`, entry menu; giữ setuid cho `chrome-sandbox` bằng `chmod 4755` trong `%install`.
- [x] T007 [US1] Thêm npm script `package:rpm` vào `package.json`.

## Phase 3: Kiểm chứng

- [x] T008 [US1] Thêm test RPM vào `tests/package-linux.test.ts` (tự bỏ qua khi thiếu `rpmbuild`) kiểm tra file `.rpm`, symlink, setuid sandbox và entry menu.
- [x] T009 [US2] Chạy `npm run typecheck` và `npm test` sạch (189/189 test đạt).
- [x] T010 [US1] Chạy `npm run package:rpm`, xác nhận `rpm -qip` và `rpm -qlpv` đúng.
- [x] T011 [US2] Smoke test `zaloview --version` từ thư mục tạm trên bundle đã giải nén từ RPM.

## Phase 4: Tài liệu

- [x] T012 Bổ sung mục đóng gói RPM vào `docs/build-fedora.md`.

## Ghi chú

- `%_binary_payload w3.zstdio` hạ mức nén payload từ mặc định `w19` của Fedora: thời gian build giảm từ ~2 phút xuống ~9s, dung lượng tăng 92M → 113M.
- Không dùng `AutoReqProv` vì binary NEEDED `libffmpeg.so` (bundled) sẽ tạo Requires không thể thỏa mãn; thay bằng danh sách `Requires` hệ thống tường minh.
