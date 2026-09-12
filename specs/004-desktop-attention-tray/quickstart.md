# Quickstart: Validate Desktop Attention, Notification và Tray

## Prerequisites

- Node.js 22+ and project dependencies installed.
- Linux desktop session with its notification service running.
- For tray testing, record the tray host/extension (GNOME may require one).
- For badge testing, install the Phase 3 `zaloview-zalo.desktop` fixture with a desktop name matching the runner identity. This fixture is validation-only; shortcut generation remains Phase 4.
- Use temporary XDG directories so manual tests do not overwrite real profiles.

## 1. Automated Verification

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0. Unit coverage proves transition/coalescing behavior; it does not prove that a desktop shell visibly renders flash, badge, tray or popup.

Verification recorded 2026-09-12: `npm run typecheck` exited 0; `npm test` exited 0 (14 files, 102 tests); `npm run build` exited 0 and copied both icon assets.

## 2. Start an Isolated Runner

```bash
export XDG_CONFIG_HOME="$(mktemp -d)"
export XDG_DATA_HOME="$(mktemp -d)"
export XDG_RUNTIME_DIR="$(mktemp -d)"
npm start -- --profile zalo
```

Expected: the `zalo` fixture runner opens with its own profile data. Keep the three temporary paths for the remainder of the session and delete them manually after testing.

## 3. Verify Background Attention

1. Configure a valid XPath and mode for the current page/profile.
2. Move focus to another application.
3. Cause a new meaningful observation.
4. Observe flash/urgency, badge, tray icon/tooltip and popup separately.

Expected:

- enabled badge/tray state updates immediately;
- popup appears only when supported and not suppressed by desktop policy;
- profile identity is correct;
- an API success without visible output is recorded as limited/unavailable, not pass.

## 4. Verify Cooldown and Current-State Content

Cause several eligible changes inside 2 seconds, including a count decrease before the pending popup fires.

Expected: no more than one popup is emitted in the cooldown window; badge/tray update on each state; any delayed popup uses the newest current value. Focus the runner or set state to zero/empty during cooldown and verify no delayed popup appears.

## 5. Verify Baseline Preservation

Run the `badge_count` sequence:

```text
5 → focus runner → blur runner → 5 → 6
```

Expected: focus clears attention at 5; the repeated 5 remains silent after blur; 6 creates one new attention. Also verify that an increase while focused updates baseline without alerting and blur does not replay it.

## 6. Verify Runner Control

Using the current profile socket, send the contract request from [contracts/runner-control.md](contracts/runner-control.md):

```json
{"requestId":"clear-001","action":"clear-attention"}
```

Expected: status reports attention inactive, desktop indicators clear for this profile only, and repeating the command remains safe. Send `shutdown` with `minimizeToTray=true`; the runner must exit rather than hide.

## 7. Verify Tray and Recovery

With `minimizeToTray=true` and a working tray:

1. Close the runner window and confirm it hides.
2. Use “Mở cửa sổ” and confirm restore → show → focus.
3. Use “Xóa cảnh báo” and confirm only this profile clears.
4. Use “Mở Manager” and confirm the Manager is independent.
5. Use “Thoát profile” and confirm the runner exits and leaves no tray icon or delayed popup.

Without a usable tray, repeat close/reopen using:

```bash
./bin/zaloview.js --profile zalo
```

Expected: the existing runner window remains recoverable. The application must not hide it solely because `minimizeToTray` is true when tray setup failed.

## 8. Record Desktop Evidence

Fill one row per tested environment and feature:

| Environment | Notification service / DND | Tray host or extension | Flash/focus | Badge | Tray | Popup | CLI restore | Evidence/limits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KDE Plasma / X11 | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | |
| KDE Plasma / Wayland | `notify-send` present; visibility not verified | Tray host not verified | Unavailable: Electron could not connect to `wayland-0` in the execution environment | Unavailable | Unavailable | Unavailable | Not tested | `XDG_CURRENT_DESKTOP=KDE`, `KDE_FULL_SESSION=true`; runner launch exited before window creation with “Failed to connect to Wayland display”. |
| GNOME / X11, if available | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | |
| GNOME / Wayland | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | |

Replace “Not tested” only with observed evidence. See [data-model.md](data-model.md) for result semantics and [contracts/desktop-surfaces.md](contracts/desktop-surfaces.md) for expected behavior.
