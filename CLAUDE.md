
# Claude Instructions - ZaloWebView

Hướng dẫn và quy tắc bắt buộc dành cho Claude Code khi làm việc trong dự án **ZaloWebView**.

---

## 1. QUY TẮC BẮT BUỘC: Khởi tạo Git Branch khi tạo Spec mới (Spec-Kit)

> [!IMPORTANT]
> **MỖI KHI BẮT ĐẦU 1 SPECIFY MỚI BẰNG SPECKIT SKILL (`speckit-specify`), BẮT BUỘC PHẢI KHỞI TẠO VÀ CHUYỂN SANG 1 GIT BRANCH MỚI.**
> Tuyệt đối không tạo spec hoặc phát triển tính năng trực tiếp trên branch `master`.

### Quy trình bắt buộc (Step-by-Step):
1. **Kiểm tra trạng thái repo**:
   ```bash
   git status
   ```
   Đảm bảo working directory sạch sẽ trước khi tạo nhánh mới.
2. **Checkout về `master` và cập nhật**:
   ```bash
   git checkout master
   git pull origin master
   ```
3. **Xác định tên branch mới**:
   - Định dạng: `<prefix>-<short-name>`
   - `<prefix>`: Số thứ tự 3 chữ số tiếp theo (ví dụ: `002`, tiếp theo `001-project-init`).
   - `<short-name>`: 2-4 từ ngắn gọn mô tả tính năng bằng tiếng Anh kebab-case (ví dụ: `002-window-state-mgmt`).
4. **Tạo và chuyển sang branch mới**:
   ```bash
   git checkout -b <prefix>-<short-name>
   ```
5. **Khởi tạo spec qua `speckit-specify`**:
   - Tạo thư mục tương ứng `specs/<prefix>-<short-name>/`.
   - Cập nhật file `.specify/feature.json` với `"feature_directory": "specs/<prefix>-<short-name>"`.
6. **Thực thi trên branch**:
   - Toàn bộ các giai đoạn kế tiếp (`speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-implement`, commit mã nguồn, chạy test) phải thực hiện trên branch feature này.

---

## 2. Tổng quan dự án & Tech Stack

- **Mục đích**: Linux Webview Manager cho các website/profile độc lập (Zalo, v.v.), tích hợp XPath watcher, desktop notifications và system shortcuts (Wayland/X11).
- **Runtime**: Node.js `>= 22.0.0`, Electron `>= 44.3.0`
- **Ngôn ngữ**: TypeScript
- **Bundler**: esbuild (`scripts/build.mjs`)
- **Test Runner**: Vitest

---

## 3. Các lệnh thường dùng

```bash
# Cài đặt dependencies
npm install

# Kiểm tra kiểu (TypeScript)
npm run typecheck

# Biên dịch ứng dụng
npm run build

# Chạy test suite
npm test

# Chạy Manager Dashboard
./bin/zaloview.js --manager

# Chạy Profile Runner
./bin/zaloview.js --profile <profile_id>
```

---

## 4. Hướng dẫn phát triển & Code Style

- **Spec-Kit Workflow**: Tuân thủ nghiêm ngặt quy trình `speckit-specify` -> `speckit-clarify` -> `speckit-plan` -> `speckit-tasks` -> `speckit-implement`.
- **YAGNI & Tối giản**: Không viết code đón đầu, không tạo abstraction thừa. Sử dụng API gốc của platform/Node.js thay vì thêm dependencies mới.
- **Xác thực trước khi hoàn thành**: Luôn chạy `npm run typecheck` và `npm test` để xác minh mọi thay đổi trước khi kết thúc tác vụ.
- **Tài liệu**: Duy trì và bảo toàn các tài liệu hiện có trong `docs/` và comment giải thích kiến trúc.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ZaloWebViewForLinux** (1242 symbols, 2078 relationships, 34 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
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
