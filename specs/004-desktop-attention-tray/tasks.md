# Tasks: Desktop Attention, Notification và Tray

**Input**: Design documents from `/specs/004-desktop-attention-tray/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the feature acceptance scenarios and project verification rules. Write each story’s tests first and confirm they fail for the missing behavior before implementation.

**Organization**: Tasks are grouped by user story so each story has an explicit independent test and can be validated at its checkpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on an incomplete task in the same phase.
- **[Story]**: Maps the task to a user story in `spec.md`.
- Every task names its exact target path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add only the packaged desktop fixtures required by later stories.

- [X] T001 [P] Add a valid `assets/unread-icon.png` that is visibly distinct from `assets/default-icon.png` and remains non-empty when loaded as a native image.
- [X] T002 [P] Add the validation-only desktop entry `tests/fixtures/zaloview-zalo.desktop` whose filename/identity matches `zaloview-zalo`; do not implement Phase 4 shortcut generation.

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Define the shared profile-local attention and runner-control types used by every story.

**⚠️ CRITICAL**: Complete this phase before any user story implementation.

- [X] T003 Extend `src/shared/types.ts` with attention/status/control types that enforce `mode` as `badge_count | text_content | existence`, `count` as a non-negative safe integer, `active` as required when an attention block exists, and non-count modes as count `0` or omitted.

**Checkpoint**: Shared contracts compile without changing Phase 2 baseline behavior.

---

## Phase 3: User Story 1 - Nhận biết hoạt động mới khi runner ở nền (Priority: P1) 🎯 MVP

**Goal**: Turn a validated background XPath change into profile-local flash, badge, tray state and a coalesced popup.

**Independent Test**: Create two controllers, send a new event only to profile A, and verify only A updates; multiple events inside 2 seconds produce immediate badge/tray changes and at most one popup containing the latest state.

### Tests for User Story 1

> Write these tests first and confirm they fail for the missing Phase 3 behavior.

- [X] T004 [P] [US1] Add failing tests for initial background alert, count decrease, zero/empty clearing, profile isolation, one pending timer, latest-event coalescing, monotonic 2000 ms cooldown, and Zalo `div.leftbar-unread-badge` existence matching in `tests/notifier.test.ts` and `tests/xpath-evaluator.test.ts`.
- [X] T005 [P] [US1] Add failing tests proving website notification permission is denied only when XPath desktop popup is enabled and existing user choice is preserved when disabled in `tests/permissions.test.ts`.

### Implementation for User Story 1

- [X] T006 [US1] Implement the profile-local attention controller in `src/main/notifier.ts`, keeping `active=false`, `displayCount=0`, `latestState=null`, `lastPopupAt=null`, `pendingPopup=null`, at most one timer, and terminal `disposed=true` invariants from `data-model.md`.
- [X] T007 [US1] Validate `xpath:state` primitive/range fields after the existing main-frame/origin checks, seed the Zalo profile with the XPath equivalent of CSS `div.leftbar-unread-badge` in `existence` mode, then wire `src/main/index.ts` to apply immediate `flashFrame`/badge effects and supported native popup creation/click restore through the controller without trusting renderer profile IDs or timestamps.
- [X] T008 [US1] Coordinate website notification permission with `showDesktopNotification` in `src/main/window-service.ts`: prevent duplicate website/XPath popups only while XPath popup is enabled and retain the existing permission decision otherwise.

**Checkpoint**: US1 tests pass; background activity alerts only its own profile and popup cooldown never delays badge state.

---

## Phase 4: User Story 2 - Xóa cảnh báo mà không báo lại dữ liệu cũ (Priority: P1)

**Goal**: Clear desktop attention on focus, zero/empty state or explicit command while preserving the Phase 2 DOM baseline.

**Independent Test**: Execute `5 → focus → blur → 5 → 6`; verify the repeated 5 stays silent, 6 alerts once, and focus/clear cancels current and pending desktop effects without sending a baseline-reset IPC event.

### Tests for User Story 2

> Write these tests first and confirm they fail for the missing clear behavior.

- [X] T009 [US2] Add failing focus, explicit-clear, focused-update, blur-without-replay, zero/empty and pending-popup-cancellation cases to `tests/notifier.test.ts`, including the exact `5 → focus → blur → 5 → 6` sequence.
- [X] T010 [P] [US2] Add failing socket contract tests for idempotent `clear-attention`, invalid params, unavailable-controller failure and attention fields in status to `tests/runner-control.test.ts`.

### Implementation for User Story 2

- [X] T011 [US2] Implement idempotent focus/clear/empty transitions in `src/main/notifier.ts` so flash, badge, tray unread, active popup and pending timer clear while the latest observation/baseline remains untouched.
- [X] T012 [US2] Add validated `clear-attention` handling and attention status serialization to `src/main/runner-control.ts`, preserving the existing 64 KiB limit, request IDs, timeout and socket permissions.
- [X] T013 [US2] Wire runner window focus and socket clear callbacks to the controller, expose its current status, and keep all renderer baseline reset events absent in `src/main/index.ts`.

**Checkpoint**: US2 tests pass; clearing profile A never changes profile B or the website’s read state.

---

## Phase 5: User Story 3 - Điều khiển runner từ tray và khôi phục an toàn (Priority: P2)

**Goal**: Provide a usable tray menu and safe close-to-tray behavior with CLI/Manager recovery when the desktop tray is unavailable.

**Independent Test**: With a fake ready tray, exercise every menu callback and icon/tooltip transition; with tray creation failed, verify `minimizeToTray=true` cannot hide an unreachable window and CLI restore still targets the existing runner.

### Tests for User Story 3

> Write these tests first and confirm they fail for the missing tray/recovery behavior.

- [X] T014 [P] [US3] Add failing tests for valid/fallback images, distinct idle/unread icons, mode-correct tooltip, availability, menu callbacks and idempotent destroy in `tests/tray-manager.test.ts`.
- [X] T015 [P] [US3] Add failing restore/show/focus and close-to-tray eligibility tests covering minimized, hidden, tray-ready and tray-unavailable windows in `tests/window-state.test.ts`.

### Implementation for User Story 3

- [X] T016 [US3] Implement tray construction, state updates, `Mở cửa sổ`/`Xóa cảnh báo`/`Mở Manager`/`Thoát profile` callbacks and cleanup in `src/main/tray-manager.ts`, treating successful construction as availability but not proof of visible shell rendering.
- [X] T017 [US3] Add reusable restore/show/focus and close-to-tray eligibility helpers to `src/main/window-service.ts`; allow hiding only when `minimizeToTray=true` and tray availability is `ready`.
- [X] T018 [US3] Compose the tray with attention state, safe Manager spawning, normal-bounds saving and close interception in `src/main/index.ts`, keeping same-profile CLI/second-instance recovery available when tray rendering is absent.

**Checkpoint**: US3 tests pass; every tray action targets the correct process/window and no configuration can make the runner unreachable.

---

## Phase 6: User Story 4 - Thoát runner và bảo toàn trạng thái (Priority: P2)

**Goal**: Make tray Quit, socket shutdown and ordinary exit converge on one cleanup path that cannot be intercepted by close-to-tray.

**Independent Test**: Enable `minimizeToTray`, create pending attention work, request shutdown, and verify the runner saves normal bounds, stops the server, disposes notification/tray/timer resources and exits without a late popup.

### Tests for User Story 4

> Write these tests first and confirm they fail for the missing unified quit behavior.

- [X] T019 [P] [US4] Extend shutdown tests to assert acknowledgement precedes the shared quit callback and repeated shutdown does not duplicate cleanup in `tests/runner-control.test.ts`.
- [X] T020 [P] [US4] Add failing tests for the quitting flag bypassing close-to-tray, final normal-bounds save and terminal resource disposal in `tests/window-state.test.ts`.

### Implementation for User Story 4

- [X] T021 [US4] Change socket shutdown to call the shared runner quit callback instead of closing the window directly in `src/main/runner-control.ts`.
- [X] T022 [US4] Implement one guarded runner quit flow for tray Quit, socket shutdown and application exit in `src/main/index.ts`: set quitting first, save bounds, dispose notifier/tray, stop the socket, then continue normal quit without `BrowserWindow.destroy()`.

**Checkpoint**: US4 tests pass; close-to-tray affects only ordinary close and never blocks an explicit quit.

---

## Phase 7: Polish & Cross-Cutting Verification

**Purpose**: Prove contracts, packaging and observable Linux behavior across the completed stories.

- [X] T023 [P] Verify the build copies both valid icon assets and the packaged runner resolves them; add/adjust assertions in `tests/build.test.ts` if coverage is missing.
- [X] T024 Run `npm run typecheck`, `npm test`, and `npm run build`, resolve any failures in the exact source/test file that caused them, and record the clean command results in `specs/004-desktop-attention-tray/quickstart.md`.
- [X] T025 Execute all quickstart scenarios and replace only observed “Not tested” cells for available KDE/GNOME X11/Wayland environments, including notification service, DND state, tray extension, visible result and fallback evidence in `specs/004-desktop-attention-tray/quickstart.md`.
- [X] T026 Reconcile every FR-001–FR-021 and SC-001–SC-008 against implemented tests/manual evidence, documenting any real desktop limitation without claiming API success as visible support in `specs/004-desktop-attention-tray/checklists/requirements.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency; T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1 (Phase 3)**: Depends on T003; delivers the MVP attention path.
- **US2 (Phase 4)**: Depends on US1’s attention controller; socket contract tests can be prepared independently.
- **US3 (Phase 5)**: Tray and window-helper tests can start after T003, but final composition depends on US1/US2 controller behavior.
- **US4 (Phase 6)**: Depends on notifier disposal from US1 and tray disposal from US3.
- **Polish (Phase 7)**: Depends on all selected user stories.

### User Story Dependency Graph

```text
Setup → Foundation → US1 (attention) → US2 (clear/focus)
                         └────────────→ US3 (tray/recovery) → US4 (quit)
US2 ────────────────────────────────────────────────────────┘
```

### Within Each User Story

- Write the listed tests first and confirm failure is caused by missing story behavior.
- Implement pure/state behavior before composition in `src/main/index.ts`.
- Preserve main-frame/origin/payload validation before invoking desktop effects.
- Run the story tests at its checkpoint before proceeding.

### Parallel Opportunities

- T001 and T002 are independent setup assets.
- T004 and T005 cover different US1 files.
- T010 can be written independently while T009 exercises controller semantics.
- T014 and T015 cover separate tray and window boundaries.
- T019 and T020 cover separate socket and window lifecycle boundaries.
- After T003, a second developer may prepare US3 tray/window code while the first completes US1/US2, but T018 waits for the controller contract.

---

## Parallel Example: User Story 1

```text
Task: T004 — tests/notifier.test.ts state/cooldown/isolation cases
Task: T005 — tests/permissions.test.ts duplicate-notification policy cases
```

## Parallel Example: User Story 2

```text
Task: T009 — tests/notifier.test.ts focus/baseline cases
Task: T010 — tests/runner-control.test.ts clear/status socket contract
```

## Parallel Example: User Story 3

```text
Task: T014 — tests/tray-manager.test.ts tray resource/menu behavior
Task: T015 — tests/window-state.test.ts restore and close eligibility
```

## Parallel Example: User Story 4

```text
Task: T019 — tests/runner-control.test.ts shutdown callback behavior
Task: T020 — tests/window-state.test.ts quitting/cleanup behavior
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001–T003.
2. Complete T004–T008 with tests first.
3. Stop and validate US1 independently: profile-local background attention, immediate badge/tray state and popup cooldown.

### Incremental Delivery

1. **US1**: Background attention and popup coalescing.
2. **US2**: Trustworthy focus/clear behavior without baseline reset.
3. **US3**: Tray controls and guaranteed recovery path.
4. **US4**: Unified safe quit and cleanup.
5. **Polish**: Packaging, full automated verification and observed Linux matrix.

### Minimality Guardrails

- Reuse Electron/Node APIs and existing runner modules; add no dependency.
- Keep one controller per runner and one pending popup timer; do not add a global event bus or persistent attention store.
- Keep the fixed desktop fixture limited to validation; shortcut generation remains Phase 4.
- Add abstractions only where the tests require a boundary around Electron effects.

## Notes

- `[P]` means different files and no incomplete same-phase dependency.
- Story labels provide traceability to `spec.md`.
- Each checkpoint is a runnable stopping point.
- Commit after each task or cohesive task group only after verification.
