# Data Model: Desktop Attention, Notification và Tray

All feature state is scoped to one runner/profile. Only profile preferences and window state are persisted; attention state is recreated on every runner start.

## ObservedState

Existing Phase 2 input representing the latest validated DOM observation.

| Field | Type | Rules |
| --- | --- | --- |
| `mode` | `badge_count \| text_content \| existence` | Must equal the active profile XPath mode. |
| `hasElement` | boolean | Describes whether the configured XPath returned a node. |
| `count` | non-negative safe integer | Meaningful for `badge_count`; zero clears attention. |
| `text` | string | Trimmed/capped IPC preview; empty clears `text_content` attention. |
| `changedForAlert` | boolean | Computed by Phase 2; never trusted without validating the rest of the payload. |
| `timestamp` | number | Diagnostic only; not used as the cooldown clock. |

## AttentionState

Ephemeral main-process state owned by one runner.

| Field | Type | Initial value | Rules |
| --- | --- | --- | --- |
| `active` | boolean | `false` | True only after a valid background change; false after focus, clear, empty state or quit. |
| `displayCount` | non-negative integer | `0` | `badge_count` uses current count; other modes use an indicator value without claiming message count. |
| `latestState` | ObservedState or null | `null` | Replaced by every valid update, including decreases and empty states. |
| `lastPopupAt` | monotonic timestamp or null | `null` | Records the last popup attempt accepted for display. |
| `pendingPopup` | ObservedState or null | `null` | Only the newest eligible event is retained during cooldown. |
| `popupTimerActive` | boolean | `false` | At most one timer per runner. |
| `focused` | boolean | Current window focus | Re-checked before any popup. |
| `disposed` | boolean | `false` | Once true, later callbacks produce no effects. |

## DesktopIntegrationPreferences

Existing persisted profile configuration.

| Field | Type | Default | Phase 3 behavior |
| --- | --- | --- | --- |
| `flashTaskbar` | boolean | `true` | Enables/stops window attention requests. |
| `showTaskbarBadge` | boolean | `true` | Enables badge updates; false/unsupported clears the badge. |
| `minimizeToTray` | boolean | `false` | Allows close-to-hide only when tray setup succeeded. |
| `showDesktopNotification` | boolean | `true` | Enables coalesced native popup and duplicate-source permission policy. |
| `createDesktopShortcut` | boolean | Existing default | Ignored in Phase 3; implemented in Phase 4. |

## TrayState

Ephemeral resource state for one runner.

| Field | Type | Rules |
| --- | --- | --- |
| `availability` | `ready \| unavailable \| disposed` | `ready` only after valid images load and tray construction succeeds. |
| `unread` | boolean | Mirrors `AttentionState.active`. |
| `tooltip` | string | Count for `badge_count`; “Có thông báo mới” for other active modes; profile name when idle. |
| `iconKind` | `normal \| unread` | Must resolve to visibly different non-empty assets. |

## DesktopCapabilityResult

Manual validation evidence; recorded in the quickstart matrix rather than persisted in runtime profile data.

| Field | Type | Rules |
| --- | --- | --- |
| `environment` | string | Desktop, display protocol and relevant version. |
| `notificationService` | string | Service/name or unavailable. |
| `trayExtension` | string | Host/extension or unavailable. |
| `doNotDisturb` | boolean | Recorded because it can suppress popup visibility. |
| `feature` | `flash \| badge \| tray \| popup \| restore` | One observation per tested surface. |
| `result` | `pass \| limited \| unavailable` | Must be based on visible behavior. |
| `evidence` | string | Short observed result/fallback; no prediction. |

## Relationships

- One `Profile` has one `DesktopIntegrationPreferences` and at most one running `AttentionState`/`TrayState` pair.
- `ObservedState` updates the matching profile’s `AttentionState`; it cannot name or mutate another profile.
- `AttentionState` drives flash, badge, tray and popup effects.
- `DesktopCapabilityResult` describes an environment test, not runtime truth or profile configuration.

## State Transitions

| Current condition | Event | Next attention state | Effects |
| --- | --- | --- | --- |
| Background, inactive | Valid `changedForAlert=true` | Active | Flash/badge/tray immediately; popup now or latest pending. |
| Background, active | Count decreases above zero | Active with lower count | Update badge/tray; no popup. |
| Any active state | Count 0, missing node or empty text | Inactive | Stop flash, clear badge/unread and cancel popup. |
| Any state | Window focus or explicit clear | Inactive | Clear all desktop attention; retain DOM baseline/latest observation. |
| Focused | Any valid observation | Inactive | Update baseline/latest observation only. |
| Cleared then blurred | Same observation repeats | Inactive | No effect. |
| Cleared then blurred | Later valid new change | Active | Start normal attention flow. |
| Any state | Quit/dispose | Disposed | Cancel timers/popup and release tray/desktop resources. |

## Validation Invariants

- A renderer-supplied profile ID or timestamp never selects the target runner or controls cooldown.
- `displayCount` never uses truthiness fallback; count `0` remains zero and clears attention.
- At most one pending popup and one cooldown timer exist per runner.
- `disposed=true` is terminal.
- Close-to-tray is allowed only when preferences enable it and `TrayState.availability=ready`.
