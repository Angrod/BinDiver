/** Commits a key once it has been read `required` times in a row. */
export class CommitTracker {
  private lastKey: string | null = null;
  private streak = 0;
  private committed: string | null = null;

  constructor(private readonly required: number = 3) {}

  /** Returns the key when a new card commits, otherwise null. null input is ignored. */
  push(key: string | null): string | null {
    if (key === null) return null;
    if (key === this.lastKey) {
      this.streak += 1;
    } else {
      this.lastKey = key;
      this.streak = 1;
    }
    if (this.streak >= this.required && key !== this.committed) {
      this.committed = key;
      return key;
    }
    return null;
  }

  /** Starts the count again (a frame that can't hold a title), keeping the committed card. */
  breakStreak(): void {
    this.lastKey = null;
    this.streak = 0;
  }

  get current(): string | null {
    return this.committed;
  }
}
