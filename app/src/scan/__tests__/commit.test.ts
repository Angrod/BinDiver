import { CommitTracker } from '../commit';

const run = (t: CommitTracker, keys: Array<string | null>) => keys.map((k) => t.push(k));

describe('CommitTracker', () => {
  it('commits on the third consecutive read only', () => {
    const t = new CommitTracker();
    expect(run(t, ['a', 'a'])).toEqual([null, null]);
    expect(t.push('a')).toBe('a');
    expect(t.current).toBe('a');
  });
  it('does not commit the current key again', () => {
    const t = new CommitTracker();
    run(t, ['a', 'a', 'a']);
    expect(run(t, ['a', 'a', 'a'])).toEqual([null, null, null]);
  });
  it('ignores null without breaking the streak', () => {
    const t = new CommitTracker();
    expect(run(t, ['b', 'b', null, 'b'])).toEqual([null, null, null, 'b']);
  });
  // Final review 2: a frame holding the copyright line means the strip is over a card's bottom, so a read
  // on either side of it isn't the same steady look at one title.
  it('breakStreak starts the count again but keeps the committed card', () => {
    const t = new CommitTracker();
    t.push('a');
    t.push('a');
    t.breakStreak();
    expect(run(t, ['a', 'a'])).toEqual([null, null]);
    expect(t.push('a')).toBe('a');
    t.breakStreak();
    expect(run(t, ['a', 'a', 'a'])).toEqual([null, null, null]);
  });
  it('restarts the streak on a different key', () => {
    const t = new CommitTracker();
    expect(run(t, ['c', 'c', 'd', 'c', 'c'])).toEqual([null, null, null, null, null]);
    expect(t.push('c')).toBe('c');
  });
});
