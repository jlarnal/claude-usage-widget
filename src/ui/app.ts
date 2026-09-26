// Builds the widget's HTML from UI state. Pure: no side effects, no events.

import { ago, escapeHtml, fmtPct, fmtUsd, formatCountdown, utilColor } from "../format";
import { selectedSource, type UiState } from "../state";
import { compactLabel, listMeters, meterDisplay, meterInMini, type Meter } from "../meters";
import type { AppConfig, ExtraUsage, MeterDisplay, Source, StatsHistory, UsageSnapshot } from "../types";
import { historyChart } from "./chart";
import { miniBar, ringGauge } from "./gauge";

export function renderApp(state: UiState): string {
  const now = Date.now();
  if (state.config.compact) {
    return renderCompact(state);
  }
  return `
  <div class="widget${state.settingsOpen ? " with-settings" : ""}">
    ${renderTopbar(state)}
    <main class="body">${renderBody(state, now)}</main>
    ${renderStatusbar(state, now)}
    ${state.settingsOpen ? renderSettings(state) : ""}
  </div>`;
}

/** The small minimized layout: every meter marked "Mini" as bars or mini rings. */
function renderCompact(state: UiState): string {
  const u = state.usage;
  const style = state.config.compactStyle;
  const meters = listMeters(u).filter((m) => meterInMini(state.config, m));

  const content =
    style === "rings"
      ? `<div class="crings">${meters
          .map((m) => compactRing(escapeHtml(compactLabel(m)), m.percent))
          .join("")}</div>`
      : `<div class="cbars">${meters
          .map((m) => compactBar(escapeHtml(compactLabel(m)), m.percent))
          .join("")}</div>`;

  const dimmed = u ? "" : " dimmed";
  return `
  <div class="widget compact ${style}${dimmed}">
    <button class="iconbtn expand-btn" data-action="toggle-compact" title="Expand">&#x26F6;</button>
    ${content}
  </div>`;
}

function compactBar(label: string, pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  return `
  <div class="cbar">
    <span class="cbar-label" title="${label}">${label}</span>
    <div class="mini-track"><div class="mini-fill" style="width:${p}%;background:${utilColor(p)}"></div></div>
    <span class="cbar-pct">${fmtPct(p)}%</span>
  </div>`;
}

function compactRing(label: string, pct: number): string {
  return `<div class="cring">${ringGauge(pct, { size: 60, stroke: 7 })}<span class="cring-label" title="${label}">${label}</span></div>`;
}

function renderTopbar(state: UiState): string {
  const plan = state.usage?.plan ?? "Claude";
  const options =
    state.sources.length === 0
      ? `<option>No sources</option>`
      : state.sources
          .map(
            (s) =>
              `<option value="${escapeHtml(s.id)}" ${
                s.id === state.selectedId ? "selected" : ""
              }>${escapeHtml(s.label)}${s.exists ? "" : " (missing)"}</option>`,
          )
          .join("");

  return `
  <header class="topbar">
    <div class="brand">
      <span class="plan">${escapeHtml(plan)}</span>
      <select class="source-select" data-action="select-source" title="Credential source">${options}</select>
    </div>
    <div class="topbar-btns">
      <button class="iconbtn" data-action="refresh" title="Refresh now">&#x21bb;</button>
      <button class="iconbtn" data-action="toggle-compact" title="Minimize">&#x2013;</button>
      <button class="iconbtn" data-action="toggle-settings" title="Settings">&#x2699;</button>
      <button class="iconbtn" data-action="hide-window" title="Hide to tray">&#x2715;</button>
    </div>
  </header>`;
}

function renderBody(state: UiState, now: number): string {
  const src = selectedSource(state);

  if (!src) {
    return emptyState(
      "No credential source",
      "Add a .credentials.json in settings, or run Claude Code first.",
      "Open settings",
    );
  }
  if (state.usage) {
    return renderUsage(state.usage, state.stats, now, state.config);
  }
  if (state.status.kind === "unauthorized") {
    return emptyState(
      "Token expired",
      "Run Claude Code once to refresh the login, then press refresh.",
      "Refresh",
      "refresh",
    );
  }
  if (state.status.kind === "error") {
    return emptyState(
      "Couldn’t load usage",
      state.status.message ?? "Unknown error.",
      "Retry",
      "refresh",
    );
  }
  return `<div class="loading">Loading usage…</div>`;
}

function renderUsage(
  u: UsageSnapshot,
  stats: StatsHistory | null,
  now: number,
  config: AppConfig,
): string {
  const meters = listMeters(u);
  const rings = meters.filter((m) => meterDisplay(config, m).ring);
  const bars = meters.filter((m) => meterDisplay(config, m).bar);

  // Two rings fit side by side at full size; more shrink so three share a row.
  const small = rings.length > 2;
  const gauges = rings.length
    ? `<div class="gauges${small ? " small" : ""}">${rings
        .map((m) => gaugeCol(m, now, small))
        .join("")}</div>`
    : "";

  const modelBlock = bars.length
    ? `<div class="models">${bars
        .map((m) => miniBar(escapeHtml(m.title), m.percent))
        .join("")}</div>`
    : "";

  return `${gauges}${modelBlock}${extraUsageBlock(u.extraUsage)}${historyChart(stats)}`;
}

function extraUsageBlock(extra: ExtraUsage | null): string {
  if (!extra || !extra.is_enabled) return "";
  const cur = extra.currency ?? "USD";
  const used = extra.used_credits ?? 0;
  const limit = extra.monthly_limit;
  const pct =
    extra.utilization ?? (limit && limit > 0 ? (used / limit) * 100 : 0);
  const amount = `${fmtUsd(used, cur)} / ${limit != null ? fmtUsd(limit, cur) : "∞"}`;
  return `
  <div class="extra">
    <div class="extra-head"><span>Extra usage</span><span class="extra-amt">${escapeHtml(amount)}</span></div>
    <div class="mini-track"><div class="mini-fill" style="width:${Math.max(
      0,
      Math.min(100, pct),
    )}%;background:${utilColor(pct)}"></div></div>
  </div>`;
}

function gaugeCol(m: Meter, now: number, small: boolean): string {
  const reset = m.resetsAt;
  const ring = small ? ringGauge(m.percent, { size: 84, stroke: 8 }) : ringGauge(m.percent);
  return `
    <div class="gcol">
      ${ring}
      <div class="gmeta">
        <span class="gtitle" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</span>
        <span class="reset"${reset ? ` data-reset="${reset}"` : ""}>${
          reset ? `resets in ${formatCountdown(reset, now)}` : "no reset"
        }</span>
      </div>
    </div>`;
}

function renderStatusbar(state: UiState, now: number): string {
  const kind = state.status.kind;
  let text: string;
  if (kind === "unauthorized") text = "token expired";
  else if (kind === "rate-limited") text = "rate limited";
  else if (kind === "error") text = state.status.message ?? "error";
  else if (kind === "no-source") text = "no source";
  else if (state.lastUpdatedMs) text = `updated ${ago(now - state.lastUpdatedMs)}`;
  else text = "loading…";

  return `
  <footer class="statusbar">
    <span class="dot ${kind}"></span>
    <span class="status-text" title="${escapeHtml(text)}">${escapeHtml(text)}</span>
  </footer>`;
}

function renderSettings(state: UiState): string {
  const sources = state.sources.length
    ? state.sources.map((s) => sourceRow(s, s.id === state.selectedId)).join("")
    : `<div class="muted">No sources detected.</div>`;

  const customs = state.config.customPaths.length
    ? state.config.customPaths
        .map(
          (p, i) =>
            `<div class="custom-row"><span title="${escapeHtml(p)}">${escapeHtml(
              p,
            )}</span><button class="linkbtn" data-action="remove-custom" data-index="${i}">remove</button></div>`,
        )
        .join("")
    : "";

  return `
  <div class="settings">
    <div class="settings-head">
      <span>Settings</span>
      <button class="iconbtn" data-action="toggle-settings" title="Close">&#x2715;</button>
    </div>
    <div class="settings-body">
      <div class="field">
        <span class="field-label">Source</span>
        <div class="source-list">${sources}</div>
      </div>
      <button class="btn" data-action="add-custom">+ Add credentials file…</button>
      ${customs ? `<div class="custom-list">${customs}</div>` : ""}
      <div class="field row">
        <span class="field-label">Refresh (sec)</span>
        <input class="num" type="number" min="30" max="3600" step="5"
          value="${state.config.refreshSeconds}" data-action="set-refresh" />
      </div>
      <label class="field row">
        <span class="field-label">Always on top</span>
        <input type="checkbox" data-action="toggle-aot" ${
          state.config.alwaysOnTop ? "checked" : ""
        } />
      </label>
      <div class="field">
        <span class="field-label">Meters</span>
        <div class="meter-list">
          <div class="meter-row meter-head"><span></span><span>Ring</span><span>Bar</span><span>Mini</span></div>
          ${listMeters(state.usage).map((m) => meterRow(m, meterDisplay(state.config, m))).join("")}
        </div>
      </div>
      <div class="field row">
        <span class="field-label">Minimized style</span>
        <div class="seg-toggle">
          <label class="seg ${state.config.compactStyle === "bars" ? "on" : ""}">
            <input type="radio" name="cstyle" value="bars" ${
              state.config.compactStyle === "bars" ? "checked" : ""
            } data-action="set-compact-style" />Bars
          </label>
          <label class="seg ${state.config.compactStyle === "rings" ? "on" : ""}">
            <input type="radio" name="cstyle" value="rings" ${
              state.config.compactStyle === "rings" ? "checked" : ""
            } data-action="set-compact-style" />Rings
          </label>
        </div>
      </div>
      <div class="hint">Token stays local and is sent only to api.anthropic.com. Refresh is owned by Claude Code.</div>
      ${diagnostics(state)}
      <div class="version">Claude Usage Widget v${escapeHtml(APP_VERSION)}</div>
    </div>
  </div>`;
}

declare const __APP_VERSION__: string | undefined;
const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** The last usage response, pretty-printed, so unexpected meters can be reported. */
function diagnostics(state: UiState): string {
  const raw = state.usage?.rawJson ?? "";
  let pretty = raw;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // keep the body as received
  }
  return `
      <details class="diag">
        <summary>Raw usage response</summary>
        <button class="btn" data-action="copy-raw" ${raw ? "" : "disabled"}>Copy to clipboard</button>
        <textarea class="raw" readonly data-no-drag spellcheck="false">${escapeHtml(
          pretty || "No response yet.",
        )}</textarea>
      </details>`;
}

const METER_KIND_TITLES = { ring: "Show as ring", bar: "Show as bar", mini: "Show when minimized" };

function meterRow(m: Meter, d: MeterDisplay): string {
  const box = (kind: keyof MeterDisplay): string =>
    `<input type="checkbox" data-action="set-meter" data-meter="${escapeHtml(m.id)}" data-kind="${kind}" ${
      d[kind] ? "checked" : ""
    } title="${METER_KIND_TITLES[kind]}" />`;
  return `
    <div class="meter-row">
      <span class="meter-name" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</span>
      ${box("ring")}
      ${box("bar")}
      ${box("mini")}
    </div>`;
}

function sourceRow(s: Source, selected: boolean): string {
  return `
    <label class="source-row${s.exists ? "" : " missing"}">
      <input type="radio" name="src" value="${escapeHtml(s.id)}" ${selected ? "checked" : ""}
        data-action="select-source" />
      <span class="source-name">${escapeHtml(s.label)}</span>
      <span class="source-state">${s.exists ? "" : "not found"}</span>
    </label>`;
}

function emptyState(title: string, body: string, action: string, actionName = "toggle-settings"): string {
  return `
  <div class="empty">
    <div class="empty-title">${escapeHtml(title)}</div>
    <div class="empty-body">${escapeHtml(body)}</div>
    <button class="btn" data-action="${actionName}">${escapeHtml(action)}</button>
  </div>`;
}
