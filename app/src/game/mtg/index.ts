import type { Db } from '../../db/types';
import type { CardMatch, Game } from '../types';
import { cardName, lookupGroups, resolveExact } from './lookup';
import { buildNameIndex, looseLine, matchLine, prefixMatches } from './match';
import { normalizeName } from './normalize';
import type { NameKind } from './types';

export function createMtgGame(db: Db): Game {
  const rows = db.all<{ norm: string; kind: NameKind }>('SELECT norm, kind FROM names');
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

  return {
    matchTitle(line) {
      const m = matchLine(index, line);
      return m ? resolve(m.norm, m.kind, m.lineUsed) : null;
    },
    matchTitleLoose(line) {
      const m = looseLine(index, line);
      return m ? resolve(m.norm, m.kind, m.lineUsed) : null;
    },
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
    lookup: (oracleIds, minCents, order) => lookupGroups(db, oracleIds, minCents, order),
    setIcon(code) {
      if (code === 'none') return null;
      const row = db.get<{ icon_svg: string | null }>('SELECT icon_svg FROM sets WHERE code = ?', [code]);
      return row?.icon_svg ?? null;
    },
  };
}
