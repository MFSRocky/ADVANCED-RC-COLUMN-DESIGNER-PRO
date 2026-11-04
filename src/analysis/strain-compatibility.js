/** Public strain-compatibility API. Code-specific implementations live under /src/codes. */
export { getEngine, checkCapacity, biaxialContour } from './capacity-check.js';
export { designColumn, estimateRequiredAs } from './design-column.js';
