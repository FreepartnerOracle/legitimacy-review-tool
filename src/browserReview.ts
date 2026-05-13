import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { Browser, Page, Response } from "playwright";
import { throwIfCancelled } from "./cancel.js";
import { lookupDomainRegistrationDates } from "./domainRegistration.js";
import { executableName } from "./product.js";
import { extractPageDetails } from "./signals.js";
import type {
  LinkRecord,
  PageFormDetails,
  PageRecord,
  ProgressUpdate,
  ReviewEvidence,
  ReviewOptions,
  SitemapEvidence,
  UrlVariantCheck
} from "./types.js";

type PlaywrightModule = typeof import("playwright");
type ProgressHandler = (update: ProgressUpdate) => void;
type LinkStatus = {
  status?: number;
  note?: string;
};

const linkCheckLimit = 120;
const linkCheckConcurrency = 12;
const navigationTimeoutMs = 20_000;
const linkCheckTimeoutMs = 4_000;
const pageLoadSettleTimeoutMs = 1_500;
const contentReadTimeoutMs = 3_000;

export async function reviewPublicWebsite(
  options: ReviewOptions,
  onProgress?: ProgressHandler,
  signal?: AbortSignal
): Promise<ReviewEvidence> {
  const startedAt = new Date().toISOString();
  const startUrl = normalizeWebsiteUrl(options.websiteUrl);
  const screenshotDir = path.join(options.outputDir, "screenshots");
  throwIfCancelled(signal);
  await mkdir(screenshotDir, { recursive: true });

  onProgress?.({
    stage: "preparing",
    message: "Checking common website entry points.",
    detail: startUrl
  });

  const siteAvailability = await checkUrlVariants(startUrl, signal);
  throwIfCancelled(signal);

  onProgress?.({
    stage: "preparing",
    message: "Checking public domain registration dates.",
    detail: readableHost(startUrl)
  });

  const domainRegistration = await lookupDomainRegistrationDates(startUrl, signal);
  throwIfCancelled(signal);

  onProgress?.({
    stage: "preparing",
    message: "Checking sitemap.",
    detail: new URL("/sitemap.xml", startUrl).toString()
  });

  const sitemap = await readSitemap(startUrl, signal);
  const sitemapSeeds = sitemap.pageUrls.slice(0, options.maxPages - 1);

  onProgress?.({
    stage: "preparing",
    message: "Opening the browser review engine.",
    detail: startUrl
  });

  const playwright = await loadPlaywright();
  let browser: Browser | undefined;
  const closeOnCancel = () => {
    void browser?.close().catch(() => undefined);
  };
  signal?.addEventListener("abort", closeOnCancel, { once: true });

  try {
    throwIfCancelled(signal);
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    });
    const page = await context.newPage();

    const pages: PageRecord[] = [];
    const visited = new Set<string>();
    const queued = new Set<string>([startUrl]);
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
    let checkedLinks = 0;
    const linkStatusCache = new Map<string, LinkStatus>();

    while (queue.length > 0 && pages.length < options.maxPages) {
      throwIfCancelled(signal);
      const next = queue.shift();
      if (!next) {
        continue;
      }

      const visitUrl = normalizeForVisit(next.url);
      if (visited.has(visitUrl)) {
        continue;
      }

      visited.add(visitUrl);
      onProgress?.({
        stage: "reviewing",
        message: `Reviewing page ${pages.length + 1} of up to ${options.maxPages}.`,
        detail: visitUrl
      });

      const record = await capturePage(page, visitUrl, next.depth, screenshotDir, pages.length + 1, signal);
      throwIfCancelled(signal);
      checkedLinks = await checkPageLinks(record.links, linkStatusCache, checkedLinks, signal);

      pages.push(record);

      if (next.depth < options.maxDepth) {
        const candidates = record.links
          .filter((link) => link.internal && link.url && isHttpUrl(link.url) && isLikelyReviewPage(link.url))
          .sort((left, right) => reviewPriority(left) - reviewPriority(right));

        for (const link of candidates) {
          if (!link.internal || !link.url || !isHttpUrl(link.url)) {
            continue;
          }

          const normalized = normalizeForVisit(link.url);
          if (!visited.has(normalized) && !queued.has(normalized) && pages.length + queue.length < options.maxPages) {
            queue.push({ url: normalized, depth: next.depth + 1 });
            queued.add(normalized);
          }
        }
      }

      if (pages.length === 1 && sitemapSeeds.length > 0) {
        for (const sitemapUrl of sitemapSeeds) {
          const normalized = normalizeForVisit(sitemapUrl);
          if (!visited.has(normalized) && !queued.has(normalized) && pages.length + queue.length < options.maxPages) {
            queue.push({ url: normalized, depth: 1 });
            queued.add(normalized);
          }
        }
      }
    }

    throwIfCancelled(signal);
    await context.close();

    return {
      startedAt,
      input: {
        websiteUrl: startUrl,
        companyName: options.companyName,
        claimedLocation: options.claimedLocation,
        expectedState: options.expectedState,
        claimedIndustry: options.claimedIndustry,
        additionalIdentifiers: options.additionalIdentifiers
      },
      limits: {
        maxDepth: options.maxDepth,
        maxPages: options.maxPages
      },
      pages,
      siteAvailability,
      sitemap,
      domainRegistration
    };
  } finally {
    signal?.removeEventListener("abort", closeOnCancel);
    await browser?.close().catch(() => undefined);
  }
}

export function normalizeWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  parsed.hash = "";
  return parsed.toString();
}

async function checkUrlVariants(startUrl: string, signal?: AbortSignal): Promise<UrlVariantCheck[]> {
  const variants = homeUrlVariants(startUrl);
  return Promise.all(variants.map((url) => checkHomeUrl(url, signal)));
}

function homeUrlVariants(input: string): string[] {
  const parsed = new URL(input);
  const baseHost = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const hosts = [baseHost, `www.${baseHost}`];
  const protocols = ["https:", "http:"];
  const variants = protocols.flatMap((protocol) => hosts.map((host) => `${protocol}//${host}/`));
  return [...new Set(variants)];
}

async function checkHomeUrl(url: string, signal?: AbortSignal): Promise<UrlVariantCheck> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    throwIfCancelled(signal);
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      }
    });

    return {
      url,
      ok: response.status < 400,
      status: response.status,
      finalUrl: response.url
    };
  } catch (error) {
    throwIfCancelled(signal);
    return {
      url,
      ok: false,
      note: `Could not open entry point: ${readableError(error)}`
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

async function readSitemap(startUrl: string, signal?: AbortSignal): Promise<SitemapEvidence> {
  const sitemapUrl = new URL("/sitemap.xml", startUrl).toString();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    throwIfCancelled(signal);
    const response = await fetch(sitemapUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      }
    });

    const text = await response.text();
    const pageUrls = response.status < 400 ? extractSitemapPageUrls(text, startUrl) : [];
    return {
      url: sitemapUrl,
      found: response.status < 400 && pageUrls.length > 0,
      status: response.status,
      pageUrls
    };
  } catch (error) {
    throwIfCancelled(signal);
    return {
      url: sitemapUrl,
      found: false,
      pageUrls: [],
      note: `Could not read sitemap: ${readableError(error)}`
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

function extractSitemapPageUrls(text: string, startUrl: string): string[] {
  const base = new URL(startUrl);
  const urls = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter((url) => isHttpUrl(url))
    .filter((url) => sameSiteUrl(base, url))
    .filter((url) => isLikelyReviewPage(url))
    .map(normalizeForVisit);

  return [...new Set(urls)].slice(0, 80);
}

function sameSiteUrl(base: URL, candidate: string): boolean {
  try {
    return sameSite(base, new URL(candidate));
  } catch {
    return false;
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function capturePage(
  page: Page,
  url: string,
  depth: number,
  screenshotDir: string,
  pageNumber: number,
  signal?: AbortSignal
): Promise<PageRecord> {
  let response: Response | null = null;
  let note: string | undefined;

  try {
    throwIfCancelled(signal);
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
    await page.waitForLoadState("load", { timeout: pageLoadSettleTimeoutMs }).catch(() => undefined);
  } catch (error) {
    throwIfCancelled(signal);
    note = readableError(error);
  }

  throwIfCancelled(signal);
  const finalUrl = page.url() || url;
  const title = await page.title().catch(() => "");
  const metaDescription = await readMetaDescription(page);
  const lastModified = await readLastModified(page, response);
  const text = await page.locator("body").innerText({ timeout: contentReadTimeoutMs }).catch(() => "");
  const links = await readLinks(page, finalUrl);
  const headings = await readHeadings(page);
  const details = extractPageDetails(text, links);
  const forms = await readForms(page);
  const screenshotPath = path.join(screenshotDir, `${String(pageNumber).padStart(2, "0")}-${fileSafePageName(finalUrl)}.png`);

  try {
    throwIfCancelled(signal);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
  } catch (error) {
    throwIfCancelled(signal);
    note = note ? `${note}; screenshot not captured: ${readableError(error)}` : `Screenshot not captured: ${readableError(error)}`;
  }

  return {
    requestedUrl: url,
    finalUrl,
    title,
    metaDescription,
    lastModified,
    headings,
    status: response?.status(),
    text,
    links,
    details,
    forms,
    screenshotPath,
    depth,
    note
  };
}

async function checkPageLinks(
  links: LinkRecord[],
  cache: Map<string, LinkStatus>,
  checkedCount: number,
  signal?: AbortSignal
): Promise<number> {
  const urlsToCheck = new Set<string>();

  for (const link of links) {
    if (!link.url || !isHttpUrl(link.url)) {
      continue;
    }

    const normalized = normalizeForVisit(link.url);
    const cached = cache.get(normalized);
    if (cached) {
      applyLinkStatus(link, cached);
      continue;
    }

    if (checkedCount >= linkCheckLimit) {
      link.note ??= "Link check limit reached for this review.";
      continue;
    }

    if (!urlsToCheck.has(normalized)) {
      urlsToCheck.add(normalized);
      checkedCount += 1;
    }
  }

  await runLimited([...urlsToCheck], linkCheckConcurrency, async (url) => {
    throwIfCancelled(signal);
    cache.set(url, await checkLinkStatus(url, signal));
  });

  for (const link of links) {
    if (!link.url || !isHttpUrl(link.url)) {
      continue;
    }

    const cached = cache.get(normalizeForVisit(link.url));
    if (cached) {
      applyLinkStatus(link, cached);
    }
  }

  return checkedCount;
}

function applyLinkStatus(link: LinkRecord, status: LinkStatus): void {
  link.status = status.status;
  link.note = status.note ?? link.note;
}

async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}

async function readMetaDescription(page: Page): Promise<string> {
  return page
    .locator('meta[name="description"], meta[property="og:description"]')
    .first()
    .getAttribute("content", { timeout: 2_000 })
    .then((value) => value?.trim() ?? "")
    .catch(() => "");
}

async function readLastModified(page: Page, response: Response | null): Promise<PageRecord["lastModified"]> {
  const headerValue = response?.headers()["last-modified"]?.trim();
  if (headerValue) {
    return {
      value: headerValue,
      source: "http_header"
    };
  }

  const metaValue = await page
    .locator(
      'meta[property="article:modified_time"], meta[property="og:updated_time"], meta[name="last-modified"], meta[name="dateModified"], meta[itemprop="dateModified"]'
    )
    .first()
    .getAttribute("content", { timeout: 1_000 })
    .then((value) => value?.trim() ?? "")
    .catch(() => "");

  return metaValue
    ? {
        value: metaValue,
        source: "meta"
      }
    : undefined;
}

async function readHeadings(page: Page): Promise<string[]> {
  return page
    .locator("h1, h2")
    .evaluateAll((headings) =>
      headings
        .map((heading) => (heading.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20)
    )
    .catch(() => []);
}

async function readLinks(page: Page, pageUrl: string): Promise<LinkRecord[]> {
  const rawLinks = await page
    .locator("a[href]")
    .evaluateAll((anchors) =>
      anchors.map((anchor) => {
        const element = anchor as HTMLAnchorElement;
        const textParts = [
          element.innerText,
          element.textContent,
          element.getAttribute("aria-label"),
          element.getAttribute("title")
        ];
        return {
          href: element.getAttribute("href") ?? "",
          text: textParts
            .map((part) => (part ?? "").trim())
            .filter(Boolean)
            .join(" ")
        };
      })
    )
    .catch(() => []);

  const baseUrl = new URL(pageUrl);
  const seen = new Set<string>();
  const links: LinkRecord[] = [];

  for (const rawLink of rawLinks) {
    const href = rawLink.href.trim();
    if (!href || href.startsWith("#")) {
      continue;
    }

    const resolved = resolveUrl(href, pageUrl);
    const key = resolved ?? href;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({
      href,
      text: rawLink.text.replace(/\s+/g, " ").slice(0, 160),
      url: resolved,
      internal: resolved && isHttpUrl(resolved) ? sameSite(baseUrl, new URL(resolved)) : false,
      note: linkNote(resolved)
    });
  }

  return links;
}

function resolveUrl(href: string, pageUrl: string): string | undefined {
  try {
    const resolved = new URL(href, pageUrl);
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return undefined;
  }
}

async function readForms(page: Page): Promise<PageFormDetails> {
  return page
    .locator("form")
    .evaluateAll((forms) => {
      const records = forms.map((form) => {
        const elements = [...form.querySelectorAll("input, textarea, select, button")];
        const labels = elements
          .map((element) => {
            const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;
            const label = input.id
              ? [...form.ownerDocument.querySelectorAll("label")].find((item) => item.getAttribute("for") === input.id)?.textContent
              : "";
            return [
              input.getAttribute("name"),
              input.getAttribute("placeholder"),
              input.getAttribute("aria-label"),
              input.getAttribute("type"),
              input.textContent,
              label
            ]
              .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .join(" ");
          })
          .filter(Boolean);
        const combined = labels.join(" ").toLowerCase();
        const contactForm =
          /\b(email|e-mail|message|phone|name|contact|inquiry|enquiry|submit|send)\b/i.test(combined) &&
          (/\b(email|e-mail|message|phone)\b/i.test(combined) || /contact|inquiry|enquiry/i.test(form.textContent ?? ""));
        return {
          contactForm,
          labels
        };
      });

      return {
        formCount: records.length,
        contactFormCount: records.filter((record) => record.contactForm).length,
        fieldLabels: [...new Set(records.flatMap((record) => record.labels))].slice(0, 20)
      };
    })
    .catch(() => ({ formCount: 0, contactFormCount: 0, fieldLabels: [] }));
}

async function checkLinkStatus(url: string, signal?: AbortSignal): Promise<{ status?: number; note?: string }> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), linkCheckTimeoutMs);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    throwIfCancelled(signal);
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal
    });

    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      });
    }

    return { status: response.status };
  } catch (error) {
    throwIfCancelled(signal);
    return { note: `Could not read link status: ${readableError(error)}` };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  configurePlaywrightBrowserPath();

  const roots = uniquePaths([process.cwd(), path.dirname(process.execPath)]);
  const errors: string[] = [];

  for (const root of roots) {
    try {
      const requireFromRoot = createRequire(path.join(root, "app.js"));
      return requireFromRoot("playwright") as PlaywrightModule;
    } catch (error) {
      errors.push(`${root}: ${readableError(error)}`);
    }
  }

  try {
    return await import("playwright");
  } catch (error) {
    errors.push(readableError(error));
  }

  throw new Error(
    [
      "Playwright could not be loaded.",
      `Use the GitHub release folder that includes ${executableName}, node_modules, and ms-playwright.`,
      "Developers building from source can run `npm install` and `npx playwright install chromium`.",
      errors.join("\n")
    ].join("\n")
  );
}

function configurePlaywrightBrowserPath(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return;
  }

  const releaseBrowserDir = path.join(path.dirname(process.execPath), "ms-playwright");
  if (existsSync(releaseBrowserDir)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = releaseBrowserDir;
  }
}

function normalizeForVisit(input: string): string {
  const parsed = new URL(input);
  parsed.hash = "";

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

function sameSite(left: URL, right: URL): boolean {
  return normalizeHost(left.hostname) === normalizeHost(right.hostname);
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isLikelyReviewPage(url: string): boolean {
  const parsed = new URL(url);
  const pathname = parsed.pathname.toLowerCase();
  if (/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|jpg|jpeg|png|gif|webp|svg|mp4|mov|avi|mp3|wav)$/i.test(pathname)) {
    return false;
  }

  return !/(?:^|\/)(?:login|sign-in|signin|account|cart|checkout|wp-admin|feed|tag|tags|category|author)(?:\/|$)/i.test(pathname);
}

function reviewPriority(link: LinkRecord): number {
  const text = `${link.text} ${link.url ?? link.href}`.toLowerCase();
  if (/\bcontact\b|get in touch/.test(text)) {
    return 0;
  }
  if (/\babout\b|our story|who we are/.test(text)) {
    return 1;
  }
  if (/\bprivacy\b/.test(text)) {
    return 2;
  }
  if (/\bterms\b|\bconditions\b/.test(text)) {
    return 3;
  }
  if (/\bservices?\b|what we do/.test(text)) {
    return 4;
  }
  if (/\bpricing\b|\bplans\b|\brates\b/.test(text)) {
    return 5;
  }
  if (/\bfaq\b|frequently asked/.test(text)) {
    return 6;
  }
  if (/\bteam\b|\bleadership\b|\bstaff\b/.test(text)) {
    return 7;
  }
  if (/\blogin\b|sign in|account|cart|checkout/.test(text)) {
    return 99;
  }
  return 20 + Math.min((link.url ?? link.href).length / 100, 20);
}

function linkNote(resolved: string | undefined): string | undefined {
  if (!resolved) {
    return "Link does not point to a web page.";
  }
  if (!isHttpUrl(resolved)) {
    return "Link uses a non-page destination.";
  }
  if (!isLikelyReviewPage(resolved)) {
    return "Linked file was recorded but not added as a reviewed page.";
  }
  return undefined;
}

function fileSafePageName(url: string): string {
  const parsed = new URL(url);
  const pathPart = parsed.pathname === "/" ? "home" : parsed.pathname;
  return `${parsed.hostname}-${pathPart}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean).map((entry) => path.resolve(entry)))];
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readableHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
