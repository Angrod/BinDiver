import { ReadTimer } from '../readTimer';

describe('ReadTimer', () => {
  it('times the first card of a run from its first read', () => {
    const t = new ReadTimer();
    t.saw(1000, 'Fireball', 'fb');
    t.saw(1200, 'Fireball', 'fb');
    expect(t.committed(1400, 'fb', 'Fireball')).toBe(400);
  });
  it('waits out reads of the card just committed, then times the next card', () => {
    const t = new ReadTimer();
    t.saw(0, 'Fireball', 'fb');
    t.committed(400, 'fb', 'Fireball');
    t.saw(600, 'Fireball', 'fb'); //    still the last card
    t.saw(3000, 'Shatter', 'sh'); //    the next card appears
    t.saw(3200, 'Shatter', 'sh');
    expect(t.committed(3400, 'sh', 'Shatter')).toBe(400);
  });
  it('counts unmatched text unless it looks like the card just committed', () => {
    const t = new ReadTimer();
    t.committed(0, 'co', 'Cooperation');
    t.saw(500, 'cpopsraríon', null); //  a garble of the last card
    t.saw(2000, 'Grizzly Be', null); //  part of the next card
    expect(t.committed(2600, 'gb', 'Grizzly Bears')).toBe(600);
  });
  it('ignores reads with under 3 letters, such as a mana cost', () => {
    const t = new ReadTimer();
    t.committed(0, 'fb', 'Fireball');
    t.saw(100, '2', null);
    t.saw(200, '3e', null);
    t.saw(900, 'Shatter', 'sh');
    expect(t.committed(1500, 'sh', 'Shatter')).toBe(600);
  });
  it('gives null when nothing new was read before the commit, and starts over on reset', () => {
    const t = new ReadTimer();
    t.saw(0, 'Fireball', 'fb');
    t.reset();
    expect(t.committed(400, 'fb', 'Fireball')).toBeNull();
  });
});
