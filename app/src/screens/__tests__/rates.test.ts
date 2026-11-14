import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { createMtgGame } from '../../game/mtg';
import { NO_MARKS, PRESET_CENTS, type KnownMarks } from '../../alert/alert';
import { presetRates } from '../rates';

const db = openNodeDb(path.join(__dirname, '../../game/mtg/__fixtures__/golden.sqlite'));
afterAll(() => db.close());
const game = createMtgGame(db);

const goldenIds = db.all<{ oracle_id: string }>('SELECT DISTINCT oracle_id FROM printings').map((r) => r.oracle_id);
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ oracleIds: [goldenIds[i % goldenIds.length]] }));

describe('presetRates', () => {
  test('49 cards give null', () => {
    expect(presetRates(game, cards(49), NO_MARKS)).toBeNull();
  });

  test('50 cards: rates fall as the price rises', () => {
    const rates = presetRates(game, cards(50), NO_MARKS);
    expect(rates).not.toBeNull();
    expect([...rates!.keys()]).toEqual([...PRESET_CENTS]);
    expect(rates!.get(200)!).toBeGreaterThanOrEqual(rates!.get(5000)!);
    expect(rates!.get(200)!).toBeGreaterThan(0);
  });

  test('a known card with no kept versions does not alert', () => {
    const all: KnownMarks = { isKnown: () => true, kept: () => new Set<string>() };
    const rates = presetRates(game, cards(50), all);
    expect(rates!.get(200)).toBe(0);
  });
});
