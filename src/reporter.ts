import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ChaosStats } from './chaos';
import { profiles } from './profiles';

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

    // Stable order: built-in profiles first (in definition order), then custom ones alphabetically.
    const order = Object.keys(profiles);
    const rank = (n: string) => (order.includes(n) ? order.indexOf(n) : order.length);
    const rows = [...this.rows].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));

    const md = [
      `## 🐒 Chaos report — resilience score: **${score}%** ${grade}`,
      '',
      '| Profile | Passed | Failed | Requests | Faults injected |',
      '|---|---:|---:|---:|---:|',
      ...rows.map(
        ([name, r]) =>
          `| ${r.failed ? '❌' : '✅'} \`${name}\` | ${r.passed} | ${r.failed} | ${r.requests} | ${r.faults} |`,
      ),
      '',
      `<sub>Score = tests passing under non-calm profiles. Replay any failure with the CHAOS_SEED printed in its log.</sub>`,
      '',
    ].join('\n');

    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

    console.log(this.terminalTable(score, grade, rows));
  }

  private terminalTable(score: number, grade: string, rows: Array<[string, Row]>): string {
    const tty = process.stdout.isTTY || !!process.env.FORCE_COLOR;
    const paint = (code: number, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
    const nameW = Math.max(7, ...rows.map(([n]) => n.length));
    const head = `  ${'Profile'.padEnd(nameW + 3)}${'Passed'.padStart(8)}${'Failed'.padStart(8)}${'Requests'.padStart(10)}${'Faults'.padStart(8)}`;
    const body = rows.map(([name, r]) => {
      const icon = r.failed ? paint(31, '✘') : paint(32, '✔');
      const failed = r.failed ? paint(31, String(r.failed).padStart(8)) : String(r.failed).padStart(8);
      return `  ${icon}  ${name.padEnd(nameW)}${String(r.passed).padStart(8)}${failed}${String(r.requests).padStart(10)}${String(r.faults).padStart(8)}`;
    });
    const color = score === 100 ? 32 : score >= 80 ? 33 : 31;
    return [
      '',
      `  🐒 Chaos report   resilience score ${paint(1, paint(color, `${score}%`))}  ${grade}`,
      '',
      paint(2, head),
      ...body,
      '',
    ].join('\n');
  }

  printsToStdio(): boolean {
    return false;
  }
}
