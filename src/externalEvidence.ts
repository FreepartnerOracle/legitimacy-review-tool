import { normalizedHostFromUrl, uniqueStrings } from "./businessText.js";
import type {
  ExternalEvidence,
  ExternalEvidenceItem,
  ExternalProfileEvidence,
  ExternalSearchLinkEvidence,
  ReviewEvidence,
  StateRegistryEvidence
} from "./types.js";

type ProfilePlatform = {
  label: string;
  hosts: string[];
};

type StateRegistryConnector = {
  state: string;
  stateCode: string;
  agency: string;
  searchUrl: string;
  sourceUrl: string;
  notes: string[];
  aliases: string[];
};

const profilePlatforms: ProfilePlatform[] = [
  { label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { label: "Instagram", hosts: ["instagram.com"] },
  { label: "LinkedIn", hosts: ["linkedin.com"] },
  { label: "X", hosts: ["x.com", "twitter.com"] },
  { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { label: "TikTok", hosts: ["tiktok.com"] },
  { label: "Pinterest", hosts: ["pinterest.com"] },
  { label: "Threads", hosts: ["threads.net"] }
];

const stateRegistryConnectors: StateRegistryConnector[] = [
  {
    state: "Texas",
    stateCode: "TX",
    agency: "Texas Secretary of State SOSDirect and Texas Comptroller Franchise Tax Account Status Search",
    searchUrl: "https://comptroller.texas.gov/taxes/franchise/account-status/search",
    sourceUrl: "https://www.sos.texas.gov/corp/searches.shtml",
    notes: [
      "Use SOSDirect for official business filing records when needed.",
      "The Texas Comptroller account-status search can be searched by entity name, taxpayer number, or SOS file number."
    ],
    aliases: ["texas", "tx"]
  },
  {
    state: "Delaware",
    stateCode: "DE",
    agency: "Delaware Division of Corporations Entity Search",
    searchUrl: "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
    sourceUrl: "https://corp.delaware.gov/",
    notes: ["Search by entity name or file number. The Delaware search page warns against automated data mining."],
    aliases: ["delaware", "de"]
  },
  {
    state: "California",
    stateCode: "CA",
    agency: "California Secretary of State bizfile Online Business Search",
    searchUrl: "https://bizfileonline.sos.ca.gov/search/business",
    sourceUrl: "https://www.sos.ca.gov/business-programs/business-entities",
    notes: ["Search by business name or entity number in the California Secretary of State business search."],
    aliases: ["california", "ca"]
  },
  {
    state: "Florida",
    stateCode: "FL",
    agency: "Florida Division of Corporations Sunbiz",
    searchUrl: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName",
    sourceUrl: "https://search.sunbiz.org/",
    notes: ["Search Sunbiz by entity name, officer, registered agent, document number, zip code, or street address."],
    aliases: ["florida", "fl"]
  },
  {
    state: "New York",
    stateCode: "NY",
    agency: "New York Department of State Corporation and Business Entity Database",
    searchUrl: "https://apps.dos.ny.gov/publicInquiry/",
    sourceUrl: "https://dos.ny.gov/existing-corporations-and-businesses",
    notes: ["Search the New York Department of State public corporation and business entity database."],
    aliases: ["new york", "ny", "n y", "new york state"]
  },
  {
    state: "North Carolina",
    stateCode: "NC",
    agency: "North Carolina Secretary of State Business Registration Search",
    searchUrl: "https://www.sosnc.gov/online_services/search/by_title/search_Business_Registration",
    sourceUrl: "https://www.sosnc.gov/divisions/general_counsel/search_tips_business_registration",
    notes: ["Search by business name, SOS ID, registered agent, or related business registration fields."],
    aliases: ["north carolina", "nc", "n c"]
  },
  {
    state: "New Jersey",
    stateCode: "NJ",
    agency: "New Jersey Division of Revenue and Enterprise Services Business Records Service",
    searchUrl: "https://www.njportal.com/DOR/businessrecords/",
    sourceUrl: "https://www.njportal.com/brs",
    notes: ["Search New Jersey business entity names, status reports, standing certificates, documents, and trade names."],
    aliases: ["new jersey", "nj", "n j"]
  },
  {
    state: "Virginia",
    stateCode: "VA",
    agency: "Virginia State Corporation Commission Clerk's Information System",
    searchUrl: "https://cis.scc.virginia.gov/EntitySearch/Index",
    sourceUrl: "https://www.scc.virginia.gov/pages/Businesses",
    notes: ["Search Virginia SCC CIS by entity name, entity ID, principal name, or registered agent."],
    aliases: ["virginia", "va"]
  }
];

export function buildExternalEvidence(evidence: ReviewEvidence): ExternalEvidence {
  const checkedAt = new Date().toISOString();
  const profileLinks = extractWebsiteProfileLinks(evidence);
  const searchLinks = buildSearchLinks(evidence);
  const registryChecks = buildRegistryChecks(evidence);
  const items = uniqueItems([
    domainRegistrationItem(evidence),
    profileLinks.length
      ? {
          title: "Website-discovered external profile links",
          label: "Verified from reviewed website",
          detail: `${profileLinks.length} external profile link${profileLinks.length === 1 ? "" : "s"} found on reviewed pages.`,
          sourceName: "Reviewed website pages",
          sourceUrl: profileLinks[0]?.sourcePageUrl
        }
      : {
          title: "Website-discovered external profile links",
          label: "Could not verify from local run",
          detail: "No external company/profile links were found on reviewed website pages.",
          sourceName: "Reviewed website pages"
        },
    ...registryChecks.map(registryEvidenceItem),
    searchLinks.length
      ? {
          title: "Complaint, review, directory, map, and profile search links",
          label: "Manual follow-up recommended",
          detail: `${searchLinks.length} public search link${searchLinks.length === 1 ? "" : "s"} generated. The app did not open or interpret these results.`,
          sourceName: "Generated public-search links",
          sourceUrl: searchLinks[0]?.url
        }
      : undefined
  ]);

  return {
    checkedAt,
    items,
    profileLinks,
    searchLinks,
    registryChecks
  };
}

export function registryConnectorForState(state: string | undefined): StateRegistryConnector | undefined {
  const normalized = normalizeState(state);
  if (!normalized) {
    return undefined;
  }
  return stateRegistryConnectors.find((connector) => connector.aliases.includes(normalized));
}

function domainRegistrationItem(evidence: ReviewEvidence): ExternalEvidenceItem {
  const registration = evidence.domainRegistration;
  if (!registration) {
    return {
      title: "Domain registration data",
      label: "Could not verify from local run",
      detail: "The public domain registration lookup was not run for this review.",
      sourceName: "RDAP lookup"
    };
  }

  if (registration.status === "found") {
    const details = [
      registration.creationDate ? `created ${registration.creationDate}` : undefined,
      registration.lastChangedDate ? `last changed ${registration.lastChangedDate}` : undefined,
      registration.expirationDate ? `expires ${registration.expirationDate}` : undefined,
      registration.registrar ? `registrar ${registration.registrar}` : undefined
    ];
    return {
      title: "Domain registration data",
      label: "Found in public external source",
      detail: uniqueStrings(details).join("; ") || "A public RDAP record was returned, but date fields were limited.",
      sourceName: "RDAP domain registration lookup",
      sourceUrl: registration.lookupUrl
    };
  }

  return {
    title: "Domain registration data",
    label: "Could not verify from local run",
    detail: registration.note ?? "No public domain registration record was returned during this run.",
    sourceName: "RDAP domain registration lookup",
    sourceUrl: registration.lookupUrl
  };
}

function extractWebsiteProfileLinks(evidence: ReviewEvidence): ExternalProfileEvidence[] {
  const records: ExternalProfileEvidence[] = [];
  const seen = new Set<string>();

  for (const page of evidence.pages) {
    for (const link of page.links) {
      if (!link.url || link.internal) {
        continue;
      }

      const platform = profilePlatformForUrl(link.url);
      if (!platform) {
        continue;
      }

      const key = `${platform.label}|${normalizeUrl(link.url)}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      records.push({
        platform: platform.label,
        url: link.url,
        sourcePageUrl: page.finalUrl,
        status: link.status,
        label: "Verified from reviewed website",
        detail: link.status
          ? `Linked from reviewed website page; link status was HTTP ${link.status}.`
          : "Linked from reviewed website page; link status was not available."
      });
    }
  }

  return records.slice(0, 20);
}

function buildRegistryChecks(evidence: ReviewEvidence): StateRegistryEvidence[] {
  const connector = registryConnectorForState(evidence.input.expectedState);
  if (!connector) {
    return [];
  }

  const suggestedSearch = evidence.input.companyName?.trim() || readableHost(evidence.input.websiteUrl);
  return [
    {
      state: connector.state,
      stateCode: connector.stateCode,
      agency: connector.agency,
      searchUrl: connector.searchUrl,
      sourceUrl: connector.sourceUrl,
      suggestedSearch,
      label: "Manual follow-up recommended",
      detail: `Search ${connector.state} records for "${suggestedSearch}" and compare legal name, status, addresses, registered agent, and filing date when available.`,
      notes: connector.notes
    }
  ];
}

function registryEvidenceItem(registry: StateRegistryEvidence): ExternalEvidenceItem {
  return {
    title: `${registry.state} business registration follow-up`,
    label: registry.label,
    detail: registry.detail,
    sourceName: registry.agency,
    sourceUrl: registry.searchUrl
  };
}

function buildSearchLinks(evidence: ReviewEvidence): ExternalSearchLinkEvidence[] {
  const host = readableHost(evidence.input.websiteUrl);
  const company = evidence.input.companyName?.trim();
  const location = evidence.input.claimedLocation?.trim();
  const subject = company ? `"${company}" "${host}"` : `"${host}"`;
  const mapSubject = [company ? `"${company}"` : `"${host}"`, location ? `"${location}"` : undefined]
    .filter(Boolean)
    .join(" ");

  return uniqueSearchLinks([
    searchLink("business_profile", "Independent business footprint", `${subject} business profile`),
    searchLink("map_listing", "Map or local listing", `${mapSubject} map listing`),
    searchLink("reviews", "Review presence", `${subject} reviews`),
    searchLink("complaints", "Complaint references", `${subject} complaint`),
    searchLink("linkedin", "LinkedIn company profile", company ? `"${company}" LinkedIn company` : `"${host}" LinkedIn company`)
  ]);
}

function searchLink(
  category: ExternalSearchLinkEvidence["category"],
  label: string,
  query: string
): ExternalSearchLinkEvidence {
  return {
    category,
    label,
    query,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    confidenceLabel: "Manual follow-up recommended",
    detail: "Generated for manual review; this app did not open or interpret the search results."
  };
}

function uniqueSearchLinks(links: ExternalSearchLinkEvidence[]): ExternalSearchLinkEvidence[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.category}|${link.query.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueItems(items: Array<ExternalEvidenceItem | undefined>): ExternalEvidenceItem[] {
  const seen = new Set<string>();
  return items.filter((item): item is ExternalEvidenceItem => {
    if (!item) {
      return false;
    }
    const key = `${item.title}|${item.label}|${item.detail}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function profilePlatformForUrl(url: string): ProfilePlatform | undefined {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }

  return profilePlatforms.find((platform) =>
    platform.hosts.some((expectedHost) => host === expectedHost || host.endsWith(`.${expectedHost}`))
  );
}

function normalizeState(value: string | undefined): string {
  return (
    value
      ?.toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

function readableHost(url: string): string {
  const host = normalizedHostFromUrl(url);
  if (host) {
    return host;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function supportedRegistryStates(): string[] {
  return stateRegistryConnectors.map((connector) => `${connector.state} (${connector.stateCode})`);
}
