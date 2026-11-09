import type { CardGroup } from '../game/mtg/types';
import type { CardMatch, Game } from '../game/types';
import type { Size } from './geometry';

/**
 * At most one read every 200 ms (about 5 a second).
 * The OCR library's scanText returns the last finished result on every camera frame,
 * so without this the same result would count as 3 reads within 100 ms.
 */
export const READ_INTERVAL_MS = 200;

/**
 * Whether a read at `nowMs` may be sent, given the last one sent at `lastMs` (pass READ_INTERVAL_MS).
 * A clock that went backwards restarts the gap. Runs in the frame worklet, on frame timestamps;
 * no default parameter, since a worklet's default cannot see module constants.
 */
export function readDue(nowMs: number, lastMs: number, intervalMs: number): boolean {
  'worklet';
  return nowMs - lastMs >= intervalMs || nowMs < lastMs;
}

/**
 * Milliseconds per unit of VisionCamera 5.2's Frame.timestamp: iOS reports seconds
 * (CMTime.seconds), Android nanoseconds (CameraX ImageInfo.timestamp).
 */
export function frameMsPerUnit(os: string): number {
  return os === 'android' ? 1e-6 : 1000;
}

/** What the commit tracker compares: the card's oracle IDs, or the name for a token. */
export function commitKey(match: CardMatch | null): string | null {
  if (match === null) return null;
  return match.oracleIds.join(',') || match.name;
}

/** A frame's buffer size and its rotation relative to the screen. */
export interface RawFrameSize {
  width: number;
  height: number;
  orientation: string; // VisionCamera CameraOrientation: 'up' | 'right' | 'down' | 'left'
}

/** The frame's size as the screen shows it: a quarter-turned buffer has its sides swapped. */
export function displayFrameSize(raw: RawFrameSize): Size {
  const sideways = raw.orientation === 'left' || raw.orientation === 'right';
  return sideways ? { width: raw.height, height: raw.width } : { width: raw.width, height: raw.height };
}

/** How many versions qualify across the card's groups. */
export function qualifyingVersions(groups: CardGroup[]): number {
  return groups.reduce((n, g) => n + g.qualifying.length, 0);
}

/** A read's match: the first candidate line that matched, and the lines that matched nothing. */
export interface CandidateMatch {
  match: CardMatch | null;
  matchedText: string;
  /** Candidates that matched nothing (a line whose match threw is left out). */
  noMatch: string[];
}

/**
 * Matches a read's candidate lines in order: every line strictly first, then every line loosely, so a
 * loose match on the joined row can't beat an exact match on one of its lines.
 */
export function matchCandidates(game: Pick<Game, 'matchTitle'>, candidates: string[]): CandidateMatch {
  const failed = new Set<string>();
  for (const loose of [false, true]) {
    for (const candidate of candidates) {
      if (failed.has(candidate)) continue;
      let match: CardMatch | null;
      try {
        match = game.matchTitle(candidate, loose);
      } catch (e) {
        console.warn('matchTitle failed', e);
        failed.add(candidate);
        continue;
      }
      if (match !== null) return { match, matchedText: candidate, noMatch: [] };
    }
  }
  return { match: null, matchedText: '', noMatch: candidates.filter((c) => !failed.has(c)) };
}
