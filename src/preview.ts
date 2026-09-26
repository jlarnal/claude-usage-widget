// Renders the widget with mock data for the static `preview.html`.
// Pure: imports no Tauri APIs, so it runs in a plain browser/Node bundle.

import { compactSize } from "./layout";
import { listMeters, meterInMini } from "./meters";
import { initialState, type UiState } from "./state";
import type { CompactStyle, DailyTokens, StatsHistory, UsageSnapshot } from "./types";
import { renderApp } from "./ui/app";

const HOUR = 3600_000;

const usage: UsageSnapshot = {
  plan: "Claude Max 5x",
  subscriptionType: "max",
  rateLimitTier: "default_claude_max_5x",
  fiveHour: { utilization: 37, resets_at: new Date(Date.now() + 1.2 * HOUR).toISOString() },
  sevenDay: { utilization: 12, resets_at: new Date(Date.now() + 31 * HOUR).toISOString() },
  sevenDayOpus: { utilization: 8, resets_at: null },
  sevenDaySonnet: { utilization: 22, resets_at: null },
  extraUsage: {
    is_enabled: true,
    monthly_limit: 50,
    used_credits: 12.4,
    utilization: 24.8,
    currency: "USD",
  },
  limits: [
    { kind: "session", group: "session", percent: 37, resets_at: null, scope: null, severity: "normal", is_active: true },
    { kind: "weekly_all", group: "weekly", percent: 12, resets_at: null, scope: null, severity: "normal", is_active: false },
    { kind: "weekly_scoped", group: "weekly", percent: 8, resets_at: null, scope: { model: { display_name: "Opus" }, surface: null }, severity: "normal", is_active: false },
    { kind: "weekly_scoped", group: "weekly", percent: 22, resets_at: null, scope: { model: { display_name: "Sonnet" }, surface: null }, severity: "normal", is_active: false },
    { kind: "weekly_scoped", group: "weekly", percent: 61, resets_at: null, scope: { model: { display_name: "Fable" }, surface: null }, severity: "warning", is_active: false },
    { kind: "weekly_scoped", group: "weekly", percent: 5, resets_at: null, scope: { model: null, surface: { display_name: "Cloud sessions" } }, severity: "normal", is_active: false },
  ],
  rawJson: "",
  fetchedAtMs: Date.now(),
};
usage.rawJson = JSON.stringify({
  five_hour: usage.fiveHour,
  seven_day: usage.sevenDay,
  seven_day_opus: usage.sevenDayOpus,
  seven_day_sonnet: usage.sevenDaySonnet,
  extra_usage: usage.extraUsage,
  limits: usage.limits,
});

const days: DailyTokens[] = [
  { date: "2026-06-01", tokensByModel: { "claude-sonnet-4-6": 152000 }, costUsd: 0.74 },
  { date: "2026-06-03", tokensByModel: { "claude-sonnet-4-6": 556000, "claude-opus-4-8": 120000 }, costUsd: 4.1 },
  { date: "2026-06-05", tokensByModel: { "claude-sonnet-4-6": 61000 }, costUsd: 0.31 },
  { date: "2026-06-06", tokensByModel: { "claude-opus-4-8": 421000, "claude-fable-5": 90000 }, costUsd: 9.2 },
  { date: "2026-06-07", tokensByModel: { "claude-sonnet-4-6": 316000, "claude-opus-4-8": 210000 }, costUsd: 6.5 },
  { date: "2026-06-09", tokensByModel: { "claude-opus-4-8": 880000 }, costUsd: 18.4 },
  { date: "2026-06-11", tokensByModel: { "claude-sonnet-4-6": 74000, "claude-haiku-4-5": 40000 }, costUsd: 0.5 },
  { date: "2026-06-12", tokensByModel: { "claude-opus-4-8": 1240000, "claude-sonnet-4-6": 90000 }, costUsd: 27.3 },
];

const stats: StatsHistory = {
  days,
  models: ["claude-fable-5", "claude-haiku-4-5", "claude-opus-4-8", "claude-sonnet-4-6"],
  modelUsage: {},
  totalSessions: 39,
  totalMessages: 6443,
  costUsd: days.reduce((a, d) => a + d.costUsd, 0),
};

export interface PreviewFrame {
  label: string;
  w: number;
  h: number;
  html: string;
}

function baseState(): UiState {
  const base = initialState({
    selectedSourceId: "windows",
    customPaths: [],
    refreshSeconds: 60,
    alwaysOnTop: true,
    compact: false,
    compactStyle: "bars",
    meters: {},
  });
  return {
    ...base,
    sources: [
      { id: "windows", label: "Windows", kind: "windows", credentialsPath: "C:\\Users\\you\\.claude\\.credentials.json", exists: true },
      { id: "wsl:Ubuntu", label: "WSL: Ubuntu", kind: "wsl", credentialsPath: "\\\\wsl.localhost\\Ubuntu\\home\\you\\.claude\\.credentials.json", exists: true },
    ],
    selectedId: "windows",
    usage,
    stats,
    status: { kind: "ok" },
    lastUpdatedMs: Date.now() - 8000,
  };
}

/** Render the expanded layout plus both compact styles for visual comparison. */
export function previewFrames(): PreviewFrame[] {
  const s = baseState();
  const withCfg = (compact: boolean, compactStyle: CompactStyle): UiState => ({
    ...s,
    config: { ...s.config, compact, compactStyle },
  });
  const ringsAndBars: UiState = {
    ...s,
    config: {
      ...s.config,
      meters: {
        fable: { ring: true, bar: true, mini: true },
        "cloud sessions": { ring: true, bar: false, mini: true },
        sonnet: { ring: false, bar: false, mini: false },
      },
    },
  };
  const miniCount = (st: UiState): number =>
    listMeters(st.usage).filter((m) => meterInMini(st.config, m)).length;
  return [
    { label: "Expanded", w: 300, h: 432, html: renderApp(withCfg(false, "bars")) },
    { label: "Expanded · custom meters", w: 300, h: 432, html: renderApp(ringsAndBars) },
    { label: "Settings", w: 300, h: 432, html: renderApp({ ...ringsAndBars, settingsOpen: true }) },
    { label: "Compact · Bars", w: 240, h: 86, html: renderApp(withCfg(true, "bars")) },
    { label: "Compact · Rings", w: 200, h: 124, html: renderApp(withCfg(true, "rings")) },
    {
      label: "Compact · Bars · custom meters",
      ...compactSize("bars", miniCount(ringsAndBars)),
      html: renderApp({ ...ringsAndBars, config: { ...ringsAndBars.config, compact: true, compactStyle: "bars" } }),
    },
    {
      label: "Compact · Rings · custom meters",
      ...compactSize("rings", miniCount(ringsAndBars)),
      html: renderApp({ ...ringsAndBars, config: { ...ringsAndBars.config, compact: true, compactStyle: "rings" } }),
    },
  ];
}
