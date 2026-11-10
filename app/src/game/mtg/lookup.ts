import type { Db } from '../../db/types';
import { sortVersions } from './sort';
import { summarize } from './summary';
import type { CardGroup, NameKind, SortOrder, Version } from './types';

export function resolveExact(
  db: Db,
  norm: string,
): { match: 'exact' | 'token' | 'none'; oracleIds: string[] } {
  const rows = db.all<{ oracle_id: string; kind: NameKind }>(
    'SELECT oracle_id, kind FROM names WHERE norm = ?',
    [norm],
  );
  const full = new Set<string>();
  const face = new Set<string>();
  let token = false;
  for (const r of rows) {
    if (r.kind === 'token') token = true;
    else (r.kind === 'full' ? full : face).add(r.oracle_id);
  }
  // A full card name wins over a face of some other card with the same text.
  const ids = full.size ? full : face;
  if (ids.size) return { match: 'exact', oracleIds: [...ids].sort(byCodePoint) };
  if (token) return { match: 'token', oracleIds: [] };
  return { match: 'none', oracleIds: [] };
}

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Python's _card_name: most-used name; ties go to the shorter (in code points), then alphabetical.
function pickName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best: string | null = null;
  for (const n of counts.keys()) {
    if (best === null) { best = n; continue; }
    const diff =
      counts.get(n)! - counts.get(best)! ||
      [...best].length - [...n].length ||
      byCodePoint(best, n);
    if (diff > 0) best = n;
  }
  return best ?? '';
}

export function cardName(db: Db, oracleId: string): string {
  const rows = db.all<{ name: string }>('SELECT name FROM printings WHERE oracle_id = ?', [oracleId]);
  return pickName(rows.map((r) => r.name));
}

interface Row {
  id: string; name: string; set_code: string; set_name: string; collector_number: string;
  released_at: string; lang: string; finish: string; price_cents: number | null;
  frame_group: string; look_for: string; notes: string | null; same_as: string; symbol_set: string | null; quiet_kind: string;
}

export function lookupGroups(db: Db, oracleIds: string[], minCents: number, order: SortOrder,
  hasQuietKind = true,
): CardGroup[] {
  return [...oracleIds].sort(byCodePoint).map((oracleId) => {
    const rows = db.all<Row>(
      `SELECT p.id, p.name, p.set_code, p.set_name, p.collector_number,
              p.released_at, p.lang, v.finish, v.price_cents,
              v.frame_group, v.look_for, v.notes, v.same_as, p.symbol_set,
              ${hasQuietKind ? 'v.quiet_kind' : "'' AS quiet_kind"}
       FROM printings p JOIN versions v ON v.printing_id = p.id
       WHERE p.oracle_id = ?`,
      [oracleId],
    );
    const versions: Version[] = rows.map((r) => ({
      scryfallId: r.id, setCode: r.set_code, setName: r.set_name,
      collectorNumber: r.collector_number, releasedAt: r.released_at, lang: r.lang,
      finish: r.finish, priceCents: r.price_cents, frameGroup: r.frame_group,
      lookFor: r.look_for, notes: r.notes ? r.notes.split('\n') : [],
      sameAs: JSON.parse(r.same_as) as string[], symbolSet: r.symbol_set, quietKind: r.quiet_kind,
      key: `${r.id}:${r.finish}`,
    }));
    return {
      oracleId,
      name: pickName(rows.map((r) => r.name)),
      qualifying: sortVersions(
        versions.filter((v) => v.priceCents !== null && v.priceCents >= minCents), order),
      unpriced: sortVersions(versions.filter((v) => v.priceCents === null), order),
      totalVersions: versions.length,
      summary: summarize(versions, minCents),
      versionsByKey: new Map(versions.map((v) => [v.key, v])),
    };
  });
}
