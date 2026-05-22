import pLimit from 'p-limit'

/**
 * Concurrency budget for fan-out call sites that hydrate auxiliary data
 * (channel metadata, creator names, individual mark-done operations).
 *
 * Today these scale with workspace size and are invisible; the day someone
 * runs against a 200-thread workspace they otherwise blow through the
 * undici socket pool / API rate limiter. A small ceiling caps the burst
 * without slowing the common small case.
 */
export const FANOUT_CONCURRENCY = 8

/**
 * `Promise.all` with a bounded concurrency budget. Use at every fan-out
 * site so the choice stays consistent and a single tweak (limit, retry,
 * tracing) lands in one place instead of three.
 *
 * Each item runs `worker(item)` through a fresh `p-limit` instance — the
 * limit is per-call, not shared across sites, so unrelated tools can't
 * starve each other.
 */
export async function limitedAll<T, R>(
    items: readonly T[],
    worker: (item: T) => Promise<R>,
    concurrency: number = FANOUT_CONCURRENCY,
): Promise<R[]> {
    const limit = pLimit(concurrency)
    return Promise.all(items.map((item) => limit(() => worker(item))))
}
