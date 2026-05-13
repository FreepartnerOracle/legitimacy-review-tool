import { open } from "node:fs/promises";
import path from "node:path";

const targetPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("release", "business-website-review.exe");
const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;

const file = await open(targetPath, "r+");

try {
  const dosHeader = Buffer.alloc(64);
  await file.read(dosHeader, 0, dosHeader.length, 0);

  if (dosHeader.toString("ascii", 0, 2) !== "MZ") {
    throw new Error(`${targetPath} is not a Windows PE executable.`);
  }

  const peHeaderOffset = dosHeader.readUInt32LE(0x3c);
  const peSignature = Buffer.alloc(4);
  await file.read(peSignature, 0, peSignature.length, peHeaderOffset);

  if (peSignature.toString("ascii") !== "PE\u0000\u0000") {
    throw new Error(`${targetPath} does not have a valid PE signature.`);
  }

  const optionalHeaderMagic = Buffer.alloc(2);
  const optionalHeaderOffset = peHeaderOffset + 24;
  await file.read(optionalHeaderMagic, 0, optionalHeaderMagic.length, optionalHeaderOffset);

  const magic = optionalHeaderMagic.readUInt16LE(0);
  if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error(`${targetPath} has an unsupported PE optional header.`);
  }

  const subsystemOffset = optionalHeaderOffset + 0x44;
  const subsystem = Buffer.alloc(2);
  subsystem.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, 0);
  await file.write(subsystem, 0, subsystem.length, subsystemOffset);
} finally {
  await file.close();
}

console.log(`Set Windows GUI subsystem on ${targetPath}`);
