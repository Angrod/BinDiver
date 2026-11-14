import type { Db } from '../../db/types';
import type { KnownCard } from '../types';
import { cardName, resolveExact } from './lookup';
import { normalizeName } from './normalize';

const PLAIN = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
export const BASIC_LAND_NAMES: readonly string[] = [...PLAIN, ...PLAIN.map((n) => `Snow-Covered ${n}`)];

/** The basic lands present in this database, each resolved by name. */
export function basicLands(db: Db): KnownCard[] {
  const out: KnownCard[] = [];
  for (const name of BASIC_LAND_NAMES) {
    const r = resolveExact(db, normalizeName(name));
    if (r.match !== 'exact') continue;
    out.push({ oracleId: r.oracleIds[0], name: cardName(db, r.oracleIds[0]) });
  }
  return out;
}
