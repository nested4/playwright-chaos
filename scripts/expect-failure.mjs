// Testing the tester: a chaos tool is only useful if it actually catches bugs.
// Runs the e2e suite against a deliberately broken API client and FAILS if the suite passes.
import { spawnSync } from 'node:child_process';

const app = process.argv[2];
if (!app) {
  console.error('usage: node scripts/expect-failure.mjs <fragile|naive-retry>');
  process.exit(2);
}

const chaosProjects = ['bad-wifi', 'subway', 'black-friday'].flatMap((p) => ['--project', p]);
const run = spawnSync('npx', ['playwright', 'test', ...chaosProjects], {
  stdio: 'inherit',
  env: { ...process.env, APP: app },
});

if (run.status === 0) {
  console.error(`\n❌ Chaos did NOT catch the bugs in the "${app}" client. The tool is broken.`);
  process.exit(1);
}
console.log(`\n✅ As expected, chaos caught the "${app}" client breaking.`);
