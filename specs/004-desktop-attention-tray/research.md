# Phase 0 Research: Desktop Attention, Notification và Tray

## Decision 1: Keep attention state in each runner main process

**Decision**: Create one ephemeral attention controller per runner/profile and feed it only validated `xpath:state`, focus, clear and quit events.

**Rationale**: The application already isolates each profile in its own process and Linux badge identity is application-scoped. Local ownership prevents profile A from clearing profile B and requires no shared coordinator or persistence.

**Alternatives considered**: A Manager-owned global controller would couple runner availability to Manager lifetime; persisting attention would restore stale signals and duplicate the website/DOM baseline.

## Decision 2: Separate DOM baseline from desktop attention

**Decision**: Never reset or rewrite the Phase 2 baseline when focus or clear-attention occurs. Focused updates still replace the baseline, while only a later `changedForAlert` event can re-enable attention.

**Rationale**: This directly preserves `5 → focus → blur → 5` as silent and allows `5 → focus → blur → 6` to alert.

**Alternatives considered**: Resetting the baseline on focus causes old unread state to alert again; marking content read would mutate the website and exceeds scope.

## Decision 3: Use a main-process monotonic cooldown

**Decision**: Enforce a 2000 ms popup cooldown in the runner main process, retain only the newest pending valid state, and re-check focus, attention, configuration and current state before showing.

**Rationale**: Main-process time is independent of background renderer throttling. A monotonic elapsed-time source avoids wall-clock adjustments, while a single pending timer is easy to cancel on focus, zero/empty state and quit.

**Alternatives considered**: Renderer timers are throttled in background; delaying badge/tray together with popup violates immediate-state requirements; a queue would replay stale notifications.

## Decision 4: Use only Electron desktop APIs

**Decision**: Use `BrowserWindow.flashFrame`, `app.setBadgeCount`, `Notification`, `Tray`, `Menu` and `nativeImage` from the locked Electron runtime. Do not add a DBus or tray package.

**Rationale**: Electron 44.3 exposes every required primitive. The project’s simplicity rule prefers native capabilities and avoids another Linux-specific runtime surface.

**Alternatives considered**: Direct DBus integrations could target more shell-specific behavior but increase packaging and support cost without guaranteeing visibility across desktops.

## Decision 5: Treat desktop API results as capability signals, not proof of visibility

**Decision**: Check `Notification.isSupported()`, validate loaded images, catch tray/notification failures, record `app.setBadgeCount` returning false, and verify visible behavior manually on each target environment.

**Rationale**: Electron documents that Linux badges require LauncherEntry D-Bus support and a matching desktop file. Tray and notification visibility also depend on the shell, extensions, service and do-not-disturb policy.

**Alternatives considered**: Marking support from object construction or a truthy call result would produce false positives; declaring unsupported environments globally would hide useful partial support.

## Decision 6: Make tray hiding conditional and recoverable

**Decision**: Keep `minimizeToTray` false by default. Prevent close and hide only when the option is enabled, tray creation succeeded, and the existing CLI/Manager launch path can restore the runner.

**Rationale**: Some Linux shells do not display a tray even when APIs exist. An independent restore path prevents an unreachable hidden runner.

**Alternatives considered**: Always hiding on close risks trapping the window; probing icon visibility is not portable; adding a shell-specific host detector is unnecessary.

## Decision 7: Route every real shutdown through one quit request

**Decision**: Introduce one runner quit flow used by tray Quit, socket shutdown and normal application exit. It sets a quitting flag before closing, saves current normal window state, cancels attention work, destroys desktop resources, stops the control socket, then lets the normal application lifecycle finish.

**Rationale**: The current socket shutdown calls `window.close()`, which would be intercepted by close-to-tray. A shared quit flow fixes the root cause and keeps cleanup consistent.

**Alternatives considered**: Special-case bypasses in each caller duplicate lifecycle logic; `BrowserWindow.destroy()` skips normal close/state handling.

## Decision 8: Coordinate XPath popup with website notification permission

**Decision**: When profile XPath desktop popup is enabled, deny website notification permission for that profile to avoid duplicate sources; when disabled, preserve the existing user permission choice.

**Rationale**: The feature specification requires one predictable notification source while maintaining the existing security boundary and user control.

**Alternatives considered**: Showing both sources causes duplicates; suppressing website notification unconditionally removes user choice when XPath popup is off.

## Decision 9: Keep Electron-facing code thin and state logic testable

**Decision**: Put state transitions and cooldown ownership in `notifier.ts` with a small callback dependency object; keep actual tray construction/menu wiring in `tray-manager.ts` and compose both in `index.ts`.

**Rationale**: The transition matrix and timer need deterministic unit tests, while the Electron objects need lifecycle smoke checks. This is the minimum separation that avoids mocking the full Electron module for every state test.

**Alternatives considered**: All logic in `index.ts` is difficult to test and already enlarges the composition file; a multi-layer service/factory hierarchy has no second implementation and is unnecessary.

## Decision 10: Use a fixed desktop-entry fixture until Phase 4

**Decision**: Add one test fixture matching profile `zalo` for badge/identity validation. Do not build a shortcut generator in this phase.

**Rationale**: Linux badge acceptance needs an installed desktop identity, while generation belongs explicitly to Phase 4.

**Alternatives considered**: Skipping the fixture prevents observable badge testing; implementing the generator now violates phase boundaries.

## Sources

- [Electron v44.3 `app` documentation](https://github.com/electron/electron/blob/v44.3.0/docs/api/app.md): Linux badges depend on LauncherEntry D-Bus and the matching `.desktop` name.
- [Electron v44.3 `BrowserWindow` documentation](https://github.com/electron/electron/blob/v44.3.0/docs/api/browser-window.md): `flashFrame(flag)` starts or stops attention flashing.
- [Electron v44.3 `Notification` documentation](https://github.com/electron/electron/blob/v44.3.0/docs/api/notification.md): support detection and interaction events are main-process capabilities.
- [Electron v44.3 `Tray` documentation](https://github.com/electron/electron/blob/v44.3.0/docs/api/tray.md) and [nativeImage documentation](https://github.com/electron/electron/blob/v44.3.0/docs/api/native-image.md): tray resources use native images and explicit lifecycle methods.
- `docs/design_specification.md`, `docs/detailed_tasks_plan.md`, and `docs/phased_implementation_plan.md` define project-specific state, fallback and acceptance behavior.
