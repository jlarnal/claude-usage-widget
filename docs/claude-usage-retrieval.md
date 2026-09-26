# Retrieving Claude subscription consumption: credits, quotas and local stats

A language-agnostic reference for building a "Claude usage" monitor. It
collects everything this widget learned about where the data lives, how to
fetch it, what the payloads look like and how to turn them into meters.
Nothing here depends on Rust, Tauri or TypeScript.

Everything about the usage endpoint is **observed behaviour of an
undocumented, internal API** (the one Claude Code's `/usage` screen and the
claude.ai usage page call). Field names, codenames and semantics can change
without notice. Keep a "raw response" view in your app so you can adapt.

Last verified: September 2026, against Claude Code 2.1.x and a Max plan.

---

## 1. Data sources at a glance

| What | Where | Access | Freshness |
|---|---|---|---|
| OAuth token, plan tier | `~/.claude/.credentials.json` | read-only file | refreshed by Claude Code |
| Rolling-window quotas, per-model windows, credit pools, extra usage | `GET https://api.anthropic.com/api/oauth/usage` | HTTPS + bearer token | live |
| Per-day token counts per model (local) | `~/.claude/projects/**/*.jsonl` transcripts | read-only files | as Claude Code writes |
| Aggregated token stats (local, lags) | `~/.claude/stats-cache.json` | read-only file | periodic |

```
.credentials.json ──(read)──▶ your backend ──HTTPS──▶ api.anthropic.com/api/oauth/usage
                                     │
projects/**/*.jsonl ───(read)──▶ your backend ──▶ per-day / per-model token history
stats-cache.json ─────(read)──▶ (fallback)
```

Keep the token in the backend. Only the derived numbers should reach a UI.

---

## 2. Credentials

### 2.1 Locations

| Platform | Path |
|---|---|
| Windows | `%USERPROFILE%\.claude\.credentials.json` |
| Linux | `$HOME/.claude/.credentials.json` |
| macOS | `$HOME/.claude/.credentials.json` (Claude Code may also keep the token in the Keychain; check the file first) |
| WSL distro, seen from Windows | `\\wsl.localhost\<distro>\<home>\.claude\.credentials.json` or the older `\\wsl$\<distro>\...` |

`~/.claude` is also where `projects/` and `stats-cache.json` live, so
"the directory containing the credentials file" is the anchor for everything.

Discovering WSL distros from Windows:

- `wsl.exe -l -q` prints one distro name per line. The output is usually
  **UTF-16LE** (optionally with a BOM) and may contain NUL bytes; detect that
  (roughly half the bytes are NUL) and decode accordingly, then trim.
- `wsl.exe -d <distro> -e sh -c 'printf %s "$HOME"'` gives the POSIX home
  (fall back to `/root`). Reject distro names containing `\`, `/`, `..` or NUL
  before building a UNC path.
- Build the UNC path as `<prefix>\<distro>\<home with / turned into \>\.claude\.credentials.json`
  and test both prefixes; prefer the one that exists.

### 2.2 File format

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1750000000000,
    "scopes": ["user:inference", "user:profile"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_5x"
  }
}
```

| Field | Meaning |
|---|---|
| `accessToken` | Bearer token for the usage endpoint. |
| `refreshToken` | Present, but **do not use it**. |
| `expiresAt` | Epoch **milliseconds**. Token is expired when `now_ms >= expiresAt`. Missing means "assume valid". |
| `subscriptionType` | `max`, `pro`, `team`, `enterprise`, … |
| `rateLimitTier` | e.g. `default_claude_max_5x`, `default_claude_max_20x`, `claude_pro`. |

Rules that keep you out of trouble:

- Treat the file as **read-only**. Claude Code owns token refresh. If two
  clients refresh the same refresh token, one of them ends up logged out.
- If the token is expired or the endpoint answers 401/403, tell the user to
  run Claude Code once (any command) so it refreshes the token, then retry.
- Never log or display the token.

### 2.3 Plan label

A friendly plan name can be derived locally (there is no "plan name" field):

1. If `rateLimitTier` contains `max_20x` → "Max 20x"; `max_5x` → "Max 5x";
   `max` → "Max"; `team` → "Team"; `pro` → "Pro"; `free` → "Free".
2. Else use `subscriptionType` capitalised (`max` → "Max", `enterprise` → "Enterprise").
3. Prefix with "Claude ". Fall back to just "Claude".

---

## 3. The usage endpoint

### 3.1 Request

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20
User-Agent: <your app name>
```

- The `anthropic-beta: oauth-2025-04-20` header is required for OAuth tokens.
- A variant `GET /api/oauth/usage?at_wall=1&skip_spend=1` exists (Claude Code
  uses it when it hits a limit). Semantics unverified; the plain URL is enough.
- Use a request timeout (this widget uses 20 s).

### 3.2 Responses and errors

| Status | Meaning | What to do |
|---|---|---|
| 200 | JSON body (see below) | parse; tolerate unknown fields |
| 401 / 403 | token expired or revoked | show "run Claude Code once", stop polling until refreshed |
| 429 | rate limited | honour `Retry-After` (seconds) if present, else back off |
| other 5xx/4xx | transient / unknown | back off, keep the last good snapshot |

Polling guidance that has worked well:

- Default interval 90 s, minimum 30 s, maximum 1 h (user-configurable).
- Add 0–5 s of jitter so you do not poll in lockstep with Claude Code, which
  reads the same endpoint with the same token.
- On any failure, exponential backoff: `base × 2^n`, capped at 10 minutes,
  `n` capped at 6; reset on the next success or on a manual refresh.
- Keep showing the last good snapshot while errors persist, with a status line.

### 3.3 Full response example (real shape, values rounded)

```json
{
  "five_hour": {
    "utilization": 30.0,
    "resets_at": "2026-09-26T03:29:59.547844+00:00",
    "limit_dollars": null, "used_dollars": null, "remaining_dollars": null,
    "locked_reason": null
  },
  "seven_day": {
    "utilization": 60.0,
    "resets_at": "2026-10-01T02:00:00.547863+00:00",
    "limit_dollars": null, "used_dollars": null, "remaining_dollars": null,
    "locked_reason": null
  },
  "seven_day_oauth_apps": null,
  "seven_day_opus": null,
  "seven_day_sonnet": null,
  "seven_day_cowork": null,
  "seven_day_omelette": null,

  "tangelo": null,
  "iguana_necktie": {
    "utilization": 22.98,
    "resets_at": "2026-11-05T07:59:00+00:00",
    "limit_dollars": 250,
    "used_dollars": 57.46,
    "remaining_dollars": 192.54,
    "locked_reason": null
  },
  "omelette_promotional": null,
  "nimbus_quill": {
    "utilization": 0.0, "resets_at": null,
    "limit_dollars": null, "used_dollars": null, "remaining_dollars": null,
    "locked_reason": null
  },
  "cinder_cove": null, "copper_kite": null, "brass_thimble": null,
  "harbor_lantern": null, "wattle_ember": null, "amber_ladder": null,
  "amber_cistern": null, "juniper_tide": null, "cedar_ember": null,
  "amber_gauge": null,

  "extra_usage": {
    "is_enabled": false,
    "monthly_limit": 2400,
    "used_credits": 2382.0,
    "utilization": 99.25,
    "currency": "EUR",
    "decimal_places": 2,
    "disabled_reason": "out_of_credits",
    "user_disabled": false,
    "spend_limit_reached": false,
    "credits_ever_enabled": true,
    "daily": null,
    "weekly": null
  },

  "limits": [
    { "kind": "session",       "group": "session", "percent": 30, "severity": "normal",
      "resets_at": "2026-09-26T03:29:59.547844+00:00", "scope": null, "is_active": false },
    { "kind": "weekly_all",    "group": "weekly",  "percent": 60, "severity": "normal",
      "resets_at": "2026-10-01T02:00:00.547863+00:00", "scope": null, "is_active": false },
    { "kind": "weekly_scoped", "group": "weekly",  "percent": 86, "severity": "warning",
      "resets_at": "2026-10-01T02:00:00.548083+00:00",
      "scope": { "model": { "id": null, "display_name": "Fable" }, "surface": null },
      "is_active": true }
  ],

  "spend": {
    "used":  { "amount_minor": 2382, "currency": "EUR", "exponent": 2 },
    "limit": { "amount_minor": 2400, "currency": "EUR", "exponent": 2 },
    "percent": 99, "severity": "critical",
    "enabled": false, "disabled_reason": "out_of_credits",
    "cap": { "money": { "amount_minor": 2400, "currency": "EUR", "exponent": 2 }, "credits": null },
    "balance": null, "auto_reload": null,
    "disclaimer": "Usage credits cover you when you hit your plan limits. [Learn more](...)",
    "can_purchase_credits": false, "can_toggle": false
  },

  "member_dashboard_available": false,
  "seven_day_breakdown": {
    "as_of": "2026-09-26T02:19:03.586107+00:00",
    "window_started_at": "2026-09-24T02:00:00.547863+00:00",
    "rows": [
      { "key": "claude_code", "display_name": "Claude Code", "percent": 99 },
      { "key": "chat",        "display_name": "Chats",       "percent": 1 },
      { "key": "cowork",      "display_name": "Cowork",      "percent": 0 },
      { "key": "other",       "display_name": "Other",       "percent": 0 }
    ]
  }
}
```

### 3.4 Field reference

**Window object** (used by `five_hour`, `seven_day`, `seven_day_*` and every
codenamed bucket):

| Field | Type | Meaning |
|---|---|---|
| `utilization` | number | Percent **used**, 0–100 (can exceed 100 briefly). |
| `resets_at` | ISO-8601 string or null | When the window resets. Show a countdown. |
| `limit_dollars`, `used_dollars`, `remaining_dollars` | number or null | Present (non-null) only for **dollar-denominated credit pools**. Amounts are in USD. |
| `locked_reason` | string or null | Non-null when the bucket is locked. |

**Top-level windows**

| Key | Meaning |
|---|---|
| `five_hour` | The rolling 5-hour session limit. |
| `seven_day` | The rolling weekly limit across all models. |
| `seven_day_opus`, `seven_day_sonnet` | Legacy per-model weekly windows. Often `null` now that `limits[]` exists. |
| `seven_day_oauth_apps`, `seven_day_cowork`, `seven_day_omelette` | Other surfaces' weekly windows, usually `null`. |
| codenamed keys (`tangelo`, `iguana_necktie`, `nimbus_quill`, `cinder_cove`, `copper_kite`, …) | Credit pools and experiments. Names are **obfuscated and can rotate**. Do not hard-code more than a label map. |

Known codenames (observed):

| Key | What it turned out to be |
|---|---|
| `iguana_necktie` | The **cloud sessions** credit allowance (dollar pool with a reset date). |
| `cinder_cove` | Shown by Claude Code as "Claude Code and Cowork credit", a one-time credit that expires. |
| `nimbus_quill` | Present with zero utilisation and no dollars; ignore unless it grows. |

**`limits[]` rows** — the modern, self-describing list. Claude Code's schema
description says a client should "render them verbatim" so a new meter needs
no client release.

| Field | Values / meaning |
|---|---|
| `kind` | `session`, `weekly_all`, `weekly_scoped` (others may appear). Classify rows on this, not on labels. |
| `group` | `session` or `weekly`; rows render grouped under it in server order. |
| `percent` | Percent used, 0–100. |
| `severity` | `normal`, `warning`, `critical` — the server's colour hint. |
| `resets_at` | ISO-8601 or null. |
| `scope` | null for the headline rows; `{ model: { id, display_name } }` for a per-model window (e.g. "Fable"); `{ surface: { display_name } }` for a per-surface window. |
| `is_active` | The server's pick for a single-value indicator. |

**`extra_usage`** — pay-as-you-go overflow credits (a.k.a. "usage credits").

| Field | Meaning |
|---|---|
| `is_enabled` | Whether overflow is currently active. |
| `monthly_limit`, `used_credits`, `utilization` | Monthly cap, used amount and percent, in `currency`. |
| `currency`, `decimal_places` | Display hints (`EUR`, 2). |
| `disabled_reason` | e.g. `out_of_credits`. |

**`spend`** — the same overflow information as money in minor units
(`amount_minor / 10^exponent`), plus purchase/toggle capability flags.

**`seven_day_breakdown`** — share of the weekly window per surface
(Claude Code, Chats, Cowork, Other). Percentages sum to ~100.

### 3.5 Turning the payload into meters

Recommended, forward-compatible algorithm:

1. **Headline windows.** Take `five_hour` and `seven_day` (or the `session`
   and `weekly_all` rows of `limits[]`). Percent used, reset countdown.
2. **Scoped windows.** For every `limits[]` row whose `scope.model.display_name`
   or `scope.surface.display_name` is non-empty, create a meter titled with
   that label. Deduplicate by label against the legacy `seven_day_opus` /
   `seven_day_sonnet` fields if you also read those.
3. **Credit pools.** For every top-level key whose value is an object with a
   numeric `limit_dollars`, create a credit meter:
   - `used_pct = used_dollars / limit_dollars × 100`
   - `remaining_pct = remaining_dollars / limit_dollars × 100`
     (fall back to `100 − used_pct`)
   - Represent it as a *fuel gauge*: draw what is left, colour by what is
     used. Show `remaining`, `used / limit` and the reset date.
   - Label from a small codename map; otherwise humanise the key.
4. **Unknown unscoped `limits[]` kinds** (anything not `session`/`weekly*`):
   show them under a humanised `kind` so nothing the server reports is hidden.
5. **Extra usage.** Show `used_credits / monthly_limit` when `is_enabled` or
   when `credits_ever_enabled`, with `currency`.
6. **Colours.** Use the server's `severity` when present; otherwise a simple
   ramp on percent used (green < 70, amber < 90, red).

Percent semantics: every `utilization` / `percent` is **used**, never
remaining. Only the credit pools carry an explicit `remaining_dollars`.

---

## 4. Local token history

The endpoint gives quotas, not token counts. Token counts come from Claude
Code's own files next to the credentials.

### 4.1 Transcripts (primary)

Path: `~/.claude/projects/<project-dir>/*.jsonl`, one JSON object per line.

Only lines of this shape matter:

```json
{
  "type": "assistant",
  "timestamp": "2026-09-25T14:03:11.123Z",
  "message": {
    "model": "claude-opus-4-8",
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567,
      "cache_read_input_tokens": 89012,
      "cache_creation_input_tokens": 3456
    }
  }
}
```

Rules used by this widget:

- Keep lines with `type == "assistant"`, a `timestamp`, a `message.model`
  that is non-empty and does not start with `<` (synthetic messages), and a
  `message.usage` whose four counters do not all sum to zero.
- Day = first 10 characters of `timestamp` (UTC date).
- Aggregate per day per model, and per model overall.
- For the chart, "work tokens" = `input + output + cache_creation`
  (cache reads are cheap and would dwarf everything else).
- Skip files whose modification time is older than `max_days + 2` days to
  keep scans fast. Scanning 14 days of a busy machine takes well under a second.

### 4.2 `stats-cache.json` (fallback)

Claude Code periodically writes `~/.claude/stats-cache.json`. It lags behind
the transcripts and lacks cost detail, so use it only when no transcripts
were found.

```json
{
  "dailyModelTokens": [
    { "date": "2026-09-24", "tokensByModel": { "claude-opus-4-8": 421000 } }
  ],
  "modelUsage": {
    "claude-opus-4-8": {
      "inputTokens": 1, "outputTokens": 2,
      "cacheReadInputTokens": 3, "cacheCreationInputTokens": 4
    }
  },
  "totalSessions": 39,
  "totalMessages": 6443
}
```

Sort `dailyModelTokens` by date and keep the most recent `max_days`.

### 4.3 Estimated cost

Subscribers are not billed per token, but an "API-equivalent" cost is a
useful yardstick. Per million tokens, USD (approximate, keep it configurable):

| Model family (substring match) | input | output | cache write | cache read |
|---|---|---|---|---|
| `opus` | 15 | 75 | 18.75 | 1.50 |
| `haiku` | 1 | 5 | 1.25 | 0.10 |
| anything else (Sonnet tier) | 3 | 15 | 3.75 | 0.30 |

`cost = (input×p.in + output×p.out + cache_creation×p.write + cache_read×p.read) / 1e6`.

---

## 5. Related signals you may also see

Every Messages API response carries unified rate-limit headers, which Claude
Code reads to show "approaching limit" banners. Names observed in the CLI:
`anthropic-ratelimit-unified-*`, with limit types `five_hour`, `seven_day`,
`seven_day_opus`, `seven_day_sonnet`, `seven_day_overage_included`
(labelled "Fable limit" in the CLI) and `overage`. They are only useful if
your app also makes model calls; a monitor should rely on the usage endpoint.

---

## 6. Porting checklist

1. Locate `.claude/.credentials.json` for each source (native user, WSL
   distros, custom paths). Never write it.
2. Parse `claudeAiOauth`; check `expiresAt` (ms) against now.
3. `GET /api/oauth/usage` with `Authorization: Bearer` and
   `anthropic-beta: oauth-2025-04-20`; 20 s timeout.
4. Map 401/403 → "run Claude Code once"; 429 → `Retry-After` or backoff;
   keep the last good snapshot.
5. Parse leniently: every field optional, unknown keys kept (for codenamed
   buckets and diagnostics).
6. Build meters per §3.5; keep the raw JSON visible somewhere for support.
7. Poll every 60–120 s with jitter; exponential backoff on errors.
8. Optionally aggregate `projects/**/*.jsonl` for a token/cost chart, with
   `stats-cache.json` as fallback.
9. Keep the token in the backend process; the UI only ever sees numbers.

---

## 7. Minimal reference implementation (pseudo-code)

```text
creds   = parse_json(read_file(credentials_path)).claudeAiOauth
if creds.expiresAt and now_ms() >= creds.expiresAt: raise TokenExpired

resp = http_get("https://api.anthropic.com/api/oauth/usage",
                headers = { Authorization: "Bearer " + creds.accessToken,
                            "anthropic-beta": "oauth-2025-04-20",
                            "User-Agent": "my-usage-monitor" },
                timeout = 20s)
if resp.status in (401, 403): raise TokenExpired
if resp.status == 429:        raise RateLimited(retry_after = resp.headers["Retry-After"])
if resp.status != 200:        raise HttpError(resp.status)

u = parse_json(resp.body)
meters = []
meters += window("5-hour", u.five_hour)
meters += window("Week",   u.seven_day)
for row in u.limits or []:
    label = row.scope?.model?.display_name or row.scope?.surface?.display_name
    if label:                         meters += scoped(label, row.percent, row.resets_at, row.severity)
    elif row.kind not in HEADLINE:    meters += scoped(humanise(row.kind), row.percent, row.resets_at)
for key, val in u.items():
    if is_object(val) and is_number(val.limit_dollars):
        meters += credit(LABELS.get(key, humanise(key)),
                         used = val.used_dollars, limit = val.limit_dollars,
                         remaining = val.remaining_dollars ?? limit - used,
                         resets_at = val.resets_at)
if u.extra_usage and (u.extra_usage.is_enabled or u.extra_usage.credits_ever_enabled):
    meters += extra(u.extra_usage)
```

`LABELS = { "iguana_necktie": "Cloud sessions", "cinder_cove": "Claude Code and Cowork credit" }`
