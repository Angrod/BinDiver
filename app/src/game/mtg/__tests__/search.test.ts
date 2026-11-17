import path from 'node:path';
import { openNodeDb } from '../../../testing/nodeDb';
import { oldFormatCopy } from '../../../testing/oldFormat';
import { createMtgGame } from '../index';
import { parseSearch } from '../search';

const goldenPath = path.join(__dirname, '../__fixtures__/golden.sqlite');

const setNumber = (set: string, number: string) => ({ kind: 'set-number', pairs: [{ set, number }] });

describe('parseSearch', () => {
  test.each([
    ['MOM 123', setNumber('mom', '123')],
    ['mom 0123', setNumber('mom', '123')],
    ['123 MOM', setNumber('mom', '123')],
    ['R 0123 MOM', setNumber('mom', '123')],
    ['MOM 123/281', setNumber('mom', '123')],
    ['MOM 250P', setNumber('mom', '250p')],
    ['7ED 253★', setNumber('7ed', '253★')],
    ['7ed 253*', setNumber('7ed', '253★')],
    ['10E 252', setNumber('10e', '252')],
    ['KLD-242', setNumber('plst', 'kld-242')],
    ['plst KLD-242', setNumber('plst', 'kld-242')],
    ['38/143', { kind: 'number-total', number: '38', total: 143 }],
    ['038 / 143', { kind: 'number-total', number: '38', total: 143 }],
    ['Fire 2', setNumber('fire', '2')],
    ['Fireball', { kind: 'name' }],
    ['123', { kind: 'number', number: '123' }],
    ['0420', { kind: 'number', number: '420' }],
    ['250p', { kind: 'number', number: '250p' }],
    ['R 420', { kind: 'number', number: '420' }],
    ['325*', { kind: 'number', number: '325★' }],
    ['7ed', { kind: 'name' }],
    ['Jace, the Mind Sculptor', { kind: 'name' }],
    ['', { kind: 'name' }],
  ])('%j', (text, expected) => {
    expect(parseSearch(text)).toEqual(expected);
  });
});

describe('game search', () => {
  const db = openNodeDb(goldenPath);
  afterAll(() => db.close());
  const game = createMtgGame(db);

  test.each(['2XM 44', '44 2xm', 'C 0044 2XM'])('findPrinting(%j) is Brainstorm 2xm 44', (t) => {
    const hit = game.findPrinting(t);
    expect(hit?.printing).toMatchObject({ name: 'Brainstorm', setCode: '2xm', collectorNumber: '44' });
    expect(hit?.match).toMatchObject({ name: 'Brainstorm', match: 'typed', isToken: false });
  });
  test('star numbers and The List', () => {
    expect(game.findPrinting('7ed 253*')?.printing).toMatchObject({ name: 'Llanowar Elves', collectorNumber: '253★' });
    expect(game.findPrinting('C18-222')?.printing).toMatchObject({ name: 'Sol Ring', setCode: 'plst' });
  });
  test('no printing', () => {
    expect(game.findPrinting('Fire 2')).toBeNull();
    expect(game.findPrinting('ZZZ 1')).toBeNull();
  });
  test('searchKind', () => {
    expect(game.searchKind('2XM 44')).toBe('set-number');
    expect(game.searchKind('61/350')).toBe('number-total');
    expect(game.searchKind('Fireball')).toBe('name');
    expect(game.searchKind('420')).toBe('number');
  });
  const artistId = (name: string) => {
    const a = game.artistOptions(name, 5).find((o) => o.name === name);
    if (!a) throw new Error(`no artist ${name}`);
    return a.id;
  };
  test('numberCandidates', () => {
    const c = game.numberCandidates('61/350', null);
    const names = c.map((p) => `${p.name}:${p.setCode}`);
    expect(names).toContain('Counterspell:6ed');
    expect(names).toContain('Brainstorm:mmq');
    expect(c.every((p) => p.releasedAt >= '1998-01-01')).toBe(true);
    expect(game.numberCandidates('77/460', null).some((p) => p.setCode === '5ed')).toBe(false);
    expect(game.numberCandidates('Fireball', null)).toEqual([]);
  });
  test('a bare number: every printing so numbered from 1998 on, oldest first', () => {
    const c = game.numberCandidates('61', null);
    expect(c.map((p) => `${p.name}:${p.setCode}`)).toEqual([
      'Counterspell:6ed', 'Brainstorm:mmq', 'Brainstorm:cst', 'Island:ddo', 'Island:gnt', 'Counterspell:fdc',
    ]);
  });
  test('the artist narrows a number, before the limit is applied', () => {
    expect(game.numberCandidates('61', artistId('Hannibal King')).map((p) => p.setCode)).toEqual(['6ed']);
    expect(game.numberCandidates('61/350', artistId('Hannibal King')).map((p) => p.setCode)).toEqual(['6ed']);
    expect(game.numberCandidates('61', artistId('Christopher Rush')).map((p) => p.setCode)).toEqual(['cst']);
  });
  test('artistOptions: every artist whose name or a word of it starts with the text, A to Z', () => {
    expect(game.artistOptions('hann', 5)).toEqual([{ id: expect.any(Number), name: 'Hannibal King' }]);
    expect(game.artistOptions('king', 5).map((o) => o.name)).toContain('Hannibal King');
    expect(game.artistOptions('christopher', 5).map((o) => o.name)).toEqual(['Christopher Moeller', 'Christopher Rush']);
    expect(game.artistOptions('christopher', 1)).toHaveLength(1);
    expect(game.artistOptions('honore', 5).map((o) => o.name)).toEqual(['Alexandre Honoré']);
    expect(game.artistOptions('  ', 5)).toEqual([]);
  });
  test('artistCards: the names of an artist\'s cards, A to Z, once each', () => {
    expect(game.artistCards(artistId('Hannibal King'))).toEqual(['Counterspell']);
    const rush = game.artistCards(artistId('Christopher Rush'));
    expect(rush).toContain('Brainstorm');
    expect(new Set(rush).size).toBe(rush.length);
    expect([...rush].sort((a, b) => a.localeCompare(b))).toEqual(rush);
  });

  describe('old-format database', () => {
    const old = oldFormatCopy(goldenPath);
    afterAll(() => old.close());
    const oldGame = createMtgGame(old);
    test('number searches are off', () => {
      expect(oldGame.searchKind('2XM 44')).toBe('name');
      expect(oldGame.findPrinting('2XM 44')).toBeNull();
      expect(oldGame.numberCandidates('61/350', null)).toEqual([]);
      expect(oldGame.numberCandidates('61', null)).toEqual([]);
      expect(oldGame.artistOptions('hann', 5)).toEqual([]);
      expect(oldGame.artistCards(1)).toEqual([]);
    });
  });
});
