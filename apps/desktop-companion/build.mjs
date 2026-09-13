import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync(new URL("./release", import.meta.url), { recursive: true });
const result = spawnSync(
  "go",
  ["build", "-trimpath", "-ldflags", "-s -w -H=windowsgui", "-o", "release/CompanyMailLauncher.exe", "."],
  {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
