import { ReadTimer } from '../readTimer';

describe('ReadTimer', () => {
  it('times the first card of a run from its first read', () => {
    const t = new ReadTimer();
    t.saw(1000, 'Fireball', 'fb', true);
    t.saw(1200, 'Fireball', 'fb', true);
    expect(t.committed(1400, 'fb', 'Fireball')).toBe(400);
  });
  it('waits out reads of the card just committed, then times the next card', () => {
    const t = new ReadTimer();
    t.saw(0, 'Fireball', 'fb', true);
    t.committed(400, 'fb', 'Fireball');
    t.saw(600, 'Fireball', 'fb', true); //    still the last card
    t.saw(3000, 'Shatter', 'sh', true); //    the next card appears
    t.saw(3200, 'Shatter', 'sh', true);
    expect(t.committed(3400, 'sh', 'Shatter')).toBe(400);
  });
  it('counts unmatched text unless it looks like the card just committed', () => {
    const t = new ReadTimer();
    t.committed(0, 'co', 'Cooperation');
    t.saw(500, 'cpopsraríon', null, false); //  a garble of the last card
    t.saw(2000, 'Grizzly Be', null, false); //  part of the next card
    expect(t.committed(2600, 'gb', 'Grizzly Bears')).toBe(600);
  });
  it('ignores reads with under 3 letters, such as a mana cost', () => {
    const t = new ReadTimer();
    t.committed(0, 'fb', 'Fireball');
    t.saw(100, '2', null, false);
    t.saw(200, '3e', null, false);
    t.saw(900, 'Shatter', 'sh', true);
    expect(t.committed(1500, 'sh', 'Shatter')).toBe(600);
  });
  it('gives null when nothing new was read before the commit, and starts over on reset', () => {
    const t = new ReadTimer();
    t.saw(0, 'Fireball', 'fb', true);
    t.reset();
    expect(t.committed(400, 'fb', 'Fireball')).toBeNull();
  });
  it('takes a loose misread of the card just committed as that card', () => {
    const t = new ReadTimer();
    t.committed(0, 'co', 'Cooperation');
    t.saw(500, 'cpopsraríon', 'coercion', false); // garbled Cooperation, loosely matched to another card
    t.saw(2000, 'Grizzly Bears', 'gb', true);
    expect(t.committed(2400, 'gb', 'Grizzly Bears')).toBe(400);
  });
  it('times a card whose name is like the last one once it matches exactly', () => {
    const t = new ReadTimer();
    t.committed(0, 'cpb', 'Circle of Protection: Black');
    t.saw(1000, 'Circle of Protection: White', 'cpw', true);
    expect(t.committed(1400, 'cpw', 'Circle of Protection: White')).toBe(400);
  });
  it('drops the time so far when the camera stops, keeping the last card', () => {
    const t = new ReadTimer();
    t.committed(0, 'fb', 'Fireball');
    t.saw(1000, 'Shatter', 'sh', true);
    t.interrupt(); //                    paused, or a sheet opened
    t.saw(60000, 'Fireball', 'fb', true); // still the last card
    t.saw(61000, 'Shatter', 'sh', true);
    expect(t.committed(61400, 'sh', 'Shatter')).toBe(400);
  });
});
