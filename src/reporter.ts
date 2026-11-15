import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ChaosStats } from './chaos';

interface Row {
  passed: number;
  failed: number;
  requests: number;
  faults: number;
}

interface ReporterOptions {
  /** Markdown output path. Default: chaos-report.md */
  outputFile?: string;
}

/**
 * Prints a resilience matrix (profile × pass/fail × faults injected) and a single score.
 * Also appends it to the GitHub Actions job summary when running in CI.
 */
export default class ChaosReporter implements Reporter {
  private rows = new Map<string, Row>();
  private outputFile: string;

  constructor(options: ReporterOptions = {}) {
    this.outputFile = options.outputFile ?? 'chaos-report.md';
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((a) => a.name === 'chaos-stats');
    if (!attachment?.body) return; // not a chaos test (e.g. unit tests)
    if (result.retry < test.results.length - 1) return; // count only the final attempt

    const stats = JSON.parse(attachment.body.toString()) as ChaosStats;
    const row = this.rows.get(stats.profile) ?? { passed: 0, failed: 0, requests: 0, faults: 0 };
    if (test.outcome() === 'expected' || test.outcome() === 'flaky') row.passed++;
    else if (test.outcome() === 'unexpected') row.failed++;
    row.requests += stats.requests;
    row.faults += Object.values(stats.faults).reduce((a, b) => a + b, 0);
    this.rows.set(stats.profile, row);
  }

  onEnd(_result: FullResult): void {
    if (this.rows.size === 0) return;

    const chaosRows = [...this.rows].filter(([name]) => name !== 'calm');
    const total = chaosRows.reduce((a, [, r]) => a + r.passed + r.failed, 0);
    const passed = chaosRows.reduce((a, [, r]) => a + r.passed, 0);
    const score = total === 0 ? 100 : Math.round((passed / total) * 100);
    const grade = score === 100 ? '🟢 unbreakable' : score >= 80 ? '🟡 wobbly' : '🔴 fragile';

    const lines = [
      `## 🐒 Chaos report — resilience score: **${score}%** ${grade}`,
      '',
      '| Profile | Passed | Failed | Requests | Faults injected |',
      '|---|---:|---:|---:|---:|',
      ...[...this.rows].map(
        ([name, r]) =>
          `| ${r.failed ? '❌' : '✅'} \`${name}\` | ${r.passed} | ${r.failed} | ${r.requests} | ${r.faults} |`,
      ),
      '',
      `<sub>Score = tests passing under non-calm profiles. Replay any failure with the CHAOS_SEED printed in its log.</sub>`,
      '',
    ];
    const md = lines.join('\n');

    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

    console.log('\n' + md.replace(/\*\*/g, '').replace(/<\/?sub>/g, ''));
  }

  printsToStdio(): boolean {
    return false;
  }
}
