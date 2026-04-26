import { expect } from 'chai';
import {
  _resetQueues,
  activeQueueCount,
  enqueue,
} from '../src/pipeline/userQueue.ts';

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe('userQueue', () => {
  beforeEach(() => {
    _resetQueues();
  });

  it('serializes work for the same key in submission order', async () => {
    const events: string[] = [];
    const a = enqueue('k1', async () => {
      await delay(40, null);
      events.push('a');
    });
    const b = enqueue('k1', async () => {
      await delay(5, null);
      events.push('b');
    });
    const c = enqueue('k1', async () => {
      await delay(20, null);
      events.push('c');
    });
    await Promise.all([a, b, c]);
    expect(events).to.deep.equal(['a', 'b', 'c']);
  });

  it('runs different keys in parallel', async () => {
    const start = Date.now();
    const a = enqueue('kA', () => delay(40, 'a'));
    const b = enqueue('kB', () => delay(40, 'b'));
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).to.equal('a');
    expect(rb).to.equal('b');
    // If they ran serially, total time would be ~80ms; in parallel
    // it should be well under 70.
    expect(Date.now() - start).to.be.lessThan(70);
  });

  it('does not let a rejection in one task poison the chain', async () => {
    const events: string[] = [];
    const a = enqueue('kX', async () => {
      events.push('a');
      throw new Error('boom');
    });
    const b = enqueue('kX', async () => {
      events.push('b');
      return 'ok';
    });
    await a.catch(() => undefined);
    expect(await b).to.equal('ok');
    expect(events).to.deep.equal(['a', 'b']);
  });

  it('cleans up the tail entry once a key drains', async () => {
    expect(activeQueueCount()).to.equal(0);
    await enqueue('drain', () => delay(5, 1));
    // Allow microtasks from the finally() to run.
    await delay(10, null);
    expect(activeQueueCount()).to.equal(0);
  });
});
