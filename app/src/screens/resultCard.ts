import { missingVersion, type ResultModel, type Shown } from '../scan/result';
import { showsReadAs } from './format';
import { countLine, missingVersionLine, nothingLines, readAsLine } from './resultView';

/** The small result card over the camera: the label, the card's name, its count and any notes. */
export interface ResultCardLines {
  /** The alert's label ("Worth finding", the quiet label, "Known…"); null when there is none. */
  label: string | null;
  name: string;
  /** The count over every group ("4 of 49 versions at $10+"), "Nothing at $10+", or a token's line. */
  count: string;
  /** Muted lines: the read-as line for a misread, then the typed version's "This version" line. */
  notes: string[];
  /** The group's value summary without its "(n of m)" counts; null unless one group has versions at the price and the card isn't known. */
  hint: string | null;
}

/** A value summary with every " (<n> of <m>)" removed, nothing else changed. */
export function valueHint(summary: string): string {
  return summary.replace(/ \(\d+ of \d+\)/g, '');
}

/** The card's lines for a shown card at this price. Pure: the card redraws it whenever the panel would. */
export function resultCardLines(model: ResultModel, shown: Shown, minCents: number): ResultCardLines {
  const { match } = shown;
  const notes = showsReadAs(match.match) ? [readAsLine(match.lineUsed)] : [];
  if (match.isToken) return { label: null, name: match.name, count: 'Token, not tracked', notes, hint: null };

  const qualifying = model.groups.reduce((n, g) => n + g.qualifying.length, 0);
  const total = model.groups.reduce((n, g) => n + g.totalVersions, 0);
  const count = qualifying > 0 ? countLine(qualifying, total, minCents) : nothingLines(total, minCents)[0];
  const missing = missingVersion(model.groups, shown.thisVersion);
  if (missing !== null) notes.push(missingVersionLine(missing.setCode, missing.collectorNumber, minCents));
  const withVersions = model.groups.filter((g) => g.qualifying.length > 0);
  const hint = withVersions.length === 1 && !model.alert.known ? valueHint(withVersions[0].summary) : null;
  return { label: model.alert.label, name: match.name, count, notes, hint };
}

/** The most lines a note wraps to on the card. */
export const NOTE_MAX_LINES = 2;

/**
 * How many lines each note may wrap to: NOTE_MAX_LINES, fewer when the room left under the card's head (`spare`,
 * in points) won't hold them, but never less than one. Each note takes `gap` above it and `lineHeight` a line.
 */
export function noteLines(spare: number, notes: number, lineHeight: number, gap: number): number {
  const fit = Math.floor((spare / notes - gap) / lineHeight);
  return Math.min(NOTE_MAX_LINES, Math.max(1, fit));
}

/** The most lines the hint wraps to: this many with no notes, one fewer with notes. */
export const HINT_MAX_LINES = 3;

/**
 * How many lines the hint may wrap to: HINT_MAX_LINES (one fewer when there are notes), fewer when the room left
 * under the card's head (`spare`, in points) won't hold them, never less than one. It takes `gap` above it.
 */
export function hintLines(spare: number, hasNotes: boolean, lineHeight: number, gap: number): number {
  const fit = Math.floor((spare - gap) / lineHeight);
  return Math.min(hasNotes ? HINT_MAX_LINES - 1 : HINT_MAX_LINES, Math.max(1, fit));
}
