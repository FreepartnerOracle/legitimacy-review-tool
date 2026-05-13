export type ReviewInput = {
  websiteUrl: string;
  companyName?: string;
  claimedLocation?: string;
  expectedState?: string;
  claimedIndustry?: string;
  additionalIdentifiers?: string;
};

export type ReviewOptions = ReviewInput & {
  outputDir: string;
  maxDepth: number;
  maxPages: number;
};

export type LinkRecord = {
  text: string;
  href: string;
  url?: string;
  internal: boolean;
  status?: number;
  note?: string;
};

export type PageFormDetails = {
  formCount: number;
  contactFormCount: number;
  fieldLabels: string[];
};

export type PageRecord = {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  metaDescription?: string;
  lastModified?: PageLastModifiedEvidence;
  headings?: string[];
  status?: number;
  text: string;
  links: LinkRecord[];
  details?: ExtractedDetails;
  forms?: PageFormDetails;
  screenshotPath: string;
  depth: number;
  note?: string;
};

export type PageLastModifiedEvidence = {
  value: string;
  source: "http_header" | "meta";
};

export type SocialLinkRecord = {
  label: string;
  url: string;
};

export type UrlVariantCheck = {
  url: string;
  ok: boolean;
  status?: number;
  finalUrl?: string;
  note?: string;
};

export type SitemapEvidence = {
  url: string;
  found: boolean;
  status?: number;
  pageUrls: string[];
  note?: string;
};

export type DomainRegistrationEvidence = {
  domain: string;
  lookupUrl?: string;
  checkedAt: string;
  status: "found" | "not_found" | "unavailable";
  creationDate?: string;
  lastChangedDate?: string;
  expirationDate?: string;
  registrar?: string;
  nameServers: string[];
  note?: string;
};

export type ExternalEvidenceLabel =
  | "Verified from reviewed website"
  | "Found in public external source"
  | "Manual follow-up recommended"
  | "Could not verify from local run";

export type ExternalEvidenceItem = {
  title: string;
  label: ExternalEvidenceLabel;
  detail: string;
  sourceName: string;
  sourceUrl?: string;
};

export type ExternalProfileEvidence = {
  platform: string;
  url: string;
  sourcePageUrl: string;
  status?: number;
  label: ExternalEvidenceLabel;
  detail: string;
};

export type ExternalSearchLinkEvidence = {
  category: "business_profile" | "map_listing" | "reviews" | "complaints" | "linkedin";
  label: string;
  query: string;
  url: string;
  confidenceLabel: ExternalEvidenceLabel;
  detail: string;
};

export type StateRegistryEvidence = {
  state: string;
  stateCode: string;
  agency: string;
  searchUrl: string;
  sourceUrl: string;
  suggestedSearch: string;
  label: ExternalEvidenceLabel;
  detail: string;
  notes: string[];
};

export type ExternalEvidence = {
  checkedAt: string;
  items: ExternalEvidenceItem[];
  profileLinks: ExternalProfileEvidence[];
  searchLinks: ExternalSearchLinkEvidence[];
  registryChecks: StateRegistryEvidence[];
};

export type RelatedDomainRecord = {
  domain: string;
  sources: string[];
};

export type SiteIdentityReview = {
  reviewedDomain: string;
  likelyOfficialSite: "Provided URL" | "Related domain seen" | "Unclear";
  matchLevel: "Strong match" | "Partial match" | "Unclear match";
  reasons: string[];
  relatedDomains: RelatedDomainRecord[];
  manualFollowUps: string[];
  provided: {
    companyName?: string;
    claimedLocation?: string;
    expectedState?: string;
    claimedIndustry?: string;
    additionalIdentifiers?: string;
  };
  found: {
    companyNameInText: boolean;
    claimedLocationInText: boolean;
    claimedIndustryInText: boolean;
    emailDomains: string[];
    phones: string[];
    addressLines: string[];
    socialLinks: SocialLinkRecord[];
    copyrightNames: string[];
  };
};

export type PagePresence = {
  contact: boolean;
  about: boolean;
  privacy: boolean;
  terms: boolean;
  services: boolean;
  pricing: boolean;
  faq: boolean;
  refund: boolean;
  shipping: boolean;
  cancellation: boolean;
};

export type PagePresenceSource = "reviewed_page" | "linked" | "visible_text";

export type PagePresenceDetail = {
  present: boolean;
  sources: PagePresenceSource[];
  urls: string[];
};

export type ExtractedDetails = {
  emails: string[];
  phones: string[];
  addressLines: string[];
  socialLinks: SocialLinkRecord[];
};

export type ReviewSignals = {
  emails: string[];
  phones: string[];
  addressLines: string[];
  socialLinks: SocialLinkRecord[];
  pagePresence: PagePresence;
  pagePresenceDetails: Record<keyof PagePresence, PagePresenceDetail>;
};

export type ReviewEvidence = {
  startedAt: string;
  input: ReviewInput;
  limits: {
    maxDepth: number;
    maxPages: number;
  };
  pages: PageRecord[];
  signals?: ReviewSignals;
  siteAvailability?: UrlVariantCheck[];
  sitemap?: SitemapEvidence;
  domainRegistration?: DomainRegistrationEvidence;
  externalEvidence?: ExternalEvidence;
  siteIdentity?: SiteIdentityReview;
};

export type ConcernSeverity = "low" | "medium" | "high";

export type ConcernArea =
  | "page_quality"
  | "content_quality"
  | "business_identity"
  | "policy_pages"
  | "commercial_behavior";

export type ReviewConcern = {
  code: string;
  area: ConcernArea;
  severity: ConcernSeverity;
  label?: string;
  message: string;
  pageUrl?: string;
  evidence?: string;
};

export type AssessmentLevel = "Low risk" | "Mild risk" | "Moderate risk" | "High risk" | "Severe risk";

export type ReviewCategoryKey =
  | "site_access"
  | "domain_infrastructure"
  | "website_quality"
  | "content_authenticity"
  | "business_identity"
  | "policy_compliance"
  | "external_footprint"
  | "commercial_behavior";

export type ReviewCategoryAssessment = {
  key: ReviewCategoryKey;
  label: string;
  level: AssessmentLevel;
  evidence: string[];
  unknowns: string[];
  manualFollowUps: string[];
};

export type ReviewSummary = {
  concernLevel: "Low concern" | "Mild concern" | "Moderate concern" | "High concern";
  riskLevel: AssessmentLevel;
  confidence: "Low" | "Medium" | "High";
  likelyOfficialWebsite: SiteIdentityReview["likelyOfficialSite"] | "Unclear";
  decisionBrief: {
    headline: string;
    recommendation: string;
    topFindings: string[];
    nextSteps: string[];
  };
  finalAssessment: {
    label: "Looks complete" | "Needs manual follow-up" | "Insufficient website evidence";
    reasons: string[];
    recommendation: string;
  };
  snapshot: {
    pagesReviewed: number;
    concernsFound: number;
    screenshotsCaptured: number;
    linksRecorded: number;
    emailsFound: number;
    phonesFound: number;
    commonPagesFound: number;
    contactFormsFound: number;
  };
  verifiedFacts: string[];
  positiveIndicators: string[];
  concernIndicators: string[];
  unknowns: string[];
  manualFollowUps: string[];
  categoryAssessments: ReviewCategoryAssessment[];
  positiveNotes: string[];
  followUpNotes: string[];
};

export type ReviewResult = {
  evidence: ReviewEvidence;
  concerns: ReviewConcern[];
  summary: ReviewSummary;
};

export type ReportPaths = {
  outputDir: string;
  markdown: string;
  html: string;
  summaryHtml: string;
  summaryText: string;
  checklistMarkdown: string;
  evidenceJson: string;
  screenshotsDir: string;
};

export type CompletedReview = ReviewResult & {
  paths: ReportPaths;
};

export type ProgressUpdate = {
  stage: "preparing" | "reviewing" | "checking" | "reporting" | "completed" | "cancelled";
  message: string;
  detail?: string;
};
