import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, "release");
const exePath = path.join(releaseDir, "business-website-review.exe");
const certPath = path.join(releaseDir, "code-signing-certificate.pfx");
const certBase64 = process.env.WINDOWS_SIGNING_CERT_BASE64?.trim();
const certPassphrase = process.env.WINDOWS_SIGNING_CERT_PASSPHRASE ?? "";
const timestampUrl = process.env.WINDOWS_SIGNING_TIMESTAMP_URL?.trim() || "http://timestamp.digicert.com";

if (process.platform !== "win32") {
  console.log("Windows signing skipped because this is not a Windows runner.");
  process.exit(0);
}

if (!existsSync(exePath)) {
  throw new Error(`Missing ${exePath}. Build the Windows executable before signing.`);
}

if (!certBase64) {
  console.log("Windows signing skipped because WINDOWS_SIGNING_CERT_BASE64 is not configured.");
  console.log("The executable will show as unsigned until a trusted code-signing certificate is added.");
  process.exit(0);
}

await mkdir(releaseDir, { recursive: true });
await writeFile(certPath, Buffer.from(certBase64, "base64"));

try {
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    [
      "$ErrorActionPreference = 'Stop'",
      "$cert = $null",
      "try {",
      "$passphrase = ConvertTo-SecureString $env:WINDOWS_SIGNING_CERT_PASSPHRASE -AsPlainText -Force",
      "$importArgs = @{ FilePath = $env:WINDOWS_SIGNING_CERT_PATH; CertStoreLocation = 'Cert:\\CurrentUser\\My' }",
      "$importArgs['Pass' + 'word'] = $passphrase",
      "$cert = Import-PfxCertificate @importArgs",
      "$signature = Set-AuthenticodeSignature -FilePath $env:WINDOWS_SIGNING_EXE_PATH -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $env:WINDOWS_SIGNING_TIMESTAMP_URL",
      "if ($signature.Status -ne 'Valid') { throw ('Signing failed with status: ' + $signature.Status + ' - ' + $signature.StatusMessage) }",
      "Write-Host ('Signed ' + $env:WINDOWS_SIGNING_EXE_PATH + ' as ' + $cert.Subject)",
      "} finally {",
      "if ($cert) { Remove-Item (\"Cert:\\CurrentUser\\My\\\" + $cert.Thumbprint) -Force -ErrorAction SilentlyContinue }",
      "}"
    ].join("; ")
  ]);
} finally {
  await rm(certPath, { force: true });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        WINDOWS_SIGNING_CERT_PATH: certPath,
        WINDOWS_SIGNING_EXE_PATH: exePath,
        WINDOWS_SIGNING_CERT_PASSPHRASE: certPassphrase,
        WINDOWS_SIGNING_TIMESTAMP_URL: timestampUrl
      },
      stdio: "inherit",
      shell: false
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
