// Mirrors the Rust types returned by the Tauri commands.

export interface UsageWindow {
  utilization: number;
  resets_at: string | null;
}

export interface ExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
  currency: string | null;
}

export interface LimitScopeLabel {
  display_name: string;
}

export interface LimitScope {
  model: LimitScopeLabel | null;
  surface: LimitScopeLabel | null;
}

/** One row of the usage endpoint's `limits[]` array (server-labeled meters). */
export interface LimitRow {
  kind: string;
  group: string;
  percent: number;
  resets_at: string | null;
  scope: LimitScope | null;
  severity: string | null;
  is_active: boolean;
}

/** A dollar-denominated allowance reported under a codename (e.g. cloud sessions). */
export interface CreditBucket {
  key: string;
  utilization: number;
  resets_at: string | null;
  limit_dollars: number | null;
  used_dollars: number | null;
  remaining_dollars: number | null;
}

export interface UsageSnapshot {
  plan: string;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDayOpus: UsageWindow | null;
  sevenDaySonnet: UsageWindow | null;
  extraUsage: ExtraUsage | null;
  limits: LimitRow[] | null;
  credits: CreditBucket[];
  /** The usage response body as received (no token), for diagnostics. */
  rawJson: string;
  fetchedAtMs: number;
}

export type SourceKind = "windows" | "wsl" | "custom";

export interface Source {
  id: string;
  label: string;
  kind: SourceKind;
  credentialsPath: string;
  exists: boolean;
}

export interface DailyTokens {
  date: string;
  tokensByModel: Record<string, number>;
  costUsd: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface StatsHistory {
  days: DailyTokens[];
  models: string[];
  modelUsage: Record<string, ModelUsage>;
  totalSessions: number;
  totalMessages: number;
  costUsd: number;
}

export type CompactStyle = "bars" | "rings";

/** How one usage meter is drawn in the expanded layout. */
export interface MeterDisplay {
  ring: boolean;
  bar: boolean;
  /** Shown in the minimized layout. */
  mini: boolean;
}

export interface AppConfig {
  selectedSourceId: string | null;
  customPaths: string[];
  refreshSeconds: number;
  alwaysOnTop: boolean;
  compact: boolean;
  compactStyle: CompactStyle;
  /** Per-meter ring/bar choice keyed by meter id; unlisted meters use defaults. */
  meters: Record<string, MeterDisplay>;
}

export type StatusKind =
  | "loading"
  | "ok"
  | "error"
  | "unauthorized"
  | "rate-limited"
  | "no-source";

export interface Status {
  kind: StatusKind;
  message?: string;
}
