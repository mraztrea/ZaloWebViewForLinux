# Hướng dẫn cho AI Agent - ZaloWebView

Tài liệu này quy định các nguyên tắc, quy trình làm việc và tiêu chuẩn kỹ thuật bắt buộc dành cho AI agents (Antigravity, Codex, Cursor, etc.) khi phát triển trong dự án **ZaloWebView**.

---

## 0. Quy định ngôn ngữ

- Toàn bộ tài liệu, đặc tả, kế hoạch, checklist và hướng dẫn trong dự án phải được viết bằng tiếng Việt.
- Luôn phản hồi và trả lời người dùng bằng tiếng Việt, trừ khi người dùng yêu cầu ngôn ngữ khác.
- Giữ nguyên tên lệnh, tên file, mã nguồn, API, định danh kỹ thuật và nội dung bắt buộc của công cụ khi không thể Việt hóa.

---

## 1. QUY TẮC BẮT BUỘC: Khởi tạo Git Branch khi tạo Spec mới (Spec-Kit)

> [!IMPORTANT]
> **MỖI KHI BẮT ĐẦU 1 SPECIFY MỚI BẰNG SPECKIT SKILL (`speckit-specify`), BẮT BUỘC PHẢI KHỞI TẠO VÀ CHUYỂN SANG 1 GIT BRANCH MỚI.** (có thể khởi tạo từ branch bất kỳ ở hiện tại)
> Tuyệt đối không tạo spec hoặc phát triển tính năng trực tiếp trên branch `master`.

### 1.1. Quy tắc đặt tên Branch
- Định dạng: `<prefix>-<short-name>`
  - `<prefix>`: Số thứ tự 3 chữ số tăng dần tiếp theo dựa trên các thư mục đã có trong `specs/` (ví dụ: đã có `001-project-init` thì nhánh tiếp theo là `002-<tên-tính-năng>`).
  - `<short-name>`: 2-4 từ ngắn gọn, dạng kebab-case mô tả tính năng (ví dụ: `002-window-state-mgmt`, `003-xpath-monitor`).
  - Tên branch phải khớp với tên thư mục feature trong `specs/`.

### 1.2. Quy trình thực hiện chuẩn (Standard Workflow)
Trước khi gọi `speckit-specify` hoặc tạo file spec:
1. **Kiểm tra trạng thái repo**: Đảm bảo working tree sạch sẽ (`git status`). Nếu có thay đổi chưa commit, cần xử lý dứt điểm trước.
2. **Đồng bộ từ nhánh gốc**:
   ```bash
   git checkout master
   git pull origin master
   ```
3. **Xác định số thứ tự tiếp theo**:
   Kiểm tra thư mục `specs/` để lấy số thứ tự lớn nhất hiện tại `+ 1` (định dạng `%03d`, ví dụ `002`).
4. **Tạo và chuyển sang branch mới**:
   ```bash
   git checkout -b <prefix>-<short-name>
   # Ví dụ: git checkout -b 002-window-state-mgmt
   ```
5. **Thực thi `speckit-specify`**:
   - Tạo thư mục tương ứng `specs/<prefix>-<short-name>/`.
   - Khởi tạo `spec.md` và cập nhật `.specify/feature.json`:
     ```json
     {
       "feature_directory": "specs/<prefix>-<short-name>"
     }
     ```
6. **Vòng đời phát triển**:
   Toàn bộ các bước tiếp theo (`speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-implement`, coding, testing) **bắt buộc** diễn ra trên feature branch này cho đến khi được review và merge vào `master`.

---

## 2. Thông tin dự án & Tech Stack

- **Dự án**: ZaloWebView (Linux Webview Manager)
- **Mục tiêu**: Trình quản lý phiên Webview độc lập chạy trên Linux, hỗ trợ nhiều website/profile với cơ chế theo dõi XPath, phát hiện thông báo và tích hợp shortcut hệ thống (KDE Plasma & GNOME).
- **Runtime**: Node.js `>= 22.0.0`, Electron `>= 44.3.0`
- **Ngôn ngữ**: TypeScript (Strict mode)
- **Công cụ build**: `esbuild` (`scripts/build.mjs`)
- **Testing**: `vitest`

---

## 3. Lệnh vận hành thường dùng (CLI Commands)

| Tác vụ | Lệnh | Ghi chú |
|---|---|---|
| Cài đặt dependencies | `npm install` | |
| Kiểm tra kiểu TypeScript | `npm run typecheck` | `tsc --noEmit` |
| Biên dịch dự án | `npm run build` | Multi-target esbuild |
| Chạy unit/integration test | `npm test` | Vitest run |
| Khởi chạy Manager Dashboard | `./bin/zaloview.js --manager` | Giao diện quản lý chính |
| Khởi chạy Runner theo Profile | `./bin/zaloview.js --profile <id>` | Runner cho profile cụ thể |

---

## 4. Tiêu chuẩn viết code & Kiến trúc

1. **Spec-Driven Development**:
   - Mọi thay đổi lớn hoặc tính năng mới phải có spec, checklist, plan và tasks trong `specs/<feature-dir>/`.
   - Không tự ý code tính năng mới khi chưa hoàn thành đặc tả và lập kế hoạch.
2. **Nguyên tắc Tối giản (YAGNI & Simplicity)**:
   - Viết giải pháp đơn giản nhất đáp ứng đầy đủ yêu cầu.
   - Ưu tiên sử dụng API có sẵn của Node.js/Electron trước khi cài đặt thêm thư viện thứ 3.
   - Không tạo abstraction, factory, wrapper trừ khi thực sự cần thiết.
3. **Chất lượng & Kiểm chứng (Verification)**:
   - Luôn chạy `npm run typecheck` và `npm test` trước khi hoàn tất bất kỳ task nào.
   - Đảm bảo mã nguồn biên dịch sạch không có lỗi kiểu (type error) hay cảnh báo nghiêm trọng.
4. **Bảo toàn tài liệu**:
   - Giữ nguyên các comment giải thích nghiệp vụ và tài liệu kỹ thuật trong thư mục `docs/`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ZaloWebViewForLinux** (1762 symbols, 3330 relationships, 89 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "master"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "master" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/ZaloWebViewForLinux/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ZaloWebViewForLinux/clusters` | All functional areas |
| `gitnexus://repo/ZaloWebViewForLinux/processes` | All execution flows |
| `gitnexus://repo/ZaloWebViewForLinux/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
