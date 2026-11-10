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
}

/** The card's lines for a shown card at this price. Pure: the card redraws it whenever the panel would. */
export function resultCardLines(model: ResultModel, shown: Shown, minCents: number): ResultCardLines {
  const { match } = shown;
  const notes = showsReadAs(match.match) ? [readAsLine(match.lineUsed)] : [];
  if (match.isToken) return { label: null, name: match.name, count: 'Token, not tracked', notes };

  const qualifying = model.groups.reduce((n, g) => n + g.qualifying.length, 0);
  const total = model.groups.reduce((n, g) => n + g.totalVersions, 0);
  const count = qualifying > 0 ? countLine(qualifying, total, minCents) : nothingLines(total, minCents)[0];
  const missing = missingVersion(model.groups, shown.thisVersion);
  if (missing !== null) notes.push(missingVersionLine(missing.setCode, missing.collectorNumber, minCents));
  return { label: model.alert.label, name: match.name, count, notes };
}
