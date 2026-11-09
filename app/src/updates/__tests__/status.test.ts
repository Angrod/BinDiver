import { codeLabel, formatCodeStatus, UPDATE_CHECK_GAP_MS, UpdateChecker, type UpdatesApi } from '../status';

describe('codeLabel', () => {
  it('names the update the app is running, by the start of its ID', () => {
    expect(codeLabel(true, { isEmbeddedLaunch: false, updateId: '01a1c151-1f14-7568-8b09-444da18e571a' })).toBe('update 01a1c151');
  });
  it('says when the app runs the code it was built with', () => {
    expect(codeLabel(true, { isEmbeddedLaunch: true, updateId: '0ab3' })).toBe('built-in code');
    expect(codeLabel(true, { isEmbeddedLaunch: false })).toBe('built-in code');
  });
  it('says when updates are off, as in a development build', () => {
    expect(codeLabel(false, { isEmbeddedLaunch: true })).toBe('updates off');
  });
});

describe('formatCodeStatus', () => {
  it('adds a note when a newer update has downloaded', () => {
    expect(formatCodeStatus('update 01a1c151', false)).toBe('update 01a1c151');
    expect(formatCodeStatus('built-in code', true)).toBe('built-in code · newer update ready: close and reopen');
  });
});

function fakeApi(isAvailable: boolean | Error) {
  const calls = { check: 0, fetch: 0 };
  let release: () => void = () => {};
  const gate = { hold: false };
  const api: UpdatesApi = {
    checkForUpdateAsync: async () => {
      calls.check++;
      if (gate.hold) await new Promise<void>((r) => { release = r; });
      if (isAvailable instanceof Error) throw isAvailable;
      return { isAvailable };
    },
    fetchUpdateAsync: async () => { calls.fetch++; return {}; },
  };
  return { api, calls, gate, release: () => release() };
}

describe('UpdateChecker', () => {
  it('downloads a newer update when the server has one', async () => {
    const f = fakeApi(true);
    expect(await new UpdateChecker(f.api).check(0)).toBe('downloaded');
    expect(f.calls).toEqual({ check: 1, fetch: 1 });
  });
  it('downloads nothing when the app is up to date', async () => {
    const f = fakeApi(false);
    expect(await new UpdateChecker(f.api).check(0)).toBe('up to date');
    expect(f.calls).toEqual({ check: 1, fetch: 0 });
  });
  it('checks at most once a minute', async () => {
    const f = fakeApi(false);
    const c = new UpdateChecker(f.api);
    await c.check(1_000);
    expect(await c.check(1_000 + UPDATE_CHECK_GAP_MS - 1)).toBe('skipped');
    expect(await c.check(1_000 + UPDATE_CHECK_GAP_MS)).toBe('up to date');
    expect(f.calls.check).toBe(2);
    expect(UPDATE_CHECK_GAP_MS).toBe(60_000);
  });
  it('never runs two checks at once', async () => {
    const f = fakeApi(false);
    f.gate.hold = true;
    const c = new UpdateChecker(f.api);
    const first = c.check(0);
    expect(await c.check(UPDATE_CHECK_GAP_MS * 2)).toBe('skipped');
    f.release();
    expect(await first).toBe('up to date');
    expect(f.calls.check).toBe(1);
  });
  it('reports a failed check instead of throwing', async () => {
    const f = fakeApi(new Error('offline'));
    const warnings: unknown[] = [];
    const c = new UpdateChecker(f.api, (_msg, e) => warnings.push(e));
    expect(await c.check(0)).toBe('failed');
    expect(warnings).toEqual([new Error('offline')]);
    expect(await c.check(UPDATE_CHECK_GAP_MS)).toBe('failed');
  });
});
