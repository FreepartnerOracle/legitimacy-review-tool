#!/usr/bin/env node
import { startGui } from "./gui.js";
import { productName } from "./product.js";
import { runReview } from "./review.js";

type CliOptions = {
  websiteUrl?: string;
  companyName?: string;
  claimedLocation?: string;
  expectedState?: string;
  claimedIndustry?: string;
  additionalIdentifiers?: string;
  outputDir?: string;
  maxDepth?: number;
  maxPages?: number;
  gui: boolean;
  port?: number;
  help: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.gui || !options.websiteUrl) {
    await startGui({ port: options.port });
    return;
  }

  const completed = await runReview(
    {
      websiteUrl: options.websiteUrl,
      companyName: options.companyName,
      claimedLocation: options.claimedLocation,
      expectedState: options.expectedState,
      claimedIndustry: options.claimedIndustry,
      additionalIdentifiers: options.additionalIdentifiers,
      outputDir: options.outputDir,
      maxDepth: options.maxDepth,
      maxPages: options.maxPages
    },
    (update) => {
      const detail = update.detail ? ` ${update.detail}` : "";
      console.log(`[${update.stage}] ${update.message}${detail}`);
    }
  );

  console.log("");
  console.log("Review complete.");
  console.log(`Review outcome: ${completed.summary.riskLevel}`);
  console.log(`Concern level: ${completed.summary.concernLevel}`);
  console.log(`Confidence: ${completed.summary.confidence}`);
  console.log(`Likely official website: ${completed.summary.likelyOfficialWebsite}`);
  console.log(`Final assessment: ${completed.summary.finalAssessment.label}`);
  console.log(`Pages reviewed: ${completed.evidence.pages.length}`);
  console.log(`Concerns: ${completed.concerns.length}`);
  console.log(`Report: ${completed.paths.html}`);
  console.log(`Evidence: ${completed.paths.evidenceJson}`);
  console.log(`Screenshots: ${completed.paths.screenshotsDir}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    gui: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--gui") {
      options.gui = true;
      continue;
    }

    if (arg === "--company") {
      options.companyName = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--location") {
      options.claimedLocation = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--state") {
      options.expectedState = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--industry") {
      options.claimedIndustry = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--identifier") {
      options.additionalIdentifiers = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--out") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--max-depth") {
      options.maxDepth = parseInteger(readValue(args, index, arg), arg, 0, 2);
      index += 1;
      continue;
    }

    if (arg === "--max-pages") {
      options.maxPages = parseInteger(readValue(args, index, arg), arg, 1, 25);
      index += 1;
      continue;
    }

    if (arg === "--port") {
      options.port = parseInteger(readValue(args, index, arg), arg, 1, 65_535);
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.websiteUrl ??= arg;
  }

  return options;
}

function readValue(args: string[], index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} needs a value.`);
  }
  return value;
}

function parseInteger(value: string, optionName: string, min: number, max: number): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`${optionName} must be a whole number from ${min} to ${max}.`);
  }
  return numberValue;
}

function printHelp(): void {
  console.log(`${productName}

Usage:
  business-website-review --gui
  business-website-review <website-url> [options]

Options:
  --company <name>       Optional company name to look for in reviewed text
  --location <place>     Optional claimed location to look for in reviewed text
  --state <state>        Expected state for manual business registration follow-up
  --industry <service>   Optional claimed industry or service
  --identifier <text>    Optional extra identifier, such as license, email, or phone
  --out <folder>         Output folder for this review
  --max-pages <number>   Page limit, 1 to 25 (default: 25)
  --max-depth <number>   Internal link depth, 0 to 2 (default: 2)
  --port <number>        Local GUI port
  --gui                  Open the local GUI
  --help                 Show this help

Examples:
  business-website-review https://example.com
  business-website-review https://example.com --company "Example Inc" --location "Austin, Texas" --state "Texas" --industry "IT consulting"
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
