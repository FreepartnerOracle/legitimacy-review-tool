import { mkdir } from "node:fs/promises";
import path from "node:path";
import { reviewPublicWebsite, normalizeWebsiteUrl } from "./browserReview.js";
import { throwIfCancelled } from "./cancel.js";
import { runQualityChecks, summarizeReview } from "./checks.js";
import { buildExternalEvidence } from "./externalEvidence.js";
import { buildSiteIdentityReview } from "./identity.js";
import { outputFolderName } from "./product.js";
import { writeReports } from "./report.js";
import { extractReviewSignals } from "./signals.js";
import type { CompletedReview, ProgressUpdate, ReviewInput, ReviewOptions } from "./types.js";

export type RunReviewRequest = ReviewInput & {
  outputDir?: string;
  maxDepth?: number;
  maxPages?: number;
};

export type ProgressHandler = (update: ProgressUpdate) => void;

export async function runReview(
  request: RunReviewRequest,
  onProgress?: ProgressHandler,
  signal?: AbortSignal
): Promise<CompletedReview> {
  throwIfCancelled(signal);
  const websiteUrl = normalizeWebsiteUrl(request.websiteUrl);
  const options: ReviewOptions = {
    websiteUrl,
    companyName: trimOptional(request.companyName),
    claimedLocation: trimOptional(request.claimedLocation),
    expectedState: trimOptional(request.expectedState),
    claimedIndustry: trimOptional(request.claimedIndustry),
    additionalIdentifiers: trimOptional(request.additionalIdentifiers),
    outputDir: request.outputDir ?? createReviewOutputDir({ ...request, websiteUrl }),
    maxDepth: request.maxDepth ?? 2,
    maxPages: request.maxPages ?? 25
  };

  await mkdir(options.outputDir, { recursive: true });
  throwIfCancelled(signal);

  onProgress?.({
    stage: "preparing",
    message: "Preparing the review folder.",
    detail: options.outputDir
  });

  const evidence = await reviewPublicWebsite(options, onProgress, signal);
  throwIfCancelled(signal);
  evidence.signals = extractReviewSignals(evidence);

  onProgress?.({
    stage: "checking",
    message: "Running local quality checks.",
    detail: `${evidence.pages.length} page${evidence.pages.length === 1 ? "" : "s"} reviewed`
  });

  const concerns = runQualityChecks(evidence);
  evidence.siteIdentity = buildSiteIdentityReview(evidence, concerns);
  evidence.externalEvidence = buildExternalEvidence(evidence);
  const summary = summarizeReview(evidence, concerns);
  throwIfCancelled(signal);

  onProgress?.({
    stage: "reporting",
    message: "Writing reports and evidence files.",
    detail: options.outputDir
  });

  const paths = await writeReports({ evidence, concerns, summary }, options.outputDir);
  throwIfCancelled(signal);

  onProgress?.({
    stage: "completed",
    message: "Review complete.",
    detail: options.outputDir
  });

  return {
    evidence,
    concerns,
    summary,
    paths
  };
}

export function defaultOutputRoot(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (home) {
    return path.join(home, "Documents", outputFolderName);
  }

  return path.resolve("reports");
}

export function createReviewOutputDir(input: ReviewInput, rootDir = defaultOutputRoot()): string {
  const host = readableHost(input.websiteUrl);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(rootDir, `${fileSafeName(host)}-${timestamp}`);
}

function readableHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "website";
  }
}

function fileSafeName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "website";
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
