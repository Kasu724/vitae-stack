export class ProviderRequestGuardError extends Error {
  public constructor(
    public readonly code: "BUSY" | "CIRCUIT_OPEN" | "RATE_LIMITED",
  ) {
    super("The model provider is temporarily unavailable for another request.");
    this.name = "ProviderRequestGuardError";
  }
}

interface ProviderState {
  active: number;
  consecutiveFailures: number;
  openUntil: number;
  starts: number[];
}

export class ProviderRequestGuard {
  private readonly states = new Map<string, ProviderState>();

  public constructor(
    private readonly now: () => number = Date.now,
    private readonly maxConcurrent = 2,
    private readonly maxStartsPerMinute = 30,
  ) {}

  private state(key: string): ProviderState {
    const existing = this.states.get(key);
    if (existing) return existing;
    const created: ProviderState = {
      active: 0,
      consecutiveFailures: 0,
      openUntil: 0,
      starts: [],
    };
    this.states.set(key, created);
    return created;
  }

  public async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const state = this.state(key);
    const now = this.now();
    if (state.openUntil > now)
      throw new ProviderRequestGuardError("CIRCUIT_OPEN");
    state.starts = state.starts.filter((started) => started > now - 60_000);
    if (state.starts.length >= this.maxStartsPerMinute)
      throw new ProviderRequestGuardError("RATE_LIMITED");
    if (state.active >= this.maxConcurrent)
      throw new ProviderRequestGuardError("BUSY");
    state.active += 1;
    state.starts.push(now);
    try {
      const result = await work();
      state.consecutiveFailures = 0;
      state.openUntil = 0;
      return result;
    } catch (error) {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= 3) {
        state.openUntil = this.now() + 30_000;
        state.consecutiveFailures = 0;
      }
      throw error;
    } finally {
      state.active -= 1;
    }
  }
}

export const providerRequestGuard = new ProviderRequestGuard();
