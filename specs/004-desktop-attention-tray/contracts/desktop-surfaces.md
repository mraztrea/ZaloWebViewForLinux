# Contract: Desktop Surfaces and User Actions

## Tray Presentation

- Idle tray uses `assets/default-icon.png` or a valid decoded profile icon.
- Active attention uses `assets/unread-icon.png`; it MUST be visually distinct from the idle icon.
- An empty/invalid image falls back to the packaged default rather than constructing a broken tray.
- Tray availability means construction succeeded; it does not assert that the desktop shell visibly rendered the icon.

## Tray Menu

| Label | Required behavior |
| --- | --- |
| Mở cửa sổ | Restore if minimized, show if hidden, then request focus for this runner. |
| Xóa cảnh báo | Dispatch idempotent clear for this runner only. |
| Mở Manager | Launch or restore the independent Manager instance through the existing safe launcher semantics. |
| Thoát profile | Invoke the shared runner quit flow; never degrade to hide-to-tray. |

## Popup

- Popup title identifies the profile.
- Body uses the latest safe state: current count for `badge_count`, generic new-activity text for `existence`, and bounded preview for `text_content`.
- Clicking the popup restores/shows/focuses the matching runner.
- Unsupported or failed popup display is non-fatal; badge/tray/CLI fallback remains available.

## Close and Restore

- `minimizeToTray=false`: window close follows normal quit behavior.
- `minimizeToTray=true` and tray ready: ordinary window close may be prevented and the window hidden after saving normal bounds.
- `minimizeToTray=true` and tray unavailable: do not hide the window; retain CLI/Manager restore guidance.
- Reopening the same profile through CLI always targets the existing runner and restores/shows/focuses its window.

## Capability Evidence

Manual acceptance MUST record desktop/session, notification service, tray/dock extension, do-not-disturb state, API result where available, visible result, and fallback. API success alone is not a pass.
