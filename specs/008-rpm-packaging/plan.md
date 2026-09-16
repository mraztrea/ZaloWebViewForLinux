# Kế hoạch triển khai: Đóng gói RPM cho Fedora

**Nhánh**: `008-rpm-packaging` | **Đặc tả**: [spec.md](./spec.md)

## Cách tiếp cận

Dùng `rpmbuild` có sẵn (gói `rpm-build`) với một spec tối giản, không thêm dependency npm.

Quy trình trong `scripts/package-rpm.mjs`:

1. Spawn `scripts/package-linux.mjs` để dựng bundle `build/zaloview-linux-<arch>/`.
2. Tạo cây `rpmbuild` tạm trong `build/rpmbuild/` gồm `SOURCES/`, `SPECS/`, `BUILD/`, `RPMS/`, `BUILDROOT/`.
3. Nén bundle thành `SOURCES/zaloview-<version>.tar.gz` với thư mục gốc `zaloview-<version>/`.
4. Ghi `SPECS/zaloview.spec`.
5. Chạy `rpmbuild -bb --define "_topdir build/rpmbuild" SPECS/zaloview.spec`.
6. Sao chép file `.rpm` kết quả ra `build/zaloview-<version>-1.<arch>.rpm`.
7. Dọn cây `rpmbuild` tạm.

## Bố cục cài đặt

Dùng macro `%{_libdir}`/`%{_bindir}` (`/usr/lib64` và `/usr/bin` trên Fedora x86_64).

| Đường | Nội dung |
| --- | --- |
| `%{_libdir}/zaloview/` | Toàn bộ bundle Electron |
| `%{_libdir}/zaloview/zaloview` | Binary Electron đã đổi tên (mode 0755) |
| `%{_libdir}/zaloview/chrome-sandbox` | Mode 4755 root:root |
| `%{_bindir}/zaloview` | Symlink → `%{_libdir}/zaloview/zaloview` |
| `%{_datadir}/applications/zaloview-manager.desktop` | Entry Manager (icon dự phòng `applications-internet`) |

## Thay đổi mã nguồn

`src/main/manager-handlers.ts`:

- `resolveLauncherPath()` nhận thêm tham số chế độ packaged (`isPackaged`).
- Khi packaged: trả `fs.realpathSync(process.execPath)` (fallback `process.execPath`).
- Khi dev: giữ mặc định `$HOME/.local/opt/zaloview/zaloview`.

Điểm gọi cập nhật:
- `src/main/index.ts:221` → `resolveLauncherPath(app.isPackaged)`.
- `src/main/manager-handlers.ts:261` → `resolveLauncherPath(deps.isPackaged ?? false)`.

## Kiểm chứng

- `npm run typecheck`, `npm test`.
- `npm run package:rpm` → `rpm -qip`, `rpm -qlp` file kết quả.
- Smoke test `--version` trên bundle packaged.

## Rủi ro

- `rpmbuild` không có trên hệ không phải Fedora/RHEL → script báo lỗi rõ, hướng dẫn cài `rpm-build`.
- Nén bundle ~283M tốn thời gian/thêm dung lượng đĩa tạm.
- Thay đổi `resolveLauncherPath` ảnh hưởng luồng đồng bộ shortcut; giảm thiểu bằng fallback về hành vi cũ khi dev.
