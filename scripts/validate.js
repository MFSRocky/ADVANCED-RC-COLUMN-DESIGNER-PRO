import { runBenchmarks } from '../src/validation/benchmarks.js';
const r = await runBenchmarks();
for (const c of r.cases) console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.details}`);
console.log(`\n${r.passed}/${r.total} benchmarks passed`);
process.exit(r.allPassed ? 0 : 1);
