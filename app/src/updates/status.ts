/** What the grey line needs to know about the code the app launched with. */
export interface RunningCode {
  isEmbeddedLaunch: boolean;
  updateId?: string;
}

/** Which code is running: an update by the start of its ID, the code built into the app, or none (updates off). */
export function codeLabel(updatesEnabled: boolean, running: RunningCode): string {
  if (!updatesEnabled) return 'updates off';
  if (running.isEmbeddedLaunch || !running.updateId) return 'built-in code';
  return `update ${running.updateId.slice(0, 8)}`;
}

/** The label, plus a note once a newer update has downloaded (it runs from the next fresh start). */
export function formatCodeStatus(label: string, newerReady: boolean): string {
  return newerReady ? `${label} · newer update ready: close and reopen` : label;
}

/** The two expo-updates calls the checker makes. */
export interface UpdatesApi {
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync(): Promise<unknown>;
}

/** The shortest time between two checks, so flicking in and out of the app doesn't call the server each time. */
export const UPDATE_CHECK_GAP_MS = 60_000;

export type CheckResult = 'skipped' | 'up to date' | 'downloaded' | 'failed';

/**
 * Checks for a newer update and downloads it, for when the app comes back to the screen: iOS resumes a
 * backgrounded app without the launch-time check, so an update could otherwise wait for a fresh start
 * just to be found. A downloaded update still runs from the next fresh start.
 */
export class UpdateChecker {
  private lastAt: number | null = null;
  private busy = false;

  constructor(
    private readonly api: UpdatesApi,
    private readonly warn: (message: string, error: unknown) => void = (m, e) => console.warn(m, e),
  ) {}

  /** At most once per UPDATE_CHECK_GAP_MS and never two at once; a failure is reported, not thrown. */
  async check(nowMs: number): Promise<CheckResult> {
    if (this.busy || (this.lastAt !== null && nowMs - this.lastAt < UPDATE_CHECK_GAP_MS)) return 'skipped';
    this.busy = true;
    this.lastAt = nowMs;
    try {
      const { isAvailable } = await this.api.checkForUpdateAsync();
      if (!isAvailable) return 'up to date';
      await this.api.fetchUpdateAsync();
      return 'downloaded';
    } catch (e) {
      this.warn('Update check failed', e);
      return 'failed';
    } finally {
      this.busy = false;
    }
  }
}
