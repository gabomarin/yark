/**
 * Lock en memoria por recurso para evitar operaciones conflictivas
 * simultáneas sobre una misma instancia.
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
      const owner = this.locks.get(resourceId) ?? "otro job";
      throw new Error(
        `La instancia ya tiene un job en ejecución (${owner}); no se puede iniciar ${purpose}`,
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
