//div[contains(concat(' ', normalize-space(@class), ' '), ' leftbar-unread-badge ')]



Xong. Bundle Fedora (x64) đã tạo và smoke-test đạt.
- Đường dẫn: build/zaloview-linux-x64/ (~283M, tự chứa Electron runtime, không cần Node/npm)
- Kiểm chứng: typecheck sạch, 186/186 test đạt, zaloview --version → zaloview v0.1.0
Cài cấp người dùng:
mkdir -p "$HOME/.local/opt"
cp -a build/zaloview-linux-x64 "$HOME/.local/opt/zaloview"
chmod 755 "$HOME/.local/opt/zaloview/zaloview"
"$HOME/.local/opt/zaloview/zaloview" --manager
