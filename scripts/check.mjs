// Hızlı denetim (K-072): tür denetimi, lint ve testleri aynı anda çalıştırır.
// `npm run check`      → yalnızca değişen dosyalarla ilgili testler (günlük kullanım)
// `npm run check:full` → bütün testler
// Tam denetim her push'ta GitHub Actions'ta da çalışır (.github/workflows/ci.yml).
import { spawn } from "node:child_process";

const full = process.argv.includes("--full");
const run = ([name, cmd]) =>
  new Promise((resolve) => {
    let out = "";
    const child = spawn(cmd, { shell: true });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ name, code, out }));
  });

const static_ = [
  ["tür", "npx tsc --noEmit"],
  ["lint", "npx eslint --cache --cache-location node_modules/.cache/eslint/"],
];
// Hız testi (NFR-003) süre ölçer; tür denetimi ve lint ile aynı anda koşarsa makine yükünden yanlış alarm verir.
// Günlük denetimde atlanır; tam denetimde testler ötekiler bittikten sonra, tek başına koşar.
const tests = full
  ? ["test", "npx vitest run"]
  : ["test", "npx vitest run --changed HEAD --passWithNoTests --exclude src/test/performance.test.ts"];

const started = Date.now();
const results = full
  ? [...(await Promise.all(static_.map(run))), await run(tests)]
  : await Promise.all([...static_, tests].map(run));

for (const r of results) {
  if (r.code !== 0) console.log(`\n--- ${r.name} ---\n${r.out.trim()}`);
  const summary = r.name === "test" ? (r.out.match(/Tests\s+\d.*$/m)?.[0] ?? "") : "";
  console.log(`${r.code === 0 ? "✓" : "✗"} ${r.name} ${summary}`.trim());
}
console.log(`${Math.round((Date.now() - started) / 1000)} sn`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
