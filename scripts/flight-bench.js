// Verification bench of the flight model: measures the model against the
// published figures of the Rafale and prints a table.
//
// Usage: npm run flight:bench
import { runFlightBench } from '../js/flight/benchmarks.js';

const rows = runFlightBench();
let failures = 0;
for (const r of rows) {
  const ok = Math.abs(r.value - r.target) <= r.tolerance;
  if (!ok) failures++;
  const value = Number.isFinite(r.value)
    ? r.value.toFixed(r.unit === 'Mach' || r.unit === 'g' || r.unit === 's' ? 2 : 1)
    : '—';
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${r.name}: ${value} ${r.unit} (target ${r.target} ± ${r.tolerance}, ${r.source})`,
  );
}
process.exitCode = failures ? 1 : 0;
