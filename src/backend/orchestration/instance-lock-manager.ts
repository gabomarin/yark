/**
 * In-memory lock per resource to avoid conflicting
 * simultaneous operations on the same instance.
 */
export class InstanceLockManager {
  private readonly locks = new Map<string, string>();

  isLocked(resourceId: string): boolean {
    return this.locks.has(resourceId);
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
    }
  }
}
