import { Puppifier } from 'puppifier';
import { logger } from '../util/logger.js';

/**
 * Mandatory startup warm-up.
 *
 * The GoEmotions ONNX model is large (~80 MB quantized) and the first
 * inference also pays a JIT/compile cost. We force that cost to happen
 * BEFORE we log into Discord, so the very first puppified message
 * doesn't sit waiting on a model download while the user wonders why
 * nothing is happening.
 *
 * The classifier is a process-wide lazy singleton inside
 * emotion-classifier (see emotion-classifier/src/classifier.ts), so a
 * single warm-up call here populates the cache for every per-user
 * `Puppifier` instance the bot creates afterwards.
 *
 * Failure here is fatal: we'd rather crash on startup than come online
 * with a broken inference path.
 */
export async function warmUpPuppifier(): Promise<void> {
  logger.info(
    'Warming up puppifier (this may download the ~80MB GoEmotions model on first run)...',
  );
  const start = Date.now();
  try {
    const warmer = new Puppifier();
    await warmer.translate('hello');
  } catch (err) {
    logger.error('Puppifier warm-up failed:', err);
    throw new Error(
      'Failed to warm up the puppifier / emotion classifier. ' +
        'The bot will not start. See above for details.',
    );
  }
  logger.info(`Puppifier warm-up complete in ${Date.now() - start}ms.`);
}
