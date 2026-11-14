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
    ['123', { kind: 'name' }],
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
  });
  test('numberCandidates', () => {
    const c = game.numberCandidates('61/350');
    const names = c.map((p) => `${p.name}:${p.setCode}`);
    expect(names).toContain('Counterspell:6ed');
    expect(names).toContain('Brainstorm:mmq');
    expect(c.every((p) => p.releasedAt >= '1998-01-01')).toBe(true);
    expect(game.numberCandidates('77/460').some((p) => p.setCode === '5ed')).toBe(false);
    expect(game.numberCandidates('Fireball')).toEqual([]);
  });
  test('artistOptions', () => {
    const c = game.numberCandidates('61/350');
    expect(game.artistOptions(c, 'hann', 5)).toEqual([{ id: expect.any(Number), name: 'Hannibal King' }]);
  });

  describe('old-format database', () => {
    const old = oldFormatCopy(goldenPath);
    afterAll(() => old.close());
    const oldGame = createMtgGame(old);
    test('number searches are off', () => {
      expect(oldGame.searchKind('2XM 44')).toBe('name');
      expect(oldGame.findPrinting('2XM 44')).toBeNull();
      expect(oldGame.numberCandidates('61/350')).toEqual([]);
    });
  });
});
