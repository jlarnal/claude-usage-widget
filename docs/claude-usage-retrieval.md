# Retrieving Claude subscription consumption data

Where Claude's consumption data (quotas, credits, local token stats) lives,
how to obtain the raw data, and what the raw data looks like. Nothing here is
specific to a language, framework or application; how you present the data
is up to you.

Everything about the usage endpoint is **observed behaviour of an
undocumented, internal API** (the one Claude Code's `/usage` screen and the
claude.ai usage page call). Field names, codenames and semantics can change
without notice.

Last verified: September 2026, against Claude Code 2.1.x and a Max plan.

---

## 1. Data sources

| Data | Source | Access |
|---|---|---|
| OAuth token, subscription type, rate-limit tier | `~/.claude/.credentials.json` | local file, read-only |
| Rolling-window quotas, per-model windows, credit pools, extra usage | `GET https://api.anthropic.com/api/oauth/usage` | HTTPS, bearer token |
| Per-message token counts per model | `~/.claude/projects/**/*.jsonl` | local files, read-only |
| Aggregated token stats (lags behind the transcripts) | `~/.claude/stats-cache.json` | local file, read-only |

---

## 2. Credentials file

### 2.1 Location

| Platform | Path |
|---|---|
| Windows | `%USERPROFILE%\.claude\.credentials.json` |
| Linux | `$HOME/.claude/.credentials.json` |
| macOS | `$HOME/.claude/.credentials.json` (Claude Code may also keep the token in the Keychain; check the file first) |
| WSL distro, seen from Windows | `\\wsl.localhost\<distro>\<home>\.claude\.credentials.json` or the older `\\wsl$\<distro>\<home>\.claude\.credentials.json` |

The directory containing the file is also where `projects/` and
`stats-cache.json` live.

Finding WSL distros and their home directories from Windows:

- `wsl.exe -l -q` prints one distro name per line. The output is usually
  **UTF-16LE**, optionally with a BOM, and may contain NUL bytes.
- `wsl.exe -d <distro> -e sh -c 'printf %s "$HOME"'` prints the POSIX home
  (`/root` if it prints nothing).
- In the UNC path, `/` in the home directory becomes `\`.

### 2.2 Format

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
| `refreshToken` | Present, but owned by Claude Code. Do not use it: two clients refreshing the same token log one of them out. |
| `expiresAt` | Epoch **milliseconds**. The token is expired when `now_ms >= expiresAt`. May be absent. |
| `scopes` | `user:profile` is required by the usage endpoint. |
| `subscriptionType` | `max`, `pro`, `team`, `enterprise`, … |
| `rateLimitTier` | e.g. `default_claude_max_5x`, `default_claude_max_20x`, `claude_pro`. |

Treat the file as read-only. When the token is expired, running Claude Code
once (any command) refreshes it.

---

## 3. Usage endpoint

### 3.1 Request

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20
User-Agent: <anything>
```

A variant `GET /api/oauth/usage?at_wall=1&skip_spend=1` exists (Claude Code
uses it after hitting a limit). Its semantics are unverified.

### 3.2 Requirements and cost

| Requirement | Detail |
|---|---|
| Authentication | The **OAuth access token** from `.credentials.json` (a subscription login). A Console **API key does not work**, and the endpoint has no meaning for API-key, Bedrock or Vertex users, who have no plan windows. |
| Scope | The token must carry `user:profile`; Claude Code's normal login grants it. |
| Beta header | `anthropic-beta: oauth-2025-04-20`, or the request is rejected. |
| Price | **None.** No model is invoked, so the call consumes **no tokens, no plan quota and no credits**, and nothing is billed. |
| Rate limit | The endpoint itself is rate limited: HTTP 429, with a `Retry-After` header in seconds when provided. |

Reading the local files costs nothing.

### 3.3 Status codes

| Status | Meaning |
|---|---|
| 200 | JSON body, see below. |
| 401 / 403 | Token expired or revoked. Running Claude Code once refreshes it. |
| 429 | Rate limited. `Retry-After` (seconds) may be present. |
| other | Transient or unknown failure. |

### 3.4 Raw response (real shape, values rounded)

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

Any field may be absent or `null`; new top-level keys appear over time.

### 3.5 Field reference

**Window object**, the shape of `five_hour`, `seven_day`, every `seven_day_*`
key and every codenamed key:

| Field | Type | Meaning |
|---|---|---|
| `utilization` | number | Percent **used** of the window, 0–100 (can briefly exceed 100). |
| `resets_at` | ISO-8601 string or null | When the window resets. |
| `limit_dollars`, `used_dollars`, `remaining_dollars` | number or null | Non-null only for **dollar-denominated credit pools**. Amounts in USD. |
| `locked_reason` | string or null | Non-null when the bucket is locked. |

**Top-level keys**

| Key | Meaning |
|---|---|
| `five_hour` | Rolling 5-hour window. |
| `seven_day` | Rolling 7-day window across all models. |
| `seven_day_opus`, `seven_day_sonnet` | Legacy per-model weekly windows; usually `null` now that `limits[]` exists. |
| `seven_day_oauth_apps`, `seven_day_cowork`, `seven_day_omelette` | Other surfaces' weekly windows; usually `null`. |
| codenamed keys (`tangelo`, `iguana_necktie`, `nimbus_quill`, `cinder_cove`, `copper_kite`, `brass_thimble`, `harbor_lantern`, `wattle_ember`, `amber_ladder`, `amber_cistern`, `juniper_tide`, `cedar_ember`, `amber_gauge`, `omelette_promotional`) | Credit pools and experiments under **obfuscated names that can rotate**. A pool is recognisable by a non-null `limit_dollars`. |
| `extra_usage` | Pay-as-you-go overflow credits ("usage credits"). |
| `limits` | The self-describing list of active meters (below). |
| `spend` | The overflow credits as money in minor units (`amount_minor / 10^exponent`), with purchase and toggle flags. |
| `seven_day_breakdown` | Share of the weekly window per surface; percentages sum to about 100. |
| `member_dashboard_available` | Whether an organisation dashboard exists for this account. |

Codenames observed so far:

| Key | Observed meaning |
|---|---|
| `iguana_necktie` | The **cloud sessions** credit allowance: a dollar pool with a reset date. |
| `cinder_cove` | "Claude Code and Cowork credit" in Claude Code's `/usage`: a one-time credit with an expiry. |
| `nimbus_quill` | Present with zero utilisation and no dollar figures. |

**`limits[]` rows.** Claude Code's own schema describes them as the server's
usage rows, to be rendered verbatim so that a new meter needs no client change.

| Field | Values / meaning |
|---|---|
| `kind` | `session`, `weekly_all`, `weekly_scoped`; others may appear. Classify on this, not on labels. |
| `group` | `session` or `weekly`; rows are grouped under it in server order. |
| `percent` | Percent used, 0–100. |
| `severity` | `normal`, `warning`, `critical`. |
| `resets_at` | ISO-8601 or null. |
| `scope` | `null` for headline rows; `{ "model": { "id", "display_name" } }` for a per-model window (e.g. "Fable"); `{ "surface": { "display_name" } }` for a per-surface window. |
| `is_active` | The server's pick for a single-value indicator. |

**`extra_usage`**

| Field | Meaning |
|---|---|
| `is_enabled` | Whether overflow is currently active. |
| `monthly_limit`, `used_credits`, `utilization` | Monthly cap, used amount and percent, in `currency`. |
| `currency`, `decimal_places` | Currency code and display precision. |
| `disabled_reason` | e.g. `out_of_credits`. |
| `user_disabled`, `spend_limit_reached`, `credits_ever_enabled` | Flags. |
| `daily`, `weekly` | Sub-caps, `null` when unset. |

---

## 4. Local token data

### 4.1 Transcripts

Path: `~/.claude/projects/<project-dir>/*.jsonl`, one JSON object per line.
Token counts are on lines of this shape:

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

Other line types (`user`, `summary`, tool results, …) carry no usage.
Synthetic assistant lines have a `message.model` starting with `<` and zero
counters. Files are written in place while a session runs.

### 4.2 `stats-cache.json`

Path: `~/.claude/stats-cache.json`, written periodically by Claude Code.

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

It lags behind the transcripts and contains no cost information.

---

## 5. Related signal: rate-limit headers

Responses of the Messages API (when your own program calls a model with the
subscription token) carry `anthropic-ratelimit-unified-*` headers. Claude
Code reads them with limit types `five_hour`, `seven_day`, `seven_day_opus`,
`seven_day_sonnet`, `seven_day_overage_included` (labelled "Fable limit") and
`overage`. They only exist on model calls; a pure monitor does not see them.
