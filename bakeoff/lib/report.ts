/**
 * Pure formatting/writing helpers for the bakeoff reports (markdown + JSON).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.ts';

/** Render a GitHub-flavoured markdown table. */
export function mdTable(headers: string[], rows: Array<Array<string | number>>): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((c) => String(c)).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

/** Percentage string, or 'n/a' when the denominator is zero. */
export function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`;
}

/** Filename-safe `YYYY-MM-DD-HHmm` from an ISO timestamp string. */
export function fileTimestamp(nowIso: string): string {
  const d = new Date(nowIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}-${hh}${min}`;
}

/** Write `<basename>.md` and `<basename>.json` into PATHS.reports. */
export function writeReport(
  basename: string,
  markdown: string,
  json: unknown
): { mdPath: string; jsonPath: string } {
  mkdirSync(PATHS.reports, { recursive: true });
  const mdPath = path.join(PATHS.reports, `${basename}.md`);
  const jsonPath = path.join(PATHS.reports, `${basename}.json`);
  writeFileSync(mdPath, markdown);
  writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  return { mdPath, jsonPath };
}
