# Hợp đồng: Launcher Linux đã cài

## Bundle

`npm run package:linux` tạo một thư mục:

```text
build/zaloview-linux-<arch>/
├── zaloview                 # Electron binary, executable
├── chrome-sandbox
├── locales/
├── resources.pak
└── resources/
    ├── app/
    │   ├── package.json     # name, productName, version, main
    │   └── dist/
    └── default_app.asar     # Nếu runtime Electron hiện có cung cấp
```

Script sao chép toàn bộ Electron distribution thay vì duy trì danh sách file thủ công; cây trên mô tả các thành phần chính cần kiểm tra, không phải whitelist để bỏ file runtime khác.

## Điều kiện bundle hợp lệ

- Tạo từ Electron version đã khóa trong workspace và ghi kiến trúc vào tên output.
- Chứa toàn bộ runtime, locales và app đã build dưới `resources/app`.
- `resources/app/package.json` trỏ `main` tới `dist/main/index.js`.
- Binary `zaloview` executable; không thêm `--no-sandbox`.
- Runtime không cần `node`, `npm`, source tree hoặc `node_modules` sau khi cài.
- Build thất bại, Electron dist thiếu hoặc output không đầy đủ phải trả exit khác 0; không công bố bundle một phần là thành công.

## Giao diện dòng lệnh

```text
<absolute-launcher> --manager
<absolute-launcher> --profile <id>
<absolute-launcher> --help
<absolute-launcher> --version
```

Desktop Entry Phase 4 chỉ dùng `--profile <id>`. Mọi argument được chuyển trực tiếp tới application; không qua shell wrapper và không phụ thuộc cwd/PATH.

## Cài đặt cấp người dùng

`docs/installation.md` phải ghi một vị trí bundle ổn định, cách copy nguyên thư mục, cách cập nhật tại cùng vị trí và cách gỡ shortcut trước khi xóa bundle. Không dùng sudo và không tự ghi vào `/usr`.

Smoke test bắt buộc chạy launcher tuyệt đối từ cwd ngoài repo, PATH tối thiểu và đường cài chứa khoảng trắng; thiếu hoặc mất executable bit phải cho lỗi có thể hành động trước khi tạo shortcut.
