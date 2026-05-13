import { extractCopyrightNames, hostsMatch, uniqueStrings } from "./businessText.js";
import { extractReviewSignals } from "./signals.js";
import type { RelatedDomainRecord, ReviewConcern, ReviewEvidence, SiteIdentityReview } from "./types.js";

export function buildSiteIdentityReview(evidence: ReviewEvidence, concerns: ReviewConcern[]): SiteIdentityReview {
  const reviewedDomain = domainFromUrl(evidence.input.websiteUrl) ?? "";
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const allText = evidence.pages.map((page) => `${page.title}\n${page.text}`).join("\n");
  const companyNameInText = includesLoose(allText, evidence.input.companyName);
  const claimedLocationInText = includesLoose(allText, evidence.input.claimedLocation);
  const claimedIndustryInText = includesLoose(allText, evidence.input.claimedIndustry) || includesMeaningfulTerm(allText, evidence.input.claimedIndustry);
  const emailDomains = uniqueStrings(signals.emails.map(emailDomain).filter((domain): domain is string => Boolean(domain)));
  const copyrightNames = uniqueStrings(evidence.pages.flatMap((page) => extractCopyrightNames(page.text))).slice(0, 10);
  const relatedDomains = collectRelatedDomains(evidence, reviewedDomain, emailDomains);
  const matchingEmailDomain = emailDomains.some((domain) => hostsMatch(domain, reviewedDomain));
  const entryPointLoaded =
    (evidence.siteAvailability ?? []).some((check) => check.ok && urlMatchesHost(check.finalUrl ?? check.url, reviewedDomain)) ||
    evidence.pages.some((page) => (page.status === undefined || page.status < 400) && urlMatchesHost(page.finalUrl, reviewedDomain));
  const entryPointPrecheckLoaded = (evidence.siteAvailability ?? []).some((check) => check.ok && urlMatchesHost(check.finalUrl ?? check.url, reviewedDomain));
  const differentNameSeen = concerns.some((concern) => concern.code === "different_business_name_seen");

  let matchScore = 0;
  if (companyNameInText) {
    matchScore += 2;
  }
  if (claimedLocationInText) {
    matchScore += 1;
  }
  if (matchingEmailDomain) {
    matchScore += 2;
  }
  if (entryPointLoaded) {
    matchScore += 1;
  }
  if (differentNameSeen) {
    matchScore -= 2;
  }
  if (!entryPointLoaded) {
    matchScore -= 1;
  }

  const matchLevel = matchScore >= 4 ? "Strong match" : matchScore >= 2 ? "Partial match" : "Unclear match";
  const likelyOfficialSite =
    matchLevel === "Strong match" || (matchLevel === "Partial match" && matchingEmailDomain)
      ? "Provided URL"
      : relatedDomains.length > 0
        ? "Related domain seen"
        : "Unclear";

  return {
    reviewedDomain,
    likelyOfficialSite,
    matchLevel,
    reasons: buildReasons({
      companyName: evidence.input.companyName,
      claimedLocation: evidence.input.claimedLocation,
      expectedState: evidence.input.expectedState,
      claimedIndustry: evidence.input.claimedIndustry,
      additionalIdentifiers: evidence.input.additionalIdentifiers,
      companyNameInText,
      claimedLocationInText,
      claimedIndustryInText,
      matchingEmailDomain,
      entryPointLoaded,
      entryPointPrecheckLoaded,
      differentNameSeen,
      emailDomains,
      relatedDomains
    }),
    relatedDomains,
    manualFollowUps: buildManualFollowUps({
      companyName: evidence.input.companyName,
      claimedLocation: evidence.input.claimedLocation,
      expectedState: evidence.input.expectedState,
      claimedIndustry: evidence.input.claimedIndustry,
      additionalIdentifiers: evidence.input.additionalIdentifiers,
      companyNameInText,
      claimedLocationInText,
      claimedIndustryInText,
      matchingEmailDomain,
      entryPointLoaded,
      entryPointPrecheckLoaded,
      emailDomains,
      relatedDomains,
      socialLinkCount: signals.socialLinks.length
    }),
    provided: {
      companyName: evidence.input.companyName,
      claimedLocation: evidence.input.claimedLocation,
      expectedState: evidence.input.expectedState,
      claimedIndustry: evidence.input.claimedIndustry,
      additionalIdentifiers: evidence.input.additionalIdentifiers
    },
    found: {
      companyNameInText,
      claimedLocationInText,
      claimedIndustryInText,
      emailDomains,
      phones: signals.phones,
      addressLines: signals.addressLines,
      socialLinks: signals.socialLinks,
      copyrightNames
    }
  };
}

function buildReasons(input: {
  companyName?: string;
  claimedLocation?: string;
  expectedState?: string;
  claimedIndustry?: string;
  additionalIdentifiers?: string;
  companyNameInText: boolean;
  claimedLocationInText: boolean;
  claimedIndustryInText: boolean;
  matchingEmailDomain: boolean;
  entryPointLoaded: boolean;
  entryPointPrecheckLoaded: boolean;
  differentNameSeen: boolean;
  emailDomains: string[];
  relatedDomains: RelatedDomainRecord[];
}): string[] {
  const reasons: string[] = [];

  if (input.companyName) {
    reasons.push(
      input.companyNameInText
        ? "The provided company name appeared in reviewed page text."
        : "The provided company name did not appear in reviewed page text."
    );
  } else {
    reasons.push("No company name was provided, so name matching is limited to website details found during the review.");
  }

  if (input.claimedLocation) {
    reasons.push(
      input.claimedLocationInText
        ? "The provided location appeared in reviewed page text."
        : "The provided location did not appear in reviewed page text."
    );
  }

  if (input.expectedState) {
    reasons.push(`Expected state for manual business registration follow-up: ${input.expectedState}.`);
  }

  if (input.claimedIndustry) {
    reasons.push(
      input.claimedIndustryInText
        ? "The provided industry or service appeared in reviewed page text."
        : "The provided industry or service did not appear clearly in reviewed page text."
    );
  }

  if (input.additionalIdentifiers) {
    reasons.push("Additional identifiers were provided for manual comparison against reviewed pages and outside records.");
  }

  if (input.matchingEmailDomain) {
    reasons.push("At least one contact email uses the reviewed website domain.");
  } else if (input.emailDomains.length > 0) {
    reasons.push(`Contact email domains found: ${input.emailDomains.join(", ")}.`);
  } else {
    reasons.push("No contact email domain was found in reviewed text or links.");
  }

  if (input.entryPointPrecheckLoaded) {
    reasons.push("At least one common website entry point loaded during this review.");
  } else if (input.entryPointLoaded) {
    reasons.push("The browser review loaded a page on the reviewed domain, but the separate entry-point precheck did not load cleanly.");
  } else {
    reasons.push("No common website entry point loaded cleanly during this review.");
  }

  if (input.relatedDomains.length > 0) {
    reasons.push(`Other domains appeared in reviewed text or links: ${input.relatedDomains.slice(0, 6).map((item) => item.domain).join(", ")}.`);
  }

  if (input.differentNameSeen) {
    reasons.push("A different copyright-style business name appeared in reviewed page text.");
  }

  return reasons;
}

function buildManualFollowUps(input: {
  companyName?: string;
  claimedLocation?: string;
  expectedState?: string;
  claimedIndustry?: string;
  additionalIdentifiers?: string;
  companyNameInText: boolean;
  claimedLocationInText: boolean;
  claimedIndustryInText: boolean;
  matchingEmailDomain: boolean;
  entryPointLoaded: boolean;
  entryPointPrecheckLoaded: boolean;
  emailDomains: string[];
  relatedDomains: RelatedDomainRecord[];
  socialLinkCount: number;
}): string[] {
  const items = [
    "Confirm the business name and address through an official business listing or another trusted directory.",
    "Confirm that the reviewed website URL is the one the business currently uses."
  ];

  if (input.companyName && !input.companyNameInText) {
    items.push("Ask the business why the provided company name does not appear clearly on the reviewed pages.");
  }

  if (input.claimedLocation && !input.claimedLocationInText) {
    items.push("Confirm the claimed location independently before relying on it.");
  }

  if (input.expectedState && input.companyName) {
    items.push(
      `Search ${input.expectedState} business registration records for "${input.companyName}" and compare the legal name, status, and address to the website.`
    );
  } else if (input.expectedState) {
    items.push(`Search ${input.expectedState} business registration records for the business name shown on the website.`);
  }

  if (input.claimedIndustry && !input.claimedIndustryInText) {
    items.push("Confirm whether the provided industry or service matches the business being reviewed.");
  }

  if (input.additionalIdentifiers) {
    items.push("Compare the provided identifiers with the website and trusted outside records.");
  }

  if (!input.entryPointLoaded) {
    items.push("Ask why the common website entry points did not load cleanly during this review.");
  } else if (!input.entryPointPrecheckLoaded) {
    items.push("If availability matters, manually recheck the common website entry points because the browser review loaded the site but the separate precheck did not.");
  }

  if (input.relatedDomains.length > 0) {
    items.push(`Ask the business to confirm whether these related domains are operated by the same organization: ${input.relatedDomains
      .slice(0, 6)
      .map((item) => item.domain)
      .join(", ")}.`);
  }

  if (input.emailDomains.length > 0 && !input.matchingEmailDomain) {
    items.push("Confirm that the listed email domains are controlled by the business before sending important documents.");
  }

  if (input.socialLinkCount > 0) {
    items.push("Confirm that the listed social profiles belong to the same organization.");
  }

  return uniqueStrings(items).slice(0, 8);
}

function collectRelatedDomains(evidence: ReviewEvidence, reviewedDomain: string, emailDomains: string[]): RelatedDomainRecord[] {
  const records = new Map<string, Set<string>>();
  const add = (domain: string | undefined, source: string) => {
    if (!domain) {
      return;
    }
    const normalized = normalizeDomain(domain);
    if (!normalized || hostsMatch(normalized, reviewedDomain)) {
      return;
    }
    const sources = records.get(normalized) ?? new Set<string>();
    sources.add(source);
    records.set(normalized, sources);
  };

  for (const domain of emailDomains) {
    add(domain, "email domain");
  }

  for (const page of evidence.pages) {
    add(domainFromUrl(page.finalUrl), "reviewed page");
    for (const link of page.links) {
      add(domainFromUrl(link.url), link.internal ? "internal link" : "external link");
    }
    for (const domain of extractVisibleDomains(page.text)) {
      add(domain, "visible text");
    }
    for (const socialLink of page.details?.socialLinks ?? []) {
      add(domainFromUrl(socialLink.url), "social link");
    }
  }

  return [...records.entries()]
    .map(([domain, sources]) => ({ domain, sources: [...sources].sort() }))
    .sort((left, right) => left.domain.localeCompare(right.domain))
    .slice(0, 20);
}

function includesLoose(text: string, value: string | undefined): boolean {
  const needle = value?.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return text.toLowerCase().includes(needle);
}

function includesMeaningfulTerm(text: string, value: string | undefined): boolean {
  const terms = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !["and", "the", "for", "with", "services", "service", "company", "business", "solutions"].includes(term));

  return terms.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emailDomain(email: string): string | undefined {
  return normalizeDomain(email.split("@")[1]);
}

function domainFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

function urlMatchesHost(url: string, host: string): boolean {
  const domain = domainFromUrl(url);
  return Boolean(domain && hostsMatch(domain, host));
}

function normalizeDomain(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/^www\./, "").replace(/[),.;:]+$/g, "");
  if (!normalized || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalized)) {
    return undefined;
  }
  const finalPart = normalized.split(".").at(-1) ?? "";
  return /[a-z]/i.test(finalPart) && finalPart.length >= 2 ? normalized : undefined;
}

function extractVisibleDomains(text: string): string[] {
  const domains: string[] = [];
  const pattern = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const domain = normalizeDomain(match[1]);
    if (domain) {
      domains.push(domain);
    }
  }
  return uniqueStrings(domains);
}
