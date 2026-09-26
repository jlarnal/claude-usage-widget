// Enumerates the usage meters in a snapshot and resolves how each one is drawn.
// Pure: no side effects, shared by the renderer, the settings panel and main.ts.

import type { AppConfig, LimitRow, MeterDisplay, UsageSnapshot } from "./types";

/** One usage window the expanded layout can draw as a ring and/or a bar. */
export interface Meter {
  /** Stable key used in `config.meters`. */
  id: string;
  title: string;
  percent: number;
  resetsAt: string | null;
  /** Per-model / per-surface weekly window (Opus, Sonnet, Fable, cloud sessions…). */
  scoped: boolean;
}

/** Defaults: the two headline windows are rings, scoped windows are bars. */
export const DEFAULT_DISPLAY_MAIN: MeterDisplay = { ring: true, bar: false };
export const DEFAULT_DISPLAY_SCOPED: MeterDisplay = { ring: false, bar: true };

/** How `m` is drawn: the user's choice when set, else the default for its kind. */
export function meterDisplay(config: AppConfig, m: Meter): MeterDisplay {
  return config.meters[m.id] ?? (m.scoped ? DEFAULT_DISPLAY_SCOPED : DEFAULT_DISPLAY_MAIN);
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
      resetsAt: u?.fiveHour?.resets_at ?? null,
      scoped: false,
    },
    {
      id: "seven_day",
      title: "Week",
      percent: u?.sevenDay?.utilization ?? 0,
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
    out.push({ id, title, percent, resetsAt, scoped: true });
  };
  if (u.sevenDayOpus) pushScoped("Opus", u.sevenDayOpus.utilization, u.sevenDayOpus.resets_at);
  if (u.sevenDaySonnet) pushScoped("Sonnet", u.sevenDaySonnet.utilization, u.sevenDaySonnet.resets_at);
  for (const row of u.limits ?? []) {
    const label = scopeLabel(row);
    if (label) pushScoped(label, row.percent, row.resets_at);
  }
  return out;
}
