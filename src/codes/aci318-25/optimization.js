/** ACI 318-25 reinforcement optimization configuration. */
import { runOptimization } from '../../analysis/optimization-engine.js';
import { BAR_SIZES, TIE_SIZES } from './materials.js';
export function optimize(input, options = {}, onProgress) {
  return runOptimization(input, { barDiameters: options.barDiameters ?? BAR_SIZES.filter(d => d >= 12 && d <= 40), tieDiameters: TIE_SIZES, maxBars: options.maxBars ?? 28, ...options }, onProgress);
}
