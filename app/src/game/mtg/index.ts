import type { Db } from '../../db/types';
import type { ArtistOption, CardMatch, Game, PrintingRef } from '../types';
import { isFooterLine } from './footer';
import { basicLands } from './basics';
import { dataFeatures } from './features';
import { cardName, lookupGroups, resolveExact } from './lookup';
import { buildNameIndex, looseLine, matchLine, prefixMatches } from './match';
import { normalizeName } from './normalize';
import { parseSearch } from './search';
import type { NameKind } from './types';

interface PrintingRow {
  id: string; oracle_id: string; name: string; set_code: string; set_name: string;
  collector_number: string; released_at: string; artist_id: number | null; artist: string | null;
  symbol_set: string | null;
}

const PRINTING_SELECT = `SELECT p.id, p.oracle_id, p.name, p.set_code, p.set_name, p.collector_number,
  p.released_at, p.artist_id, a.name AS artist, p.symbol_set
  FROM printings p`;

function toRef(r: PrintingRow): PrintingRef {
  return {
    oracleId: r.oracle_id, name: r.name, scryfallId: r.id, setCode: r.set_code, setName: r.set_name,
    collectorNumber: r.collector_number, releasedAt: r.released_at, artistId: r.artist_id,
    artist: r.artist, symbolSet: r.symbol_set,
  };
}

export function createMtgGame(db: Db): Game {
  const rows = db.all<{ norm: string; kind: NameKind }>('SELECT norm, kind FROM names');
  const features = dataFeatures(db);
  const index = buildNameIndex(rows.map((r): [string, NameKind] => [r.norm, r.kind]));

  // Turns a matched norm into a card; a token has no oracle IDs and is named by its norm.
  function resolve(
    norm: string, match: CardMatch['match'], lineUsed: string,
  ): CardMatch | null {
    const r = resolveExact(db, norm);
    if (r.match === 'none') return null;
    if (r.match === 'token') return { oracleIds: [], name: norm, match, isToken: true, lineUsed };
    return { oracleIds: r.oracleIds, name: cardName(db, r.oracleIds[0]), match, isToken: false, lineUsed };
  }

  function find(typed: string): CardMatch | null {
    const norm = normalizeName(typed);
    const exact = resolve(norm, 'typed', norm);
    if (exact) return exact;
    const m = matchLine(index, typed);
    return m ? resolve(m.norm, 'typed', m.lineUsed) : null;
  }

  const numberSearch = features.numberSearch;

  return {
    searchKind(text) {
      return numberSearch ? parseSearch(text).kind : 'name';
    },
    findPrinting(text) {
      if (!numberSearch) return null;
      const parsed = parseSearch(text);
      if (parsed.kind !== 'set-number') return null;
      for (const { set, number } of parsed.pairs) {
        const row = db.get<PrintingRow>(
          `${PRINTING_SELECT} LEFT JOIN artists a ON a.id = p.artist_id
           WHERE p.set_code = ? AND p.collector_number = ? COLLATE NOCASE
           ORDER BY (p.lang = 'en') DESC, p.id LIMIT 1`,
          [set, number],
        );
        if (!row) continue;
        const match: CardMatch = {
          oracleIds: [row.oracle_id], name: cardName(db, row.oracle_id), match: 'typed',
          isToken: false, lineUsed: text.trim(),
        };
        return { match, printing: toRef(row) };
      }
      return null;
    },
    numberCandidates(text) {
      if (!numberSearch) return [];
      const parsed = parseSearch(text);
      if (parsed.kind !== 'number-total') return [];
      return db.all<PrintingRow>(
        `${PRINTING_SELECT} JOIN sets s ON s.code = p.set_code
           LEFT JOIN artists a ON a.id = p.artist_id
           WHERE p.collector_number = ? AND s.printed_total = ? AND p.released_at >= '1998-01-01'
           ORDER BY p.released_at, p.set_code, p.id LIMIT 50`,
        [parsed.number, parsed.total],
      ).map(toRef);
    },
    artistOptions(candidates, typed, limit) {
      const q = normalizeName(typed);
      if (!q) return [];
      const found = new Map<number, ArtistOption>();
      for (const c of candidates) {
        if (c.artistId === null || !c.artist || found.has(c.artistId)) continue;
        const norm = normalizeName(c.artist);
        if (norm.startsWith(q) || norm.split(' ').some((w) => w.startsWith(q))) {
          found.set(c.artistId, { id: c.artistId, name: c.artist });
        }
      }
      return [...found.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
    },
    matchTitle(line) {
      const m = matchLine(index, line);
      return m ? resolve(m.norm, m.kind, m.lineUsed) : null;
    },
    matchTitleLoose(line) {
      const m = looseLine(index, line);
      return m ? resolve(m.norm, m.kind, m.lineUsed) : null;
    },
    isFooterText: isFooterLine,
    find,
    suggest(typed, limit) {
      const names: string[] = [];
      for (const norm of prefixMatches(index, typed, limit)) {
        const c = resolve(norm, 'typed', norm);
        if (c && !names.includes(c.name)) names.push(c.name);
      }
      if (names.length) return names;
      const f = find(typed);
      return f && !f.isToken ? [f.name] : [];
    },
    quietKinds: ['old border', 'Secret Lair', 'serialized'],
    numberSearch,
    basicLands: () => basicLands(db),
    lookup: (oracleIds, minCents, order) =>
      lookupGroups(db, oracleIds, minCents, order, features.quietKind),
    setIcon(code) {
      if (code === 'none') return null;
      const row = db.get<{ icon_svg: string | null }>('SELECT icon_svg FROM sets WHERE code = ?', [code]);
      return row?.icon_svg ?? null;
    },
  };
}
