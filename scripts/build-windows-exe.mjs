import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, "release");
const bundlePath = path.join(rootDir, "dist", "business-website-review.cjs");
const exePath = path.join(releaseDir, "business-website-review.exe");
const seaConfigPath = path.join(releaseDir, "sea-config.json");
const blobPath = path.join(releaseDir, "business-website-review.blob");

await mkdir(releaseDir, { recursive: true });

if (!existsSync(bundlePath)) {
  throw new Error("Missing dist/business-website-review.cjs. Run `npm run bundle` first.");
}

if (await supportsBuildSea()) {
  await writeFile(
    seaConfigPath,
    `${JSON.stringify(
      {
        main: bundlePath,
        mainFormat: "commonjs",
        executable: process.execPath,
        output: exePath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        useSnapshot: false
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await run(process.execPath, ["--build-sea", seaConfigPath]);
} else {
  await writeFile(
    seaConfigPath,
    `${JSON.stringify(
      {
        main: bundlePath,
        mainFormat: "commonjs",
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        useSnapshot: false
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await run(process.execPath, ["--experimental-sea-config", seaConfigPath]);
  await rm(exePath, { force: true });
  await copyFile(process.execPath, exePath);
  await removeSignatureIfPossible(exePath);
  await run(npxCommand(), [
    "postject",
    exePath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
  ]);
}

console.log(`Created ${exePath}`);
await copyRuntimePackages();
await writeReleaseIcon();
await writeReleaseReadme();
console.log("For browser page review, also run `npm run package:win:browsers` to create release/ms-playwright.");

async function supportsBuildSea() {
  const help = await capture(process.execPath, ["--help"]);
  return help.includes("--build-sea");
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

async function removeSignatureIfPossible(targetPath) {
  if (process.platform !== "win32") {
    return;
  }

  const signtool = await findOnPath("signtool.exe");
  if (!signtool) {
    console.log("signtool.exe was not found; continuing without removing the copied Node signature.");
    return;
  }

  try {
    await run(signtool, ["remove", "/s", targetPath]);
  } catch (error) {
    console.log(`signtool could not remove the copied Node signature: ${error.message}`);
  }
}

function findOnPath(executableName) {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, executableName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function copyRuntimePackages() {
  const runtimePackages = ["playwright", "playwright-core", "chromium-bidi"];

  for (const packageName of runtimePackages) {
    const sourceDir = path.join(rootDir, "node_modules", packageName);
    const targetDir = path.join(releaseDir, "node_modules", packageName);

    if (!existsSync(sourceDir)) {
      console.log(`Runtime package ${packageName} was not found in node_modules; skipping copy.`);
      continue;
    }

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(path.dirname(targetDir), { recursive: true });
    await cp(sourceDir, targetDir, { recursive: true });
    console.log(`Copied runtime package ${packageName} to release/node_modules.`);
  }
}

async function writeReleaseReadme() {
  const readmePath = path.join(releaseDir, "README-FIRST.txt");
  await writeFile(
    readmePath,
    [
      "Business Website Review",
      "Publisher: Freepartner Digital",
      "",
      "How to run:",
      "1. Keep this whole release folder together.",
      "2. Double-click business-website-review.exe.",
      "3. Enter a business website URL in the local browser page.",
      "4. Click Start Review.",
      "",
      "Expected files in this folder:",
      "- business-website-review.exe",
      "- business-website-review-icon.svg",
      "- node_modules",
      "- ms-playwright",
      "",
      "Reports are saved by default under:",
      "Documents\\Business Website Review Reports",
      "",
      "Each review folder includes report.html, report.md, summary.html, client-summary.txt, follow-up-checklist.md, evidence.json, and screenshots.",
      "",
      "External evidence links are included for manual follow-up. The app does not interpret third-party search or registry results automatically."
    ].join("\n"),
    "utf8"
  );
  console.log(`Created ${readmePath}`);
}

async function writeReleaseIcon() {
  const iconPath = path.join(releaseDir, "business-website-review-icon.svg");
  await writeFile(
    iconPath,
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
      '<rect width="64" height="64" rx="14" fill="#c74634"/>',
      '<path d="M18 15h22l8 8v26H18z" fill="#fff8f3"/>',
      '<path d="M40 15v9h8" fill="#f0d9cc"/>',
      '<path d="M24 31h18M24 38h12" stroke="#7a3b31" stroke-width="3" stroke-linecap="round"/>',
      '<path d="m24 47 5 5 12-14" fill="none" stroke="#4f7d3f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
      "</svg>"
    ].join(""),
    "utf8"
  );
  console.log(`Created ${iconPath}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)
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

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", () => resolve(output));
  });
}
