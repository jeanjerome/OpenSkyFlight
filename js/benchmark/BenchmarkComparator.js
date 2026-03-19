import Logger from '../utils/Logger.js';

const BASELINE_KEY = 'benchmark_baseline';

export default class BenchmarkComparator {
  /**
   * Store the current report summary as the baseline in localStorage.
   */
  static storeBaseline(report) {
    if (!report || !report.summary) {
      Logger.warn('Comparator', 'No valid report to store as baseline');
      return;
    }
    const baseline = {
      date: report.date,
      summary: report.summary,
    };
    try {
      localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline));
      Logger.info('Comparator', `Baseline stored (${baseline.summary.fps.avg} FPS avg, ${baseline.summary.fps.p1} P1)`);
    } catch {
      Logger.warn('Comparator', 'Failed to store baseline in localStorage');
    }
  }

  /**
   * Load the stored baseline, or null if none.
   */
  static loadBaseline() {
    try {
      const raw = localStorage.getItem(BASELINE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Compare a new report against the stored baseline.
   * Returns an object with deltas, or null if no baseline.
   */
  static compare(newReport) {
    const baseline = BenchmarkComparator.loadBaseline();
    if (!baseline || !baseline.summary || !newReport || !newReport.summary) return null;

    const b = baseline.summary;
    const n = newReport.summary;

    const delta = (newVal, oldVal) => {
      const diff = newVal - oldVal;
      const pct = oldVal !== 0 ? (diff / oldVal) * 100 : 0;
      return { old: oldVal, new: newVal, diff: Math.round(diff * 10) / 10, pct: Math.round(pct * 10) / 10 };
    };

    const result = {
      baselineDate: baseline.date,
      fps: {
        avg: delta(n.fps.avg, b.fps.avg),
        p1: delta(n.fps.p1, b.fps.p1),
        p5: delta(n.fps.p5, b.fps.p5),
        min: delta(n.fps.min, b.fps.min),
      },
      frameTime: {
        avg: delta(n.frameTime.avg, b.frameTime.avg),
        p95: delta(n.frameTime.p95, b.frameTime.p95),
        max: delta(n.frameTime.max, b.frameTime.max),
      },
      triangles: {
        avg: delta(n.triangles.avg, b.triangles.avg),
        max: delta(n.triangles.max, b.triangles.max),
      },
      drawCalls: {
        avg: delta(n.drawCalls.avg, b.drawCalls.avg),
      },
    };

    // Compare subsystem timings if both have them
    if (n.subs && b.subs) {
      result.subs = {};
      const allNames = new Set([...Object.keys(n.subs), ...Object.keys(b.subs)]);
      for (const name of allNames) {
        const nAvg = n.subs[name] ? n.subs[name].avg : 0;
        const bAvg = b.subs[name] ? b.subs[name].avg : 0;
        result.subs[name] = delta(nAvg, bAvg);
      }
    }

    // Jank comparison
    if (n.jankCount !== undefined && b.jankCount !== undefined) {
      result.jankCount = delta(n.jankCount, b.jankCount);
    }

    return result;
  }

  /**
   * Log comparison results to the console and Logger.
   */
  static logComparison(comparison) {
    if (!comparison) return;

    const fmt = (d) => {
      const sign = d.diff >= 0 ? '+' : '';
      return `${d.old} -> ${d.new} (${sign}${d.diff}, ${sign}${d.pct}%)`;
    };

    Logger.info('Comparator', '=== A/B Comparison vs Baseline ===');
    Logger.info('Comparator', `Baseline from: ${comparison.baselineDate}`);
    Logger.info('Comparator', `FPS avg: ${fmt(comparison.fps.avg)}`);
    Logger.info('Comparator', `FPS P1:  ${fmt(comparison.fps.p1)}`);
    Logger.info('Comparator', `FPS P5:  ${fmt(comparison.fps.p5)}`);
    Logger.info('Comparator', `Frame time avg: ${fmt(comparison.frameTime.avg)}`);
    Logger.info('Comparator', `Frame time P95: ${fmt(comparison.frameTime.p95)}`);
    Logger.info('Comparator', `Triangles avg: ${fmt(comparison.triangles.avg)}`);
    Logger.info('Comparator', `Draw calls avg: ${fmt(comparison.drawCalls.avg)}`);

    if (comparison.subs) {
      for (const [name, d] of Object.entries(comparison.subs)) {
        Logger.info('Comparator', `  Sub [${name}]: ${fmt(d)}`);
      }
    }

    if (comparison.jankCount) {
      Logger.info('Comparator', `Janks: ${fmt(comparison.jankCount)}`);
    }

    // Also log to console for easy visibility
    console.log('%c[Benchmark A/B Comparison]', 'color: #00ff88; font-weight: bold;', comparison);
  }
}
