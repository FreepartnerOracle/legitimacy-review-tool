import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const browserDir = path.join(rootDir, "release", "ms-playwright");

await mkdir(browserDir, { recursive: true });

await run(npxCommand(), ["playwright", "install", "chromium"], {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: browserDir
});

console.log(`Installed Playwright Chromium files in ${browserDir}`);

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`));
      }
    });
  });
}
