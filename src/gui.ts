import { createReadStream, existsSync } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isReviewCancelledError } from "./cancel.js";
import { renderPlainSummary } from "./report.js";
import { productIconDataUri, productIconSvg, productName, productSummary, productTagline } from "./product.js";
import { createReviewOutputDir, defaultOutputRoot, runReview } from "./review.js";
import { appVersion } from "./version.js";
import type { CompletedReview, ProgressUpdate, ReviewInput } from "./types.js";

type GuiOptions = {
  port?: number;
  openBrowser?: boolean;
};

type JobStatus = "running" | "completed" | "failed" | "cancelled";

type ReviewJob = {
  id: string;
  status: JobStatus;
  input: ReviewInput;
  outputDir: string;
  startedAt: string;
  updates: ProgressUpdate[];
  result?: CompletedReview;
  error?: string;
  abortController?: AbortController;
};

const jobs = new Map<string, ReviewJob>();
let activeServer: http.Server | undefined;
let shutdownStarted = false;
let shutdownSignalsRegistered = false;

export async function startGui(options: GuiOptions = {}): Promise<http.Server> {
  const server = http.createServer(handleRequest);
  const port = options.port ?? 0;

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start the local GUI server.");
  }

  activeServer = server;
  const url = `http://127.0.0.1:${address.port}`;
  if (options.openBrowser ?? true) {
    openUrl(url);
  }

  registerShutdownSignals();
  console.log(`${productName} is open at ${url}`);
  return server;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && requestUrl.pathname === "/") {
      sendHtml(response, await renderHomePage());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/readiness") {
      sendJson(response, await getReadiness());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/reviews") {
      sendJson(response, [...jobs.values()].reverse().slice(0, 12).map((job) => publicJob(job)));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/reviews") {
      const body = await readJson(request);
      const job = startReviewJob(body);
      sendJson(response, publicJob(job));
      return;
    }

    if (request.method === "GET" && requestUrl.pathname.startsWith("/api/reviews/")) {
      const job = getJobFromPath(requestUrl.pathname, "/api/reviews/");
      if (!job) {
        sendJson(response, { error: "Review not found." }, 404);
        return;
      }
      sendJson(response, publicJob(job));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname.startsWith("/api/open-folder/")) {
      const job = getJobFromPath(requestUrl.pathname, "/api/open-folder/");
      if (!job) {
        sendJson(response, { error: "Review not found." }, 404);
        return;
      }
      openPath(job.outputDir);
      sendJson(response, { ok: true });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname.startsWith("/api/cancel/")) {
      const job = getJobFromPath(requestUrl.pathname, "/api/cancel/");
      if (!job) {
        sendJson(response, { error: "Review not found." }, 404);
        return;
      }
      cancelReviewJob(job);
      sendJson(response, publicJob(job));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/shutdown") {
      sendJson(response, { ok: true });
      scheduleShutdown();
      return;
    }

    if (request.method === "GET" && requestUrl.pathname.startsWith("/artifact/")) {
      await sendArtifact(requestUrl.pathname, response);
      return;
    }

    sendText(response, "Not found.", 404);
  } catch (error) {
    sendJson(response, { error: readableError(error) }, 500);
  }
}

function startReviewJob(body: unknown): ReviewJob {
  const input = parseReviewInput(body);
  const outputRoot = parseStringField(body, "outputRoot") || defaultOutputRoot();
  const maxDepth = parseNumberField(body, "maxDepth", 2, 0, 2);
  const maxPages = parseNumberField(body, "maxPages", 25, 1, 25);
  const outputDir = createReviewOutputDir(input, outputRoot);
  const abortController = new AbortController();
  const job: ReviewJob = {
    id: randomUUID(),
    status: "running",
    input,
    outputDir,
    startedAt: new Date().toISOString(),
    abortController,
    updates: [
      {
        stage: "preparing",
        message: "Queued review.",
        detail: input.websiteUrl
      }
    ]
  };

  jobs.set(job.id, job);

  void runReview({ ...input, outputDir, maxDepth, maxPages }, (update) => {
    job.updates.push(update);
  }, abortController.signal)
    .then((result) => {
      if (job.status === "cancelled") {
        return;
      }
      job.result = result;
      job.status = "completed";
    })
    .catch((error) => {
      if (isReviewCancelledError(error) || abortController.signal.aborted) {
        const alreadyCancelled = job.status === "cancelled";
        job.status = "cancelled";
        job.error = "Review cancelled.";
        if (!alreadyCancelled) {
          job.updates.push({
            stage: "cancelled",
            message: "Review cancelled.",
            detail: outputDir
          });
        }
        return;
      }
      job.status = "failed";
      job.error = readableError(error);
    });

  return job;
}

function cancelReviewJob(job: ReviewJob): void {
  if (job.status !== "running") {
    return;
  }

  job.status = "cancelled";
  job.error = "Review cancelled.";
  job.updates.push({
    stage: "cancelled",
    message: "Review cancelled.",
    detail: job.outputDir
  });
  job.abortController?.abort();
}

function parseReviewInput(body: unknown): ReviewInput {
  const websiteUrl = parseStringField(body, "websiteUrl");
  if (!websiteUrl) {
    throw new Error("Website URL is required.");
  }

  return {
    websiteUrl,
    companyName: parseStringField(body, "companyName"),
    claimedLocation: parseStringField(body, "claimedLocation"),
    expectedState: parseStringField(body, "expectedState"),
    claimedIndustry: parseStringField(body, "claimedIndustry"),
    additionalIdentifiers: parseStringField(body, "additionalIdentifiers")
  };
}

function publicJob(job: ReviewJob): object {
  return {
    id: job.id,
    status: job.status,
    input: job.input,
    outputDir: job.outputDir,
    startedAt: job.startedAt,
    updates: job.updates,
    error: job.error,
    result: job.result
      ? {
          summary: job.result.summary,
          summaryText: renderPlainSummary(job.result),
          concerns: job.result.concerns,
          pages: job.result.evidence.pages.map((page) => ({
            title: page.title,
            finalUrl: page.finalUrl,
            metaDescription: page.metaDescription,
            lastModified: page.lastModified,
            headings: page.headings,
            status: page.status,
            links: page.links.length,
            emails: page.details?.emails?.length ?? 0,
            phones: page.details?.phones?.length ?? 0,
            forms: page.forms?.formCount ?? 0,
            contactForms: page.forms?.contactFormCount ?? 0,
            screenshot: path.basename(page.screenshotPath),
            screenshotUrl: `/artifact/${job.id}/screenshots/${path.basename(page.screenshotPath)}`
          })),
          signals: job.result.evidence.signals,
          identity: job.result.evidence.siteIdentity,
          siteAvailability: job.result.evidence.siteAvailability,
          sitemap: job.result.evidence.sitemap,
          domainRegistration: job.result.evidence.domainRegistration,
          externalEvidence: job.result.evidence.externalEvidence,
          paths: {
            outputDir: job.result.paths.outputDir,
            reportHtml: `/artifact/${job.id}/report.html`,
            reportMarkdown: `/artifact/${job.id}/report.md`,
            summaryHtml: `/artifact/${job.id}/summary.html`,
            summaryText: `/artifact/${job.id}/client-summary.txt`,
            checklistMarkdown: `/artifact/${job.id}/follow-up-checklist.md`,
            evidenceJson: `/artifact/${job.id}/evidence.json`
          }
        }
      : undefined
  };
}

async function getReadiness(): Promise<ReadinessItem[]> {
  const outputRoot = defaultOutputRoot();
  let outputOk = false;

  try {
    await mkdir(outputRoot, { recursive: true });
    await access(outputRoot);
    outputOk = true;
  } catch {
    outputOk = false;
  }

  const releaseBrowserDir = path.join(path.dirname(process.execPath), "ms-playwright");
  const projectRuntimeDir = path.join(process.cwd(), "node_modules", "playwright");
  const browserReady = Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH) || existsSync(releaseBrowserDir) || existsSync(projectRuntimeDir);

  return [
    {
      label: "Browser files",
      status: browserReady ? "Found" : "Use GitHub release folder",
      ok: browserReady
    },
    {
      label: "Output folder",
      status: outputOk ? "Writable" : "Needs attention",
      ok: outputOk
    },
    {
      label: "Application",
      status: `Ready v${appVersion}`,
      ok: true
    }
  ];
}

function scheduleShutdown(): void {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;

  setTimeout(() => {
    const server = activeServer;
    if (!server) {
      process.exit(0);
    }

    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => process.exit(0), 750).unref();
  }, 100).unref();
}

function registerShutdownSignals(): void {
  if (shutdownSignalsRegistered) {
    return;
  }
  shutdownSignalsRegistered = true;
  const shutdown = () => scheduleShutdown();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function sendArtifact(pathname: string, response: ServerResponse): Promise<void> {
  const parts = pathname.split("/").filter(Boolean);
  const [, jobId, ...fileParts] = parts;
  const job = jobId ? jobs.get(jobId) : undefined;

  if (!job || fileParts.length === 0) {
    sendText(response, "Not found.", 404);
    return;
  }

  const relativePath = fileParts.join("/");
  if (!isAllowedArtifact(relativePath)) {
    sendText(response, "Not found.", 404);
    return;
  }

  const filePath = path.join(job.outputDir, relativePath);
  if (!isInside(job.outputDir, filePath)) {
    sendText(response, "Not found.", 404);
    return;
  }

  await stat(filePath);
  response.writeHead(200, { "content-type": contentType(relativePath) });
  createReadStream(filePath).pipe(response);
}

type ReadinessItem = {
  label: string;
  status: string;
  ok: boolean;
};

async function renderHomePage(): Promise<string> {
  const outputRoot = escapeHtml(defaultOutputRoot());
  const readiness = await getReadiness();
  const readinessItems = readiness
    .map(
      (item) => `<li class="${item.ok ? "ready" : "needs-attention"}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.status)}</strong>
      </li>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(productName)}</title>
  <link rel="icon" href="${escapeHtml(productIconDataUri)}">
  <style>
    :root {
      color-scheme: light;
      --rw-ink: #161513;
      --rw-muted: #69645f;
      --rw-subtle: #8b8580;
      --rw-page: #f5f2ef;
      --rw-panel: #ffffff;
      --rw-panel-2: #fbf9f7;
      --rw-line: #ded8d1;
      --rw-line-strong: #c8bfb7;
      --rw-red: #c74634;
      --rw-red-dark: #9f2d20;
      --rw-blue: #2f6f9f;
      --rw-green: #4f7d3f;
      --rw-gold: #9a6b22;
      --rw-shadow: 0 18px 48px rgba(22, 21, 19, 0.12);
      --rw-shadow-soft: 0 8px 24px rgba(22, 21, 19, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--rw-ink);
      background:
        radial-gradient(circle at top left, rgba(199, 70, 52, 0.10), transparent 34rem),
        linear-gradient(180deg, #faf8f5 0%, var(--rw-page) 48%, #eee9e3 100%);
      font-family: "Oracle Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    button, input {
      font: inherit;
    }
    a { color: var(--rw-blue); }
    .app {
      width: min(1220px, calc(100% - 32px));
      margin: 0 auto;
      padding: 22px 0 48px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 58px;
      margin-bottom: 18px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(222, 216, 209, 0.9);
      border-radius: 8px;
      box-shadow: var(--rw-shadow-soft);
      backdrop-filter: blur(16px);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      font-weight: 800;
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      color: #fff;
      background: var(--rw-red);
      border-radius: 8px;
      font-weight: 900;
      overflow: hidden;
    }
    .brand-mark svg { width: 100%; height: 100%; display: block; }
    .topbar small {
      color: var(--rw-muted);
      font-weight: 700;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .exit-button {
      padding: 8px 11px;
      font-size: 0.86rem;
    }
    .hero-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
      gap: 22px;
      align-items: stretch;
      margin-bottom: 18px;
      padding: 28px;
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(251, 249, 247, 0.92)),
        linear-gradient(135deg, rgba(199, 70, 52, 0.12), rgba(47, 111, 159, 0.06));
      border: 1px solid var(--rw-line);
      border-radius: 8px;
      box-shadow: var(--rw-shadow);
    }
    .hero-copy {
      align-self: end;
    }
    .hero-side {
      display: grid;
      gap: 10px;
      align-content: end;
      padding: 18px;
      background: rgba(245, 242, 239, 0.72);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
    }
    .hero-stat {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--rw-line);
    }
    .hero-stat:last-child { border-bottom: 0; }
    .hero-stat strong { font-size: 1.1rem; }
    .hero-stat span { color: var(--rw-muted); font-size: 0.88rem; font-weight: 700; }
    .eyebrow {
      margin: 0 0 8px;
      color: var(--rw-red-dark);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1, h2, h3, p {
      margin-top: 0;
    }
    h1 {
      max-width: 780px;
      margin-bottom: 10px;
      font-size: clamp(2.3rem, 5vw, 4.9rem);
      line-height: 0.98;
      letter-spacing: 0;
    }
    h2 {
      margin-bottom: 6px;
      font-size: 1.3rem;
    }
    h3 {
      margin: 22px 0 10px;
      font-size: 1.02rem;
    }
    .hero-panel p {
      max-width: 760px;
      margin-bottom: 0;
      color: var(--rw-muted);
      font-size: 1.05rem;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(320px, 408px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }
    .panel {
      background: var(--rw-panel);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
      box-shadow: var(--rw-shadow-soft);
    }
    form.panel {
      padding: 20px;
      position: sticky;
      top: 16px;
    }
    .section-title {
      margin-bottom: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--rw-line);
    }
    .section-title p {
      margin-bottom: 0;
      color: var(--rw-muted);
    }
    label {
      display: block;
      margin-bottom: 15px;
      color: var(--rw-muted);
      font-weight: 700;
      font-size: 0.9rem;
    }
    input {
      display: block;
      width: 100%;
      margin-top: 6px;
      padding: 12px 13px;
      border: 1px solid var(--rw-line-strong);
      border-radius: 8px;
      color: var(--rw-ink);
      background: #fff;
      box-shadow: inset 0 1px 0 rgba(22, 21, 19, 0.03);
    }
    input:focus {
      outline: 3px solid rgba(199, 70, 52, 0.18);
      border-color: var(--rw-red);
    }
    .field-note {
      display: block;
      margin-top: 5px;
      color: var(--rw-subtle);
      font-weight: 600;
      font-size: 0.78rem;
    }
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 12px 15px;
      cursor: pointer;
      font-weight: 800;
      transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }
    button:hover, .button-link:hover {
      transform: translateY(-1px);
    }
    .primary {
      width: 100%;
      color: #fff;
      background: var(--rw-red);
      box-shadow: 0 10px 22px rgba(199, 70, 52, 0.25);
    }
    .primary:hover { background: var(--rw-red-dark); }
    .primary:disabled {
      cursor: wait;
      opacity: 0.72;
      transform: none;
    }
    .cancel-button {
      width: 100%;
      margin-top: 10px;
    }
    .secondary {
      color: #fff;
      background: var(--rw-ink);
    }
    .ghost {
      color: var(--rw-ink);
      background: rgba(22, 21, 19, 0.08);
    }
    .content {
      display: grid;
      gap: 18px;
    }
    .status {
      padding: 20px;
      min-height: 230px;
    }
    .readiness {
      padding: 20px;
    }
    .ready-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }
    .ready-list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px;
      background: var(--rw-panel-2);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
    }
    .ready-list li::before {
      content: "";
      width: 9px;
      height: 9px;
      flex: 0 0 auto;
      border-radius: 999px;
      background: var(--rw-green);
    }
    .ready-list li.needs-attention::before {
      background: var(--rw-gold);
    }
    .ready-list span {
      margin-right: auto;
      color: var(--rw-muted);
      font-weight: 700;
    }
    .ready-list strong {
      text-align: right;
      font-size: 0.88rem;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 18px;
      padding: 0;
      list-style: none;
    }
    .steps li {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 10px;
      color: var(--rw-muted);
      background: var(--rw-panel-2);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
      font-weight: 800;
      font-size: 0.85rem;
    }
    .steps li.active {
      color: var(--rw-red-dark);
      border-color: rgba(199, 70, 52, 0.42);
      background: rgba(199, 70, 52, 0.10);
    }
    .steps span {
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      color: #fff;
      background: var(--rw-ink);
      border-radius: 999px;
      font-size: 0.78rem;
    }
    .steps li.active span {
      background: var(--rw-red);
    }
    .status-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 6px 10px;
      border-radius: 999px;
      color: var(--rw-red-dark);
      background: rgba(199, 70, 52, 0.12);
      font-weight: 800;
      font-size: 0.84rem;
    }
    .bar {
      height: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(22, 21, 19, 0.10);
    }
    .bar span {
      display: block;
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, var(--rw-red), var(--rw-gold));
      transition: width 240ms ease;
    }
    .log {
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
      color: var(--rw-muted);
    }
    .log li {
      padding: 10px 0;
      border-bottom: 1px solid var(--rw-line);
    }
    .log li:last-child { border-bottom: 0; }
    .log small { color: var(--rw-subtle); overflow-wrap: anywhere; }
    .result-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }
    .results {
      display: none;
      padding: 20px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric {
      padding: 16px;
      background: var(--rw-panel-2);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
    }
    .metric strong {
      display: block;
      font-size: 1.8rem;
      line-height: 1;
      overflow-wrap: anywhere;
    }
    .metric span {
      color: var(--rw-muted);
      font-size: 0.9rem;
    }
    .metric.value-metric strong {
      font-size: 1rem;
      line-height: 1.25;
    }
    .decision-brief {
      display: grid;
      gap: 16px;
      margin: 0 0 16px;
      padding: 18px;
      background: linear-gradient(135deg, #fff, var(--rw-panel-2));
      border: 1px solid var(--rw-line);
      border-left: 5px solid var(--rw-red);
      border-radius: 8px;
    }
    .decision-brief h3 {
      margin: 0 0 8px;
      font-size: 1.28rem;
    }
    .decision-brief p {
      margin-bottom: 0;
      color: var(--rw-muted);
    }
    .brief-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .brief-grid article {
      padding: 14px;
      background: #fff;
      border: 1px solid var(--rw-line);
      border-radius: 8px;
    }
    .brief-grid h4 {
      margin: 0 0 8px;
      color: var(--rw-muted);
      font-size: 0.86rem;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 16px 0 20px;
    }
    .review-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 0 0 18px;
    }
    .review-meta div {
      padding: 12px;
      background: var(--rw-panel-2);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
      overflow-wrap: anywhere;
    }
    .review-meta span {
      display: block;
      color: var(--rw-muted);
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .review-meta strong {
      display: block;
      margin-top: 4px;
      font-size: 0.92rem;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin: 12px 0 14px;
      padding: 12px;
      background: var(--rw-panel-2);
      border: 1px solid var(--rw-line);
      border-radius: 8px;
    }
    .filter-button {
      padding: 8px 10px;
      color: var(--rw-ink);
      background: rgba(22, 21, 19, 0.07);
      font-size: 0.86rem;
    }
    .filter-button.active {
      color: #fff;
      background: var(--rw-ink);
    }
    .filters select {
      min-height: 36px;
      padding: 7px 10px;
      border: 1px solid var(--rw-line-strong);
      border-radius: 8px;
      color: var(--rw-ink);
      background: #fff;
      font: inherit;
      font-weight: 700;
    }
    .inline-check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--rw-muted);
      font-size: 0.86rem;
    }
    .inline-check input {
      width: auto;
      margin: 0;
    }
    .concerns {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }
    .concern-group {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    .concern-group h4 {
      margin: 0;
      color: var(--rw-muted);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .concern {
      padding: 14px;
      border: 1px solid var(--rw-line);
      border-left: 5px solid var(--rw-gold);
      border-radius: 8px;
      background: #fff;
    }
    .concern.high { border-left-color: var(--rw-red); }
    .concern.low { border-left-color: var(--rw-green); }
    .concern p { margin: 5px 0 0; color: var(--rw-muted); }
    .pages {
      margin-top: 16px;
      display: grid;
      gap: 10px;
    }
    .page-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--rw-line);
      border-radius: 8px;
      background: #fff;
    }
    .page-row small { display: block; color: var(--rw-muted); overflow-wrap: anywhere; }
    .history {
      padding: 20px;
    }
    .history-list {
      display: grid;
      gap: 10px;
    }
    .history-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      background: #fff;
      border: 1px solid var(--rw-line);
      border-radius: 8px;
    }
    .history-item strong,
    .history-item small {
      display: block;
      overflow-wrap: anywhere;
    }
    .history-item small {
      color: var(--rw-muted);
    }
    .empty {
      padding: 36px;
      text-align: center;
      color: var(--rw-muted);
      background: rgba(255, 255, 255, 0.72);
      border: 1px dashed var(--rw-line-strong);
      border-radius: 8px;
    }
    .error {
      color: #991b1b;
      background: #fef2f2;
      border: 1px solid #fecaca;
      padding: 12px;
      border-radius: 8px;
      display: none;
      margin-top: 14px;
    }
    @media (max-width: 900px) {
      .topbar, .hero-panel, .layout { display: block; }
      .brand { margin-bottom: 8px; }
      .top-actions { justify-content: flex-start; }
      .hero-side { margin-top: 18px; }
      form.panel { position: static; margin-bottom: 18px; }
      .metrics, .pair, .brief-grid { grid-template-columns: 1fr; }
      .review-meta { grid-template-columns: 1fr; }
      .steps { grid-template-columns: 1fr; }
      .result-header { display: block; }
      .page-row { grid-template-columns: 1fr; }
      .history-item { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="app">
    <nav class="topbar" aria-label="Application">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">${productIconSvg}</span>
        <span>${escapeHtml(productName)}</span>
      </div>
      <div class="top-actions">
        <small>Version ${escapeHtml(appVersion)}</small>
        <button class="ghost exit-button" id="exit-button" type="button">Exit</button>
      </div>
    </nav>

    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(productName)}</p>
        <h1>Review business websites with confidence</h1>
        <p>${escapeHtml(productSummary)}</p>
      </div>
      <aside class="hero-side" aria-label="Review limits">
        <div class="hero-stat"><span>Page limit</span><strong>25</strong></div>
        <div class="hero-stat"><span>Internal depth</span><strong>2</strong></div>
        <div class="hero-stat"><span>Evidence</span><strong>Local</strong></div>
        <div class="hero-stat"><span>External links</span><strong>Manual</strong></div>
      </aside>
    </section>

    <div class="layout">
      <form class="panel" id="review-form">
        <div class="section-title">
          <p class="eyebrow">Setup</p>
          <h2>Review details</h2>
          <p>${escapeHtml(productTagline)}</p>
        </div>
        <label>
          Website URL
          <input id="website-url" name="websiteUrl" type="text" inputmode="url" placeholder="example.com or https://example.com" required>
          <span class="field-note">Bare domains are accepted.</span>
        </label>
        <label>
          Company name
          <input id="company-name" name="companyName" type="text" placeholder="Optional">
          <span class="field-note">Improves name and identity matching.</span>
        </label>
        <label>
          Claimed location
          <input id="claimed-location" name="claimedLocation" type="text" placeholder="Optional">
          <span class="field-note">Used to compare visible location details.</span>
        </label>
        <label>
          Expected registration state
          <input id="expected-state" name="expectedState" type="text" placeholder="Optional, such as Texas or TX">
          <span class="field-note">Used for the manual business registration follow-up item.</span>
        </label>
        <label>
          Claimed industry or service
          <input id="claimed-industry" name="claimedIndustry" type="text" placeholder="Optional, such as IT staffing">
          <span class="field-note">Used to compare the site description with the provided service area.</span>
        </label>
        <label>
          Additional identifiers
          <input id="additional-identifiers" name="additionalIdentifiers" type="text" placeholder="Optional, such as license, phone, or email">
          <span class="field-note">Separate multiple identifiers with commas.</span>
        </label>
        <label>
          Save under
          <input id="output-root" name="outputRoot" type="text" value="${outputRoot}">
        </label>
        <div class="pair">
          <label>
            Page limit
            <input id="max-pages" name="maxPages" type="number" min="1" max="25" value="25">
            <span class="field-note">Higher limits take longer.</span>
          </label>
          <label>
            Link depth
            <input id="max-depth" name="maxDepth" type="number" min="0" max="2" value="2">
            <span class="field-note">Standard reviews use depth 2.</span>
          </label>
        </div>
        <button class="primary" id="start-button" type="submit">Start Review</button>
        <button class="ghost cancel-button" id="cancel-button" type="button" hidden>Cancel Review</button>
        <div class="error" id="form-error"></div>
      </form>

      <div class="content">
        <section class="panel readiness">
          <div class="section-title">
            <p class="eyebrow">App Readiness</p>
            <h2>Ready to review</h2>
            <p>Local setup checks for browser review and report output.</p>
          </div>
          <ul class="ready-list" id="ready-list">${readinessItems}</ul>
        </section>

        <section class="panel status" aria-live="polite">
          <ol class="steps" id="steps" aria-label="Review steps">
            <li class="active" data-step="setup"><span>1</span>Setup</li>
            <li data-step="progress"><span>2</span>Progress</li>
            <li data-step="results"><span>3</span>Results</li>
          </ol>
          <div class="status-top">
            <div>
              <p class="eyebrow">Activity</p>
              <h2 id="status-title">Ready</h2>
            </div>
            <span class="pill" id="status-pill">Idle</span>
          </div>
          <div class="bar"><span id="progress-bar"></span></div>
          <ul class="log" id="activity-log" aria-live="polite">
            <li>Enter a website URL to begin.</li>
          </ul>
        </section>

        <section class="panel results" id="results"></section>
        <section class="empty" id="empty-state">Review results will appear here.</section>
        <section class="panel history">
          <div class="section-title">
            <p class="eyebrow">Recent Reviews</p>
            <h2>This session</h2>
            <p>Reviews from this app session appear here until the app is closed.</p>
          </div>
          <div class="history-list" id="history-list">
            <p class="empty">No reviews started yet.</p>
          </div>
        </section>
      </div>
    </div>
  </main>

  <script>
    const form = document.querySelector("#review-form");
    const startButton = document.querySelector("#start-button");
    const cancelButton = document.querySelector("#cancel-button");
    const formError = document.querySelector("#form-error");
    const statusTitle = document.querySelector("#status-title");
    const statusPill = document.querySelector("#status-pill");
    const progressBar = document.querySelector("#progress-bar");
    const activityLog = document.querySelector("#activity-log");
    const results = document.querySelector("#results");
    const emptyState = document.querySelector("#empty-state");
    const steps = document.querySelector("#steps");
    const historyList = document.querySelector("#history-list");
    const exitButton = document.querySelector("#exit-button");
    let activeJobId = null;
    let timer = null;
    let closingApp = false;

    refreshHistory();

    cancelButton.addEventListener("click", cancelActiveReview);
    exitButton.addEventListener("click", shutdownApp);
    window.addEventListener("pagehide", () => {
      if (!closingApp) {
        navigator.sendBeacon("/api/shutdown");
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError();
      startButton.disabled = true;
      startButton.textContent = "Review Running";
      cancelButton.hidden = false;
      setStep("progress");
      setStatus("Starting", "Running", 12);
      activityLog.innerHTML = "<li>Starting review.</li>";
      results.style.display = "none";
      emptyState.style.display = "block";

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.maxPages = Number(payload.maxPages || 25);
      payload.maxDepth = Number(payload.maxDepth || 2);

      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || "Review could not start.");
        activeJobId = job.id;
        renderJob(job);
        refreshHistory();
        timer = setInterval(pollJob, 1200);
      } catch (error) {
        showError(error.message);
        startButton.disabled = false;
        startButton.textContent = "Start Review";
        cancelButton.hidden = true;
        setStep("setup");
        setStatus("Ready", "Idle", 0);
      }
    });

    async function pollJob() {
      if (!activeJobId) return;
      const response = await fetch("/api/reviews/" + activeJobId);
      const job = await response.json();
      renderJob(job);
      refreshHistory();
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        clearInterval(timer);
        startButton.disabled = false;
        startButton.textContent = "Start Review";
        cancelButton.hidden = true;
      }
    }

    function renderJob(job) {
      const last = job.updates[job.updates.length - 1];
      const progress = job.status === "completed" ? 100 : job.status === "failed" ? 100 : Math.min(90, 18 + job.updates.length * 11);
      setStatus(last?.message || "Review running", titleCase(job.status), progress);
      activityLog.innerHTML = job.updates.slice(-8).reverse().map((update) =>
        "<li><strong>" + escapeHtml(update.message) + "</strong>" +
        (update.detail ? "<br><small>" + escapeHtml(update.detail) + "</small>" : "") + "</li>"
      ).join("");

      if (job.status === "failed") {
        showError(job.error || "Review failed.");
        setStep("results");
      }

      if (job.status === "cancelled") {
        clearError();
        setStep("setup");
        setStatus("Review cancelled", "Cancelled", 100);
        startButton.disabled = false;
        startButton.textContent = "Start Review";
        cancelButton.hidden = true;
        activityLog.innerHTML = "<li>Review cancelled.</li>";
        emptyState.style.display = "block";
        results.style.display = "none";
      }

      if (job.status === "completed" && job.result) {
        setStep("results");
        renderResults(job);
      }
    }

    async function cancelActiveReview() {
      if (!activeJobId) return;
      cancelButton.disabled = true;
      cancelButton.textContent = "Cancelling";
      setStatus("Cancelling review", "Cancelling", 100);
      try {
        const response = await fetch("/api/cancel/" + activeJobId, { method: "POST" });
        const job = await response.json();
        renderJob(job);
        refreshHistory();
      } catch (error) {
        showError(error.message || "Review could not be cancelled.");
      } finally {
        cancelButton.disabled = false;
        cancelButton.textContent = "Cancel Review";
      }
    }

    function renderResults(job) {
      emptyState.style.display = "none";
      results.style.display = "block";
      const result = job.result;
      const concerns = result.concerns || [];
      const pages = result.pages || [];
      const snapshot = result.summary.snapshot || {};
      results.innerHTML = \`
        <div class="result-header">
          <div>
            <p class="eyebrow">Results</p>
            <h2>\${escapeHtml(result.summary.riskLevel || result.summary.concernLevel)}</h2>
          </div>
          <span class="pill">\${escapeHtml(titleCase(job.status))}</span>
        </div>
        \${renderDecisionBrief(result.summary.decisionBrief)}
        <div class="metrics">
          <div class="metric"><strong>\${escapeHtml(result.summary.riskLevel || result.summary.concernLevel)}</strong><span>Review outcome</span></div>
          <div class="metric"><strong>\${escapeHtml(result.summary.confidence || "Medium")}</strong><span>Confidence</span></div>
          <div class="metric"><strong>\${escapeHtml(result.summary.likelyOfficialWebsite || result.identity?.likelyOfficialSite || "Unclear")}</strong><span>Likely official website</span></div>
        </div>
        <h3>Final Assessment</h3>
        \${renderAssessment(result.summary.finalAssessment)}
        <h3>Verified Facts</h3>
        \${renderInlineList(result.summary.verifiedFacts || [])}
        <h3>Positive Indicators</h3>
        \${renderInlineList(result.summary.positiveIndicators || [])}
        <h3>Unknown Or Manual Follow-Up</h3>
        \${renderInlineList([...(result.summary.unknowns || []), ...(result.summary.manualFollowUps || [])])}
        <h3>Category Assessment</h3>
        \${renderCategoryAssessment(result.summary.categoryAssessments || [])}
        <h3>Review Snapshot</h3>
        <div class="metrics">
          <div class="metric"><strong>\${snapshot.pagesReviewed ?? pages.length}</strong><span>Pages reviewed</span></div>
          <div class="metric"><strong>\${snapshot.concernsFound ?? concerns.length}</strong><span>Concerns</span></div>
          <div class="metric"><strong>\${snapshot.screenshotsCaptured ?? pages.length}</strong><span>Screenshots</span></div>
          <div class="metric"><strong>\${snapshot.emailsFound ?? 0}</strong><span>Emails</span></div>
          <div class="metric"><strong>\${snapshot.phonesFound ?? 0}</strong><span>Phones</span></div>
          <div class="metric"><strong>\${snapshot.contactFormsFound ?? 0}</strong><span>Contact forms</span></div>
        </div>
        <div class="actions">
          <a class="secondary button-link" href="\${result.paths.reportHtml}" target="_blank" rel="noopener noreferrer">Open HTML Report</a>
          <a class="ghost button-link" href="\${result.paths.summaryHtml}" target="_blank" rel="noopener noreferrer">Open Summary</a>
          <a class="ghost button-link" href="\${result.paths.summaryText}" target="_blank" rel="noopener noreferrer">Open Text Summary</a>
          <a class="ghost button-link" href="\${result.paths.checklistMarkdown}" target="_blank" rel="noopener noreferrer">Open Checklist</a>
          <a class="ghost button-link" href="\${result.paths.reportMarkdown}" target="_blank" rel="noopener noreferrer">Open Markdown</a>
          <a class="ghost button-link" href="\${result.paths.evidenceJson}" target="_blank" rel="noopener noreferrer">Open Evidence JSON</a>
          <button class="ghost" type="button" id="copy-summary">Copy Summary</button>
          <button class="ghost" type="button" id="open-folder">Open Report Folder</button>
        </div>
        <div class="review-meta">
          <div><span>Saved folder</span><strong>\${escapeHtml(job.outputDir || result.paths.outputDir || "")}</strong></div>
          <div><span>Started</span><strong>\${escapeHtml(formatDate(job.startedAt))}</strong></div>
        </div>
        <h3>Site Identity Summary</h3>
        \${renderIdentity(result.identity, result.siteAvailability)}
        <h3>Domain And Page Dates</h3>
        \${renderDomainDates(result.domainRegistration, pages[0], job.input)}
        <h3>External Evidence</h3>
        \${renderExternalEvidence(result.externalEvidence)}
        <h3>Verification Coverage</h3>
        \${renderCoverage(result.signals, result.domainRegistration, pages[0], job.input, result.externalEvidence)}
        \${renderSitemap(result.sitemap)}
        \${renderDetails(result.signals)}
        <h3>Priority Follow-Up</h3>
        <div class="concerns">
          \${concerns.length ? renderPriorityConcerns(concerns) : "<p class='empty'>No priority follow-up items were generated.</p>"}
        </div>
        <h3>Grouped Concerns</h3>
        <div class="filters" id="concern-filters">
          <button class="filter-button active" type="button" data-area="all">All</button>
          <button class="filter-button" type="button" data-area="page_quality">Pages</button>
          <button class="filter-button" type="button" data-area="content_quality">Content</button>
          <button class="filter-button" type="button" data-area="business_identity">Business Details</button>
          <button class="filter-button" type="button" data-area="policy_pages">Policies</button>
          <button class="filter-button" type="button" data-area="commercial_behavior">Commercial</button>
          <select id="severity-filter" aria-label="Concern severity">
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label class="inline-check"><input id="priority-filter" type="checkbox"> Priority only</label>
        </div>
        <div class="concerns" id="filtered-concerns"></div>
        <h3>Pages</h3>
        <div class="pages">
          \${pages.map(renderPage).join("")}
        </div>
      \`;
      document.querySelector("#open-folder").addEventListener("click", async () => {
        await fetch("/api/open-folder/" + job.id, { method: "POST" });
      });
      document.querySelector("#copy-summary").addEventListener("click", async () => {
        await copyText(result.summaryText || "", document.querySelector("#copy-summary"));
      });
      wireConcernFilters(concerns);
    }

    function wireConcernFilters(concerns) {
      const filters = document.querySelector("#concern-filters");
      const severity = document.querySelector("#severity-filter");
      const priority = document.querySelector("#priority-filter");
      const output = document.querySelector("#filtered-concerns");
      if (!filters || !severity || !priority || !output) return;
      let area = "all";

      const render = () => {
        let items = [...concerns];
        if (area !== "all") {
          items = items.filter((concern) => concern.area === area);
        }
        if (severity.value !== "all") {
          items = items.filter((concern) => concern.severity === severity.value);
        }
        if (priority.checked) {
          items = uniqueConcerns(items).sort((left, right) => severityRank(right.severity) - severityRank(left.severity)).slice(0, 5);
        }
        output.innerHTML = items.length ? renderConcernGroups(items) : "<p class='empty'>No concerns match the selected filters.</p>";
      };

      filters.querySelectorAll("[data-area]").forEach((button) => {
        button.addEventListener("click", () => {
          area = button.dataset.area || "all";
          filters.querySelectorAll("[data-area]").forEach((item) => item.classList.toggle("active", item === button));
          render();
        });
      });
      severity.addEventListener("change", render);
      priority.addEventListener("change", render);
      render();
    }

    function renderAssessment(assessment) {
      if (!assessment) return "<p class='empty'>Assessment was not available.</p>";
      return \`<div class="concerns">
        <article class="concern low">
          <strong>\${escapeHtml(assessment.label)}</strong>
          \${renderInlineList(assessment.reasons || [])}
          <p>\${escapeHtml(assessment.recommendation || "")}</p>
        </article>
      </div>\`;
    }

    function renderDecisionBrief(brief) {
      if (!brief) return "";
      return \`<section class="decision-brief">
        <div>
          <p class="eyebrow">Decision Brief</p>
          <h3>\${escapeHtml(brief.headline || "Review outcome")}</h3>
          <p>\${escapeHtml(brief.recommendation || "")}</p>
        </div>
        <div class="brief-grid">
          <article>
            <h4>Top findings</h4>
            \${renderInlineList(brief.topFindings || [])}
          </article>
          <article>
            <h4>Next steps</h4>
            \${renderInlineList(brief.nextSteps || [])}
          </article>
        </div>
      </section>\`;
    }

    function renderConcern(concern) {
      return \`<article class="concern \${escapeHtml(concern.severity)}">
        <strong>\${escapeHtml(concern.label ? concern.label + ": " + concern.message : concern.message)}</strong>
        <p>\${escapeHtml(concern.evidence || concern.pageUrl || "")}</p>
      </article>\`;
    }

    function renderConcernGroups(concerns) {
      const groups = [
        ["page_quality", "Page Loading And Links"],
        ["content_quality", "Content Quality"],
        ["business_identity", "Business Details"],
        ["policy_pages", "Common Policy Pages"],
        ["commercial_behavior", "Commercial Behavior"]
      ];
      return groups.map(([area, label]) => {
        const items = concerns.filter((concern) => concern.area === area);
        if (!items.length) return "";
        return \`<div class="concern-group"><h4>\${escapeHtml(label)}</h4>\${items.map(renderConcern).join("")}</div>\`;
      }).join("");
    }

    function renderPriorityConcerns(concerns) {
      return uniqueConcerns(concerns)
        .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
        .slice(0, 5)
        .map(renderConcern)
        .join("");
    }

    function uniqueConcerns(concerns) {
      const seen = new Set();
      return [...concerns].filter((concern) => {
        const key = [concern.code, concern.evidence || "", concern.message].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function severityRank(severity) {
      if (severity === "high") return 3;
      if (severity === "medium") return 2;
      return 1;
    }

    function renderIdentity(identity, siteAvailability) {
      if (!identity) return "<p class='empty'>Site identity summary was not available for this review.</p>";
      const relatedDomains = identity.relatedDomains || [];
      const found = identity.found || {};
      const provided = identity.provided || {};
      return \`
        <div class="metrics">
          <div class="metric"><strong>\${escapeHtml(identity.matchLevel || "Unclear match")}</strong><span>Entity match</span></div>
          <div class="metric"><strong>\${escapeHtml(identity.likelyOfficialSite || "Unclear")}</strong><span>Likely official website</span></div>
          <div class="metric"><strong>\${escapeHtml(identity.reviewedDomain || "n/a")}</strong><span>Reviewed domain</span></div>
        </div>
        <div class="concerns">
          <article class="concern low">
            <strong>Provided by user</strong>
            <p>Company: \${escapeHtml(provided.companyName || "not provided")}</p>
            <p>Location: \${escapeHtml(provided.claimedLocation || "not provided")}</p>
            <p>Expected state: \${escapeHtml(provided.expectedState || "not provided")}</p>
            <p>Industry/service: \${escapeHtml(provided.claimedIndustry || "not provided")}</p>
            <p>Additional identifiers: \${escapeHtml(provided.additionalIdentifiers || "not provided")}</p>
          </article>
          <article class="concern low">
            <strong>Found on reviewed pages</strong>
            <p>Company name: \${provided.companyName ? (found.companyNameInText ? "Found" : "Needs follow-up") : "Not provided"}; Location: \${provided.claimedLocation ? (found.claimedLocationInText ? "Found" : "Needs follow-up") : "Not provided"}</p>
            <p>Industry/service: \${provided.claimedIndustry ? (found.claimedIndustryInText ? "Found" : "Needs follow-up") : "Not provided"}</p>
            <p>Email domains: \${escapeHtml((found.emailDomains || []).join(", ") || "none found")}</p>
            <p>Phones: \${(found.phones || []).length}; Address-like lines: \${(found.addressLines || []).length}; Social links: \${(found.socialLinks || []).length}</p>
          </article>
          <article class="concern low">
            <strong>Common entry points</strong>
            \${renderEntryPointList(siteAvailability)}
          </article>
          <article class="concern low">
            <strong>Related domains</strong>
            \${relatedDomains.length ? "<p>" + relatedDomains.slice(0, 8).map((item) => escapeHtml(item.domain + " (" + (item.sources || []).join(", ") + ")")).join("<br>") + "</p>" : "<p>None found</p>"}
          </article>
          <article class="concern low">
            <strong>Identity reasons</strong>
            \${renderInlineList(identity.reasons || [])}
          </article>
          <article class="concern low">
            <strong>Manual follow-up recommended</strong>
            \${renderInlineList(identity.manualFollowUps || [])}
          </article>
        </div>\`;
    }

    function renderEntryPointList(siteAvailability) {
      if (!Array.isArray(siteAvailability) || siteAvailability.length === 0) return "<p>Not available</p>";
      return "<p>" + siteAvailability.map((check) => {
        const status = check.status ? "HTTP " + check.status : check.note ? "not loaded" : "not available";
        const outcome = check.ok ? "Loaded" : "Needs follow-up";
        return escapeHtml(check.url + ": " + outcome + " (" + status + ")");
      }).join("<br>") + "</p>";
    }

    function renderDomainDates(registration, homepage, input) {
      const lastModified = homepage?.lastModified
        ? homepage.lastModified.value + " (" + (homepage.lastModified.source === "http_header" ? "HTTP header" : "page metadata") + ")"
        : "not available";
      const status = registration
        ? registration.status === "found"
          ? "Found"
          : (registration.note ? registration.status + ": " + registration.note : registration.status)
        : "not checked";
      const items = [
        ["Domain", registration?.domain || input?.websiteUrl || "not available"],
        ["Lookup status", status],
        ["Created", registration?.creationDate || "not available"],
        ["Last changed", registration?.lastChangedDate || "not available"],
        ["Registrar", registration?.registrar || "not available"],
        ["Homepage last modified", lastModified],
        ["Manual registration state", input?.expectedState || "not provided"]
      ];
      return \`<div class="metrics">\${items.map(([label, value]) =>
        \`<div class="metric value-metric"><strong>\${escapeHtml(value)}</strong><span>\${escapeHtml(label)}</span></div>\`
      ).join("")}</div>\`;
    }

    function renderExternalEvidence(external) {
      if (!external) return "<p class='empty'>External evidence was not generated for this review.</p>";
      const items = external.items || [];
      const registries = external.registryChecks || [];
      const searches = external.searchLinks || [];
      const profiles = external.profileLinks || [];
      return \`
        <div class="concerns">
          <article class="concern low">
            <strong>Evidence labels</strong>
            \${renderInlineList([
              "Verified from reviewed website",
              "Found in public external source",
              "Manual follow-up recommended",
              "Could not verify from local run"
            ])}
          </article>
          <article class="concern low">
            <strong>Evidence items</strong>
            \${items.length ? renderInlineList(items.map((item) => item.title + ": " + item.label + ". " + item.detail)) : "<p>None generated</p>"}
          </article>
          <article class="concern low">
            <strong>State registry checklist</strong>
            \${registries.length ? registries.map(renderRegistryEvidence).join("") : "<p>No supported state registry checklist was generated. Add an expected state to generate one.</p>"}
          </article>
          <article class="concern low">
            <strong>Public search links</strong>
            \${searches.length ? searches.map(renderSearchEvidence).join("") : "<p>No public search links were generated.</p>"}
          </article>
          <article class="concern low">
            <strong>Website-discovered profile links</strong>
            \${profiles.length ? profiles.map(renderProfileEvidence).join("") : "<p>No external profile links were found on reviewed website pages.</p>"}
          </article>
        </div>\`;
    }

    function renderRegistryEvidence(registry) {
      return \`<p><a href="\${escapeHtml(registry.searchUrl)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(registry.state)} registry search</a><br><span class="muted">\${escapeHtml(registry.detail || "")}</span></p>\`;
    }

    function renderSearchEvidence(link) {
      return \`<p><a href="\${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(link.label)}</a><br><span class="muted">\${escapeHtml(link.query || "")}</span></p>\`;
    }

    function renderProfileEvidence(profile) {
      return \`<p><a href="\${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(profile.platform)}</a><br><span class="muted">\${escapeHtml(profile.detail || profile.label || "")}</span></p>\`;
    }

    function renderSitemap(sitemap) {
      if (!sitemap) return "";
      const status = sitemap.status ? "HTTP " + sitemap.status : sitemap.note ? "Not available" : "Not checked";
      const found = sitemap.found ? "Found" : "Needs follow-up";
      const count = Array.isArray(sitemap.pageUrls) ? sitemap.pageUrls.length : 0;
      return \`<h3>Sitemap</h3>
        <div class="metrics">
          <div class="metric"><strong>\${escapeHtml(found)}</strong><span>Sitemap</span></div>
          <div class="metric"><strong>\${count}</strong><span>Page URLs found</span></div>
          <div class="metric"><strong>\${escapeHtml(status)}</strong><span>Status</span></div>
        </div>\`;
    }

    function renderInlineList(items) {
      if (!items.length) return "<p>None generated</p>";
      return "<ul>" + items.slice(0, 6).map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>";
    }

    function renderCategoryAssessment(categories) {
      if (!Array.isArray(categories) || categories.length === 0) return "<p class='empty'>Category assessment was not available.</p>";
      return "<div class='concerns'>" + categories.map((category) => \`
        <article class="concern low">
          <strong>\${escapeHtml(category.label || category.key)}: \${escapeHtml(category.level || "Not available")}</strong>
          \${renderInlineList([...(category.evidence || []), ...(category.unknowns || []), ...(category.manualFollowUps || [])])}
        </article>
      \`).join("") + "</div>";
    }

    function renderDetails(signals) {
      if (!signals) return "";
      const commonPages = Object.entries(signals.pagePresence || {})
        .filter((entry) => entry[1])
        .map((entry) => entry[0]);
      return \`<h3>Public Details Found</h3>
        <div class="metrics">
          <div class="metric"><strong>\${signals.emails?.length || 0}</strong><span>Emails</span></div>
          <div class="metric"><strong>\${signals.phones?.length || 0}</strong><span>Phones</span></div>
          <div class="metric"><strong>\${commonPages.length}</strong><span>Common pages</span></div>
        </div>\`;
    }

    function renderCoverage(signals, registration, homepage, input, external) {
      if (!signals) return "<p class='empty'>Verification coverage could not be loaded.</p>";
      const items = [
        ["Contact page", hasLinkedOrReviewed(signals, "contact")],
        ["Privacy Policy", hasLinkedOrReviewed(signals, "privacy")],
        ["Terms page", hasLinkedOrReviewed(signals, "terms")],
        ["About page", hasLinkedOrReviewed(signals, "about")],
        ["Refund/return page", hasLinkedOrReviewed(signals, "refund")],
        ["Shipping/delivery page", hasLinkedOrReviewed(signals, "shipping")],
        ["Cancellation page", hasLinkedOrReviewed(signals, "cancellation")],
        ["Email", (signals.emails || []).length > 0],
        ["Phone", (signals.phones || []).length > 0],
        ["Address", (signals.addressLines || []).length > 0],
        ["Social profile", (signals.socialLinks || []).length > 0],
        ["Domain dates", registration?.status === "found" && Boolean(registration?.creationDate)],
        ["Homepage modified", Boolean(homepage?.lastModified)],
        ["Registration state", Boolean(input?.expectedState)],
        ["State registry link", Boolean((external?.registryChecks || []).length)],
        ["Public search links", Boolean((external?.searchLinks || []).length)],
        ["External profile links", Boolean((external?.profileLinks || []).length)]
      ];
      return \`<div class="metrics">\${items.map(([label, found]) =>
        \`<div class="metric"><strong>\${found ? "Found" : "Missing"}</strong><span>\${escapeHtml(label)}</span></div>\`
      ).join("")}</div>\`;
    }

    function hasLinkedOrReviewed(signals, key) {
      const detail = signals.pagePresenceDetails?.[key];
      const sources = detail?.sources || [];
      return sources.includes("linked") || sources.includes("reviewed_page");
    }

    function renderPage(page) {
      return \`<article class="page-row">
        <div>
          <strong>\${escapeHtml(page.title || page.finalUrl)}</strong>
          <small>\${escapeHtml(page.finalUrl)}</small>
          <small>\${escapeHtml((page.headings || []).slice(0, 2).join(" | "))}</small>
          <small>Last modified: \${escapeHtml(page.lastModified ? page.lastModified.value : "not available")}</small>
        </div>
        <span class="pill">HTTP \${escapeHtml(String(page.status || "n/a"))}</span>
        <span>\${page.links} links</span>
        <span>\${page.emails + page.phones + page.contactForms} details</span>
        \${page.screenshotUrl ? \`<a class="button-link ghost compact" href="\${escapeHtml(page.screenshotUrl)}" target="_blank" rel="noopener noreferrer">Screenshot</a>\` : "<span></span>"}
      </article>\`;
    }

    async function refreshHistory() {
      try {
        const response = await fetch("/api/reviews");
        const jobs = await response.json();
        if (!Array.isArray(jobs) || jobs.length === 0) {
          historyList.innerHTML = "<p class='empty'>No reviews started yet.</p>";
          return;
        }

        historyList.innerHTML = jobs.map(renderHistoryItem).join("");
      } catch {
        historyList.innerHTML = "<p class='empty'>Recent reviews could not be loaded.</p>";
      }
    }

    function renderHistoryItem(job) {
      const host = job.input?.websiteUrl || "Business website review";
      const status = titleCase(job.status || "unknown");
      const reportLink = job.result?.paths?.reportHtml
        ? \`<a class="button-link ghost" href="\${job.result.paths.reportHtml}" target="_blank" rel="noopener noreferrer">Open Report</a>\`
        : \`<span class="pill">\${escapeHtml(status)}</span>\`;
      return \`<article class="history-item">
        <div>
          <strong>\${escapeHtml(host)}</strong>
          <small>\${escapeHtml(status)} - \${escapeHtml(job.startedAt || "")}</small>
        </div>
        \${reportLink}
      </article>\`;
    }

    async function copyText(text, button) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Summary copied", "Copied", 100);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        setStatus("Summary copied", "Copied", 100);
      }
      if (button) {
        const original = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = original;
        }, 1400);
      }
    }

    function shutdownApp() {
      closingApp = true;
      if (timer) clearInterval(timer);
      setStatus("Closing app", "Closing", 100);
      activityLog.innerHTML = "<li>Closing the local app.</li>";
      const sent = navigator.sendBeacon("/api/shutdown");
      if (!sent) {
        fetch("/api/shutdown", { method: "POST", keepalive: true }).catch(() => {});
      }
      setTimeout(() => {
        document.body.innerHTML = "<main class='app'><section class='panel status'><h1>${escapeHtml(productName)} closed</h1><p>You can close this browser window.</p></section></main>";
      }, 150);
    }

    function setStatus(title, pill, progress) {
      statusTitle.textContent = title;
      statusPill.textContent = pill;
      progressBar.style.width = progress + "%";
    }

    function showError(message) {
      formError.textContent = message;
      formError.style.display = "block";
    }

    function clearError() {
      formError.textContent = "";
      formError.style.display = "none";
    }

    function titleCase(value) {
      return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
    }

    function formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    }

    function setStep(stepName) {
      steps.querySelectorAll("li").forEach((step) => {
        step.classList.toggle("active", step.dataset.step === stepName);
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
  </script>
  <style>
    .button-link {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      border-radius: 8px;
      padding: 12px 15px;
      font-weight: 800;
      transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }
    .button-link.compact {
      padding: 8px 10px;
      font-size: 0.86rem;
      white-space: nowrap;
    }
  </style>
</body>
</html>`;
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const value = body[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseNumberField(body: unknown, key: string, fallback: number, min: number, max: number): number {
  if (!isRecord(body)) {
    return fallback;
  }

  const value = Number(body[key]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function getJobFromPath(pathname: string, prefix: string): ReviewJob | undefined {
  const id = pathname.slice(prefix.length);
  return jobs.get(id);
}

function contentType(fileName: string): string {
  if (fileName.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (fileName.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  if (fileName.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (fileName.endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function sendText(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

function sendJson(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function openUrl(url: string): void {
  if (process.platform === "win32") {
    spawn("explorer.exe", [url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function openPath(targetPath: string): void {
  if (process.platform === "win32") {
    spawn("explorer.exe", [targetPath], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }

  openUrl(pathToFileURL(targetPath).toString());
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isAllowedArtifact(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const topLevelFiles = new Set(["report.html", "report.md", "summary.html", "client-summary.txt", "follow-up-checklist.md", "evidence.json"]);
  return topLevelFiles.has(normalized) || /^screenshots\/[^/]+\.png$/i.test(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
