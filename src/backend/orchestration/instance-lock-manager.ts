/**
 * In-memory lock per resource to avoid conflicting
 * simultaneous operations on the same instance.
 */
export class InstanceLockManager {
  private readonly locks = new Map<string, string>();
  private readonly waiters = new Set<() => void>();

  isLocked(resourceId: string): boolean {
    return this.locks.has(resourceId);
  }

  /** True when any resource is locked with the given purpose (e.g. `"restart"`). */
  hasPurpose(purpose: string): boolean {
    for (const lockedPurpose of this.locks.values()) {
      if (lockedPurpose === purpose) return true;
    }
    return false;
  }

  /**
   * Resolves when no resource holds `purpose`. Used by app quit to wait out a
   * restart lock after stop/backup critical jobs have already finished.
   */
  async waitUntilNoPurpose(purpose: string): Promise<void> {
    while (this.hasPurpose(purpose)) {
      await new Promise<void>((resolve) => {
        const wake = (): void => {
          this.waiters.delete(wake);
          resolve();
        };
        this.waiters.add(wake);
      });
    }
  }

  async withLock<T>(
    resourceId: string,
    purpose: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.locks.has(resourceId)) {
      const owner = this.locks.get(resourceId) ?? "another job";
      throw new Error(
        `Instance already has a running job (${owner}); cannot start ${purpose}`,
      );
    }

    this.locks.set(resourceId, purpose);
    try {
      return await work();
    } finally {
      this.locks.delete(resourceId);
      this.notifyWaiters();
    }
  }

  async tryWithLock<T>(
    resourceId: string,
    purpose: string,
    work: () => Promise<T>,
  ): Promise<{ locked: boolean; value: T | null }> {
    if (this.locks.has(resourceId)) {
      return { locked: true, value: null };
    }
    this.locks.set(resourceId, purpose);
    try {
      return { locked: false, value: await work() };
    } finally {
      this.locks.delete(resourceId);
      this.notifyWaiters();
    }
  }

  private notifyWaiters(): void {
    for (const wake of [...this.waiters]) {
      wake();
    }
  }
}
