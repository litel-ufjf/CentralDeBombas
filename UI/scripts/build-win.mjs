// Empacota o app fora de Documents (o Windows trava a renomeação de win-unpacked ali)
// e copia os instaladores para UI/release.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const release = join(root, pkg.build.directories.output);
const staging = join(tmpdir(), "bomba-ui-release");

rmSync(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
rmSync(join(release, "win-unpacked.tmp"), { recursive: true, force: true });

const result = spawnSync(
  "npx",
  ["electron-builder", "--win", "--publish", "never", `--config.directories.output=${staging}`],
  { cwd: root, stdio: "inherit", shell: true },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const installers = readdirSync(staging).filter(
  (name) => name.endsWith(".exe") && name.includes(pkg.version),
);
if (installers.length === 0) {
  console.error(`Nenhum .exe da versão ${pkg.version} em ${staging}`);
  process.exit(1);
}

mkdirSync(release, { recursive: true });
for (const name of installers) {
  copyFileSync(join(staging, name), join(release, name));
  console.log(`  • copiado  ${join(pkg.build.directories.output, name)}`);
}
