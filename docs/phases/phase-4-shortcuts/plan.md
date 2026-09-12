# Kế hoạch phase 4 — Shortcut và cài launcher

> Dành cho agent triển khai sau này: dùng `superpowers:executing-plans`, thực hiện và kiểm tra từng đầu việc. Tài liệu này không cho phép sửa code trong đợt biên soạn hiện tại.

**Mục tiêu:** tạo/cập nhật/gỡ entry đúng profile và chạy được từ desktop session.

**Kiến trúc:** thêm một module desktop service ở main, tái sử dụng validation/XDG/ghi nguyên tử hiện có. Module chỉ quản lý entry; Manager chịu trách nhiệm registry và trình bày lỗi từng phần.

**Công nghệ:** Node.js `>= 22.0.0`, Electron `>= 44.3.0`, TypeScript strict, esbuild, Vitest; không thêm dependency.

**Đặc tả:** [spec.md](spec.md). **Ràng buộc toàn cục:** [quy tắc chung](../README.md). Đầu vào cần kiểm tra: runner/lock đang hoạt động, profile fixture, danh tính Linux đã đo. Không triển khai lại phase 1–3.

## P4-T1 — Chốt đường cài launcher (P4-02, P4-04)

File đã có: `bin/zaloview.js`, `package.json`, `scripts/build.mjs`, `src/main/index.ts`, `tests/fixtures/zaloview-zalo.desktop`. Tài liệu dự kiến tạo khi triển khai: `docs/installation.md`.

- [ ] Ghi một phương án cài cụ thể vào `docs/installation.md`: vị trí app/runtime/assets, launcher tuyệt đối, quyền executable, cách cập nhật/gỡ. Ưu tiên cách chạy hiện có; nếu dùng launcher Node thì phải ghi cả yêu cầu Node và đóng gói runtime cần thiết.
- [ ] Theo R01, kiểm thử launcher đã cài dưới môi trường PATH tối thiểu, cwd khác, path có khoảng trắng và runtime thiếu. Expected: mở đúng profile hoặc lỗi chỉ rõ thành phần thiếu; không buộc người dùng cuối cài devDependencies.
- [ ] Đối chiếu identity đo được với `app.setDesktopName` và entry filename; không tự thêm cờ Electron chưa được xác minh. Ghi giới hạn backend trước khi dùng StartupWMClass.

Đầu ra: `launcherPath` tuyệt đối được truyền vào service, cùng bằng chứng cách khởi chạy. Không lấy `process.execPath` dev làm launcher độc lập.

## P4-T2 — Serialize và ghi entry an toàn (P4-01, P4-03, P4-05, P4-06)

Dự kiến tạo: `src/main/desktop-service.ts`, `tests/desktop-service.test.ts`. Dùng lại `src/main/profile-validator.ts`, `src/main/xdg-paths.ts`, `src/main/atomic-writer.ts`; bổ sung type theo spec vào `src/shared/types.ts`.

- [ ] Viết ca test entry: Unicode name; từng ký tự đặc biệt trong Name/Exec/Icon; ID traversal; CR/LF/NUL; XDG tương đối; icon thiếu. So sánh trường và argv được giải mã, không chỉ gọi serializer hai lần để so với chính nó.
- [ ] Chạy `npm test -- tests/desktop-service.test.ts` để xác nhận ca bắt được phần chưa triển khai. Viết hai bước encode riêng theo ngữ cảnh Desktop Entry/Exec; CLI cuối cùng chỉ nhận `--profile` và ID.
- [ ] Theo R02, giữ mặc định `0600` của atomic writer cho callers cũ, chỉ cho service yêu cầu `0644`. Nếu thêm tham số mode, giới hạn `0o600 | 0o644` và đặt mode trên file tạm trước rename.
- [ ] Bổ sung test stat mode của registry và desktop entry, lỗi write/rename giữ bản cũ; chạy `npm test -- tests/desktop-service.test.ts tests/atomic-writer.test.ts tests/profile-storage.test.ts`.

Đầu ra: `syncProfileShortcut(profile, launcherPath)` đúng chữ ký spec, không ghi registry. Từ chối dữ liệu không hợp lệ trước filesystem.

## P4-T3 — Vòng đời entry và lỗi từng phần (P4-07, P4-08, P4-09)

File: service và test ở P4-T2. Không nối GUI trước phase 5.

- [ ] Kiểm thử bật lần đầu → bật lại → đổi tên/icon → tắt → tắt lại; ghi nhận `created/unchanged/updated/removed/unchanged` tương ứng khi nội dung không đổi.
- [ ] Implement `removeProfileShortcut(profileId)` đúng đường dẫn đã validate; test giữ entry profile khác, file ứng dụng khác và thư mục session.
- [ ] Giả lập filesystem không ghi được sau khi registry đã lưu bằng workflow fixture: service trả lỗi, profile giữ đúng dữ liệu mới; retry chỉ đồng bộ entry.
- [ ] Không gọi `update-desktop-database` nếu không cần MIME. Nếu có gọi, kiểm tra trường hợp utility thiếu và không coi thành công utility là thành công menu.
- [ ] Chạy `npm test -- tests/desktop-service.test.ts`; bàn giao trạng thái và thông báo lỗi cho handler `saveProfile`, `toggleShortcut`, `deleteProfile` ở phase 5.

## P4-T4 — Kiểm chứng desktop và bàn giao (P4-10)

- [ ] Chạy `desktop-file-validate` trên entry sinh ra trong vùng thử nếu có utility; nếu thiếu, ghi chưa kiểm tra validator.
- [ ] Cài entry fixture vào môi trường thử được chọn; mở từ menu, lặp lúc runner minimized/hidden và kiểm tra không sinh instance mới.
- [ ] Thử tìm kiếm menu, đổi tên/icon, pin/unpin trên KDE/GNOME, X11/Wayland có sẵn; ghi riêng từng môi trường và không suy từ mock/API trả thành công.
- [ ] Chạy `npm run typecheck`, `npm test`, `npm run build`; cập nhật `docs/installation.md` và bằng chứng phase 4. Chỉ bàn giao gate khi các tiêu chí trên môi trường đích có kết quả rõ.
