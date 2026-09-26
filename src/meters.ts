// Enumerates the usage meters in a snapshot and resolves how each one is drawn.
// Pure: no side effects, shared by the renderer, the settings panel and main.ts.

import type { AppConfig, CreditBucket, LimitRow, MeterDisplay, UsageSnapshot } from "./types";

/** One usage window the expanded layout can draw as a ring and/or a bar. */
export interface Meter {
  /** Stable key used in `config.meters`. */
  id: string;
  title: string;
  /** The value a gauge draws: percent used for windows, percent left for credits. */
  percent: number;
  /** Percent used, which drives the colour; equals `percent` except for credits. */
  colorPercent: number;
  resetsAt: string | null;
  /** Per-model / per-surface weekly window (Opus, Sonnet, Fable, cloud sessions…). */
  scoped: boolean;
  /** Dollar figures for credit allowances; absent for percentage-only windows. */
  credit?: { used: number; limit: number; remaining: number };
}

/** Labels for the codenamed credit buckets the endpoint reports. */
const CREDIT_LABELS: Record<string, string> = {
  iguana_necktie: "Cloud sessions",
};

function creditTitle(b: CreditBucket): string {
  return CREDIT_LABELS[b.key] ?? humanizeKind(b.key);
}

/** Defaults: the two headline windows are rings (and minimized), scoped windows are bars. */
export const DEFAULT_DISPLAY_MAIN: MeterDisplay = { ring: true, bar: false, mini: true };
export const DEFAULT_DISPLAY_SCOPED: MeterDisplay = { ring: false, bar: true, mini: false };

/** How `m` is drawn: the user's choice when set, else the default for its kind. */
export function meterDisplay(config: AppConfig, m: Meter): MeterDisplay {
  return config.meters[m.id] ?? (m.scoped ? DEFAULT_DISPLAY_SCOPED : DEFAULT_DISPLAY_MAIN);
}

/** Row kinds already covered by the 5-hour / Week meters. */
const HEADLINE_KINDS = new Set(["session", "weekly", "weekly_all", "five_hour", "seven_day"]);

/** `cloud_sessions_credit` -> `Cloud sessions credit`. */
function humanizeKind(kind: string): string {
  const words = kind.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/** True when a meter is shown in the minimized layout. */
export function meterInMini(config: AppConfig, m: Meter): boolean {
  return meterDisplay(config, m).mini;
}

/** Short label for the minimized layout. */
export function compactLabel(m: Meter): string {
  if (m.id === "five_hour") return "5h";
  if (m.id === "seven_day") return "7d";
  return m.title;
}

/** The server-supplied label for a scoped `limits[]` row, or null for unscoped rows. */
export function scopeLabel(row: LimitRow): string | null {
  const name = row.scope?.model?.display_name ?? row.scope?.surface?.display_name ?? "";
  return name.trim() ? name.trim() : null;
}

/**
 * All meters for a snapshot, in display order: 5-hour, Week, then every scoped
 * window (legacy Opus / Sonnet fields first, then `limits[]` rows), deduplicated
 * by label so a window reported both ways appears once.
 */
export function listMeters(u: UsageSnapshot | null): Meter[] {
  const out: Meter[] = [
    {
      id: "five_hour",
      title: "5-hour",
      percent: u?.fiveHour?.utilization ?? 0,
      colorPercent: u?.fiveHour?.utilization ?? 0,
      resetsAt: u?.fiveHour?.resets_at ?? null,
      scoped: false,
    },
    {
      id: "seven_day",
      title: "Week",
      percent: u?.sevenDay?.utilization ?? 0,
      colorPercent: u?.sevenDay?.utilization ?? 0,
      resetsAt: u?.sevenDay?.resets_at ?? null,
      scoped: false,
    },
  ];
  if (!u) return out;

  const seen = new Set<string>();
  const pushScoped = (title: string, percent: number, resetsAt: string | null): void => {
    const id = title.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, title, percent, colorPercent: percent, resetsAt, scoped: true });
  };
  if (u.sevenDayOpus) pushScoped("Opus", u.sevenDayOpus.utilization, u.sevenDayOpus.resets_at);
  if (u.sevenDaySonnet) pushScoped("Sonnet", u.sevenDaySonnet.utilization, u.sevenDaySonnet.resets_at);
  for (const row of u.limits ?? []) {
    const label = scopeLabel(row);
    if (label) {
      pushScoped(label, row.percent, row.resets_at);
    } else if (row.kind && !HEADLINE_KINDS.has(row.kind) && !row.kind.startsWith("weekly")) {
      // An unscoped meter of a kind this widget does not know (e.g. a credit
      // pool): shown under its kind so nothing the server reports is hidden.
      pushScoped(humanizeKind(row.kind), row.percent, row.resets_at);
    }
  }
  for (const b of u.credits ?? []) {
    const title = creditTitle(b);
    const id = title.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const limit = b.limit_dollars ?? 0;
    const used = b.used_dollars ?? 0;
    const usedPct = Math.max(0, Math.min(100, b.utilization));
    // A credit is a fuel gauge: it is drawn as what is left and drains as it
    // is spent, while its colour follows how much has been used.
    out.push({
      id,
      title,
      percent: 100 - usedPct,
      colorPercent: usedPct,
      resetsAt: b.resets_at,
      scoped: true,
      credit: { used, limit, remaining: b.remaining_dollars ?? Math.max(0, limit - used) },
    });
  }
  return out;
}
