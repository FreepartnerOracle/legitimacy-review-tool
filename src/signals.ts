import type {
  ExtractedDetails,
  LinkRecord,
  PagePresence,
  PagePresenceDetail,
  PagePresenceSource,
  ReviewEvidence,
  ReviewSignals,
  SocialLinkRecord
} from "./types.js";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern =
  /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const addressLinePattern =
  /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,80}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Way|Highway|Hwy\.?|Parkway|Pkwy\.?|Place|Pl\.?|Circle|Cir\.?|Terrace|Ter\.?|Trail|Trl\.?|Bend|Bnd\.?|Suite|Ste\.?)\b[^\n]*/i;

const socialHosts = [
  { host: "facebook.com", label: "Facebook" },
  { host: "instagram.com", label: "Instagram" },
  { host: "linkedin.com", label: "LinkedIn" },
  { host: "x.com", label: "X" },
  { host: "twitter.com", label: "X" },
  { host: "youtube.com", label: "YouTube" },
  { host: "tiktok.com", label: "TikTok" }
];

export function extractReviewSignals(evidence: ReviewEvidence): ReviewSignals {
  const text = evidence.pages.map((page) => page.text ?? "").join("\n");
  const links = evidence.pages.flatMap((page) => page.links ?? []);
  const details = evidence.pages.map((page) => normalizeDetails(page.details, page.text ?? "", page.links ?? []));
  const pagePresenceDetails = detectPagePresenceDetails(evidence);
  const pagePresence = Object.fromEntries(
    Object.entries(pagePresenceDetails).map(([key, value]) => [key, value.present])
  ) as PagePresence;

  return {
    emails: unique([...details.flatMap((detail) => detail.emails), ...extractEmails(text), ...extractEmailLinks(links)]).slice(0, 20),
    phones: unique([...details.flatMap((detail) => detail.phones), ...extractPhones(text), ...extractPhoneLinks(links)]).slice(0, 20),
    addressLines: unique([...details.flatMap((detail) => detail.addressLines), ...extractAddressLines(text)]).slice(0, 20),
    socialLinks: uniqueSocialLinks([...details.flatMap((detail) => detail.socialLinks), ...extractSocialLinks(links)]).slice(0, 20),
    pagePresence,
    pagePresenceDetails
  };
}

export function extractPageDetails(text: string, links: LinkRecord[]): ExtractedDetails {
  return {
    emails: unique([...extractEmails(text), ...extractEmailLinks(links)]).slice(0, 10),
    phones: unique([...extractPhones(text), ...extractPhoneLinks(links)]).slice(0, 10),
    addressLines: unique(extractAddressLines(text)).slice(0, 10),
    socialLinks: uniqueSocialLinks(extractSocialLinks(links)).slice(0, 10)
  };
}

function normalizeDetails(details: Partial<ExtractedDetails> | undefined, text: string, links: LinkRecord[]): ExtractedDetails {
  const fallback = details ?? extractPageDetails(text, links);
  return {
    emails: Array.isArray(fallback.emails) ? fallback.emails.map((email) => email.toLowerCase()) : [],
    phones: Array.isArray(fallback.phones) ? fallback.phones.map(normalizePhone).filter(Boolean) : [],
    addressLines: Array.isArray(fallback.addressLines) ? fallback.addressLines : [],
    socialLinks: Array.isArray(fallback.socialLinks) ? fallback.socialLinks : []
  };
}

function extractEmails(text: string): string[] {
  return [...text.matchAll(emailPattern)].map((match) => match[0].toLowerCase());
}

function extractEmailLinks(links: LinkRecord[]): string[] {
  return links
    .map((link) => link.href.trim())
    .filter((href) => href.toLowerCase().startsWith("mailto:"))
    .map((href) => href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase())
    .filter(Boolean);
}

function extractPhones(text: string): string[] {
  return [...text.matchAll(phonePattern)].map((match) => normalizePhone(match[0]));
}

function extractPhoneLinks(links: LinkRecord[]): string[] {
  return links
    .map((link) => link.href.trim())
    .filter((href) => href.toLowerCase().startsWith("tel:"))
    .map((href) => normalizePhone(href.replace(/^tel:/i, "")))
    .filter(Boolean);
}

function extractAddressLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length <= 180 && addressLinePattern.test(line));
}

function extractSocialLinks(links: LinkRecord[]): SocialLinkRecord[] {
  const records: SocialLinkRecord[] = [];

  for (const link of links) {
    if (!link.url) {
      continue;
    }

    try {
      const parsed = new URL(link.url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const socialHost = socialHosts.find((entry) => host === entry.host || host.endsWith(`.${entry.host}`));
      if (socialHost) {
        records.push({ label: socialHost.label, url: link.url });
      }
    } catch {
      continue;
    }
  }

  return records;
}

function detectPagePresenceDetails(evidence: ReviewEvidence): Record<keyof PagePresence, PagePresenceDetail> {
  const details: Record<keyof PagePresence, PagePresenceDetail> = {
    contact: emptyPresenceDetail(),
    about: emptyPresenceDetail(),
    privacy: emptyPresenceDetail(),
    terms: emptyPresenceDetail(),
    services: emptyPresenceDetail(),
    pricing: emptyPresenceDetail(),
    faq: emptyPresenceDetail(),
    refund: emptyPresenceDetail(),
    shipping: emptyPresenceDetail(),
    cancellation: emptyPresenceDetail()
  };

  for (const page of evidence.pages) {
    const reviewedText = `${page.finalUrl}\n${page.title}\n${(page.headings ?? []).join("\n")}`.toLowerCase();
    for (const key of Object.keys(details) as Array<keyof PagePresence>) {
      if (commonPagePattern(key).test(reviewedText)) {
        markPresence(details[key], "reviewed_page", page.finalUrl);
      }
    }

    const visibleText = page.text.toLowerCase();
    for (const key of Object.keys(details) as Array<keyof PagePresence>) {
      if (commonPagePattern(key).test(visibleText)) {
        markPresence(details[key], "visible_text", page.finalUrl);
      }
    }

    for (const link of page.links.filter((link) => link.internal)) {
      const linkText = `${link.text}\n${link.url ?? link.href}`.toLowerCase();
      for (const key of Object.keys(details) as Array<keyof PagePresence>) {
        if (commonPagePattern(key).test(linkText)) {
          markPresence(details[key], "linked", link.url ?? page.finalUrl);
        }
      }
    }
  }

  return details;
}

function commonPagePattern(key: keyof PagePresence): RegExp {
  switch (key) {
    case "contact":
      return /\bcontact\b|get in touch/;
    case "about":
      return /\babout\b|our story|who we are/;
    case "privacy":
      return /\bprivacy\b/;
    case "terms":
      return /\bterms\b|\bconditions\b/;
    case "services":
      return /\bservices?\b|what we do/;
    case "pricing":
      return /\bpricing\b|\bplans\b|\brates\b/;
    case "faq":
      return /\bfaq\b|frequently asked/;
    case "refund":
      return /\brefunds?\b|\breturns?\b/;
    case "shipping":
      return /\bshipping\b|\bdelivery\b/;
    case "cancellation":
      return /\bcancell?ation\b|\bcancel\b/;
  }
}

function emptyPresenceDetail(): PagePresenceDetail {
  return {
    present: false,
    sources: [],
    urls: []
  };
}

function markPresence(detail: PagePresenceDetail, source: PagePresenceSource, url: string): void {
  detail.present = true;
  if (!detail.sources.includes(source)) {
    detail.sources.push(source);
  }
  if (!detail.urls.includes(url)) {
    detail.urls.push(url);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueSocialLinks(values: SocialLinkRecord[]): SocialLinkRecord[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.url)) {
      return false;
    }
    seen.add(value.url);
    return true;
  });
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return digits ? `+${digits}` : "";
}
