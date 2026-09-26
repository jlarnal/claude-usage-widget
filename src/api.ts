// Typed wrappers around the Tauri command + plugin surface.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, PhysicalSize } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";

import type { AppConfig, Source, StatsHistory, UsageSnapshot } from "./types";

export const discoverSources = () => invoke<Source[]>("discover_sources");

export const fetchUsage = (path: string) =>
  invoke<UsageSnapshot>("fetch_usage", { path });

export const readStats = (path: string, days = 14) =>
  invoke<StatsHistory>("read_stats", { path, days });

export const getConfig = () => invoke<AppConfig>("get_config");

export const setConfig = (config: AppConfig) =>
  invoke<void>("set_config", { config });

/** Native file picker for adding a custom `.credentials.json` path. */
export async function browseCredentials(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Select .credentials.json",
    filters: [{ name: "credentials", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function hideWindow(): Promise<void> {
  await getCurrentWindow().hide();
}

export async function setAlwaysOnTop(value: boolean): Promise<void> {
  await getCurrentWindow().setAlwaysOnTop(value);
}

/** The window's current inner size in CSS pixels plus its scale factor. */
export async function windowSize(): Promise<{ w: number; h: number; scale: number }> {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const inner = (await win.innerSize()).toLogical(scale);
  return { w: Math.round(inner.width), h: Math.round(inner.height), scale };
}

/** The floor from tauri.conf.json, restored before every resize. */
const MIN_W = 180;
const MIN_H = 76;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Resize to `width`×`height` CSS pixels.
 *
 * Windows applies the resize asynchronously (tao issues SetWindowPos with
 * SWP_ASYNCWINDOWPOS), so this uses two mechanisms: the plain resize, then a
 * minimum-size constraint equal to the target, which makes Windows re-check
 * the window bounds and grow it if the first request was dropped. The size is
 * read back after a short wait and, if still smaller, set again in physical
 * pixels (DPI scale not yet applied).
 */
export async function setWindowSize(width: number, height: number): Promise<void> {
  const win = getCurrentWindow();
  await win.setMinSize(new LogicalSize(MIN_W, MIN_H));
  await win.setSize(new LogicalSize(width, height));
  await win.setMinSize(new LogicalSize(width, height));
  await sleep(150);
  const got = await windowSize();
  if (got.w < width || got.h < height) {
    await win.setSize(
      new PhysicalSize(Math.round(width * got.scale), Math.round(height * got.scale)),
    );
  }
}

export async function startDragging(): Promise<void> {
  await getCurrentWindow().startDragging();
}
