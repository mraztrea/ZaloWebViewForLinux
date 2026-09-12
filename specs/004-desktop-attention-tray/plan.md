# Implementation Plan: Desktop Attention, Notification và Tray

**Branch**: `004-desktop-attention-tray` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-desktop-attention-tray/spec.md`

## Summary

Phase 3 connects the validated `xpath:state` stream from Phase 2 to a profile-local attention controller in the runner main process. The controller updates flash, badge and tray immediately, coalesces native popups behind a 2-second cooldown, and clears transient attention on focus, explicit clear, zero/empty state or quit without resetting the DOM baseline. Existing runner/window/socket lifecycles are extended so close-to-tray is opt-in and safe, every quit path uses the same cleanup flow, and desktop limitations are reported from observed behavior rather than inferred from successful API calls.

## Technical Context

**Language/Version**: TypeScript 5.8 strict mode targeting ES2022; Node.js 22+

**Primary Dependencies**: Electron 44.3; Node.js standard library; no new runtime dependency

**Storage**: Existing JSON profile registry and per-profile window-state files; attention and popup cooldown remain ephemeral

**Testing**: Vitest 3 unit/integration tests, TypeScript typecheck, esbuild build, and manual Linux desktop validation

**Target Platform**: Linux desktop; KDE Plasma and GNOME on available X11/Wayland sessions

**Project Type**: Electron desktop application with one Manager process and one runner process per profile

**Performance Goals**: Apply flash/badge/tray changes in the same main-process event turn; allow at most one popup per runner in any 2-second cooldown window; no duplicate timers or listeners after reload/quit

**Constraints**: Profile isolation; untrusted renderer payload validation; offline-capable desktop handling; `minimizeToTray` defaults off; no assumption that desktop API success means visible UI; no DBus notification dependency

**Scale/Scope**: One attention controller and tray per active runner; multiple concurrent independent profiles; Phase 3 only, excluding shortcut generation and Manager dashboard work

## Constitution Check

*GATE: Passed before Phase 0 and passed again after Phase 1 design.*

- **Spec-driven workflow**: PASS — validated `spec.md` exists; this command creates only Phase 0/1 planning artifacts.
- **Simplicity/YAGNI**: PASS — reuse Electron and Node APIs already available; add no package and no speculative cross-profile coordinator.
- **Strict typing and security**: PASS — keep main-frame/origin checks and add structural validation before attention effects.
- **Verification**: PASS — plan requires `npm run typecheck`, `npm test`, `npm run build`, plus observable desktop checks.
- **Documentation preservation**: PASS — existing `docs/` files remain unchanged; feature artifacts live under this spec directory.
- **Post-design re-check**: PASS — the data model and three narrow contracts introduce no gate violation or unresolved clarification.

## Project Structure

### Documentation (this feature)

```text
specs/004-desktop-attention-tray/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── attention-events.md
│   ├── desktop-surfaces.md
│   └── runner-control.md
└── tasks.md                 # Created later by speckit-tasks
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── index.ts             # Wire validated XPath events, focus, quit and Manager launch
│   ├── notifier.ts          # Profile-local attention state and popup cooldown
│   ├── tray-manager.ts      # Tray icon, tooltip, menu and availability
│   ├── runner-control.ts    # Add clear-attention and expose attention status
│   ├── window-service.ts    # Reuse restore/show/focus and window-state persistence
│   └── permission-manager.ts# Coordinate website notification permission
└── shared/
    └── types.ts             # Attention state and socket contract types

assets/
├── default-icon.png
└── unread-icon.png

tests/
├── notifier.test.ts
├── runner-control.test.ts
├── window-state.test.ts
└── fixtures/
    └── zaloview-zalo.desktop
```

**Structure Decision**: Keep the existing single-project layout. `notifier.ts` owns the only non-trivial state/timer logic, while `tray-manager.ts` owns the Electron tray resource and menu callbacks. `index.ts` remains the composition root; existing window, permission and socket modules are extended at their current boundaries rather than wrapped.

## Complexity Tracking

No constitution violations require justification.
