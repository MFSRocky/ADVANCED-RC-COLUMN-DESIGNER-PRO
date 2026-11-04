/** BS 8110-1:1997 reinforcement optimization configuration. */
import { runOptimization } from '../../analysis/optimization-engine.js';
import { BAR_SIZES, LINK_SIZES } from './materials.js';
export function optimize(input, options = {}, onProgress) {
  return runOptimization(input, { barDiameters: options.barDiameters ?? BAR_SIZES, tieDiameters: LINK_SIZES, maxBars: options.maxBars ?? 28, ...options }, onProgress);
}
