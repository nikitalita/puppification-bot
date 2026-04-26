/**
 * Per-key serial FIFO promise chain.
 *
 * The bot must preserve message ordering per user: if user A sends
 * messages M1 then M2 in quick succession, M2's puppified relay must
 * not appear before M1's even if M1 happens to take longer to
 * classify. At the same time we want different users (different keys)
 * to process in parallel so a slow classification for user A doesn't
 * stall user B.
 *
 * Implementation: a `Map<key, tailPromise>`. `enqueue(key, work)`
 * chains `work` onto the current tail (catching and discarding the
 * previous error so a failure doesn't poison the chain) and replaces
 * the tail. When the chain drains (the tail entry resolves and is
 * still the latest), we delete the map entry to avoid leaking memory
 * across many users.
 */
const tails = new Map<string, Promise<unknown>>();

export function enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.then(work, work);
  tails.set(key, next);
  void next.finally(() => {
    if (tails.get(key) === next) {
      tails.delete(key);
    }
  });
  return next as Promise<T>;
}

/** Number of distinct active queue keys. Mostly for tests / debugging. */
export function activeQueueCount(): number {
  return tails.size;
}

/** Drop all queue tails. Tests only. */
export function _resetQueues(): void {
  tails.clear();
}
