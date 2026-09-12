# Contract: Runner Control Attention Extension

The existing newline-delimited JSON socket keeps its 64 KiB limit, request ID rules, timeout and per-profile filesystem permissions.

## `clear-attention` Request

```json
{
  "requestId": "clear-001",
  "action": "clear-attention"
}
```

`params` is omitted. Unknown fields or non-empty parameters do not expand the command’s authority.

### Success Response

```json
{
  "requestId": "clear-001",
  "success": true,
  "data": {
    "cleared": true
  }
}
```

The command is idempotent: clearing an already inactive runner returns success with `cleared: false` or the project’s documented equivalent, without changing the DOM baseline.

### Failure Responses

- `INVALID_REQUEST`: request shape/action is invalid.
- `NOT_SUPPORTED`: attention controller is unavailable during startup/teardown.
- Existing payload-size, timeout and socket errors remain unchanged.

## `status` Attention Fields

The existing status payload adds:

```json
{
  "attention": {
    "active": true,
    "mode": "badge_count",
    "count": 6
  }
}
```

Rules:

- `active` is required when the attention block exists.
- `mode` matches the active profile XPath mode.
- `count` is the current badge count for `badge_count`; it is `0` or omitted for non-count modes.
- Status is observational and cannot create, clear or transfer attention.

## `shutdown` Behavior Change

The request/response schema is unchanged. After acknowledging shutdown, the server invokes the same quit flow as tray “Thoát profile”, so `minimizeToTray` cannot convert shutdown into a hidden runner.
