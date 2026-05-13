import {
  extractCopyrightNames,
  hostsMatch,
  normalizeBusinessName,
  normalizedHostFromUrl,
  uniqueStrings
} from "./businessText.js";
import { extractReviewSignals } from "./signals.js";
import { textIncludesState } from "./stateText.js";
import type {
  AssessmentLevel,
  PagePresence,
  ReviewCategoryAssessment,
  ReviewConcern,
  ReviewEvidence,
  ReviewSignals,
  ReviewSummary
} from "./types.js";

type PlaceholderCheck = {
  code: string;
  phrase: string;
  pattern: RegExp;
};

type SpellingCheck = {
  misspelling: string;
  suggestion: string;
  pattern: RegExp;
};

const placeholderChecks: PlaceholderCheck[] = [
  { code: "placeholder_lorem_ipsum", phrase: "lorem ipsum", pattern: /\blorem\s+ipsum\b/i },
  { code: "placeholder_todo", phrase: "TODO", pattern: /\bTODO\b/i },
  { code: "placeholder_sample_text", phrase: "sample text", pattern: /\bsample\s+text\b/i },
  { code: "placeholder_your_company", phrase: "Your Company", pattern: /\bYour\s+Company\b/i },
  { code: "placeholder_address_line", phrase: "Address Line 1", pattern: /\bAddress\s+Line\s+1\b/i }
];

const spellingChecks: SpellingCheck[] = [
  { misspelling: "adress", suggestion: "address", pattern: /\badress\b/i },
  { misspelling: "availible", suggestion: "available", pattern: /\bavailible\b/i },
  { misspelling: "begining", suggestion: "beginning", pattern: /\bbegining\b/i },
  { misspelling: "buisness", suggestion: "business", pattern: /\bbuisness\b/i },
  { misspelling: "calender", suggestion: "calendar", pattern: /\bcalender\b/i },
  { misspelling: "definately", suggestion: "definitely", pattern: /\bdefinately\b/i },
  { misspelling: "enviroment", suggestion: "environment", pattern: /\benviroment\b/i },
  { misspelling: "experiance", suggestion: "experience", pattern: /\bexperiance\b/i },
  { misspelling: "famliy", suggestion: "family", pattern: /\bfamliy\b/i },
  { misspelling: "guarentee", suggestion: "guarantee", pattern: /\bguarentee\b/i },
  { misspelling: "maintainence", suggestion: "maintenance", pattern: /\bmaintainence\b/i },
  { misspelling: "neccessary", suggestion: "necessary", pattern: /\bneccessary\b/i },
  { misspelling: "occured", suggestion: "occurred", pattern: /\boccured\b/i },
  { misspelling: "perfectly suite your needs", suggestion: "perfectly suit your needs", pattern: /\bperfectly\s+suite\s+your\s+needs\b/i },
  { misspelling: "proffesional", suggestion: "professional", pattern: /\bproffesional\b/i },
  { misspelling: "recieve", suggestion: "receive", pattern: /\brecieve\b/i },
  { misspelling: "satifaction", suggestion: "satisfaction", pattern: /\bsatifaction\b/i },
  { misspelling: "seperate", suggestion: "separate", pattern: /\bseperate\b/i },
  { misspelling: "servcie", suggestion: "service", pattern: /\bservcie\b/i },
  { misspelling: "sucess", suggestion: "success", pattern: /\bsucess\b/i },
  { misspelling: "thier", suggestion: "their", pattern: /\bthier\b/i },
  { misspelling: "untill", suggestion: "until", pattern: /\buntill\b/i },
  { misspelling: "why chose our service", suggestion: "why choose our service", pattern: /\bwhy\s+chose\s+our\s+service\b/i }
];

const genericWordingChecks: PlaceholderCheck[] = [
  { code: "generic_wording", phrase: "industry-leading", pattern: /\bindustry[-\s]leading\b/i },
  { code: "generic_wording", phrase: "best-in-class", pattern: /\bbest[-\s]in[-\s]class\b/i },
  { code: "generic_wording", phrase: "trusted partner", pattern: /\btrusted\s+partner\b/i },
  { code: "generic_wording", phrase: "one-stop shop", pattern: /\bone[-\s]stop\s+shop\b/i },
  { code: "generic_wording", phrase: "exceed expectations", pattern: /\bexceed\s+expectations\b/i },
  { code: "generic_wording", phrase: "solutions for all your needs", pattern: /\bsolutions\s+for\s+all\s+your\s+needs\b/i },
  { code: "generic_wording", phrase: "tailored solutions", pattern: /\btailored\s+solutions\b/i },
  { code: "generic_wording", phrase: "innovative solutions", pattern: /\binnovative\s+solutions\b/i },
  { code: "generic_wording", phrase: "commitment to excellence", pattern: /\bcommitment\s+to\s+excellence\b/i },
  { code: "generic_wording", phrase: "customer satisfaction", pattern: /\bcustomer\s+satisfaction\b/i },
  { code: "generic_wording", phrase: "dedicated team", pattern: /\bdedicated\s+team\b/i },
  { code: "generic_wording", phrase: "years of experience", pattern: /\byears?\s+of\s+experience\b/i }
];

const templateWritingChecks: PlaceholderCheck[] = [
  { code: "template_writing", phrase: "in today's fast-paced world", pattern: /\bin\s+today'?s\s+fast[-\s]paced\s+world\b/i },
  { code: "template_writing", phrase: "in today's digital landscape", pattern: /\bin\s+today'?s\s+digital\s+landscape\b/i },
  { code: "template_writing", phrase: "we pride ourselves", pattern: /\bwe\s+pride\s+ourselves\b/i },
  { code: "template_writing", phrase: "look no further", pattern: /\blook\s+no\s+further\b/i },
  { code: "template_writing", phrase: "unlock your full potential", pattern: /\bunlock\s+your\s+full\s+potential\b/i },
  { code: "template_writing", phrase: "take your business to the next level", pattern: /\btake\s+your\s+business\s+to\s+the\s+next\s+level\b/i },
  { code: "template_writing", phrase: "seamless experience", pattern: /\bseamless\s+experience\b/i },
  { code: "template_writing", phrase: "cutting-edge", pattern: /\bcutting[-\s]edge\b/i },
  { code: "template_writing", phrase: "leverage our expertise", pattern: /\bleverage\s+our\s+expertise\b/i },
  { code: "template_writing", phrase: "empower your business", pattern: /\bempower\s+your\s+business\b/i }
];

const commercialPaymentPatterns: PlaceholderCheck[] = [
  { code: "payment_wording", phrase: "wire transfer", pattern: /\bwire\s+transfer\b/i },
  { code: "payment_wording", phrase: "gift card", pattern: /\bgift\s+cards?\b/i },
  { code: "payment_wording", phrase: "cryptocurrency", pattern: /\b(?:crypto|cryptocurrency|bitcoin|ethereum)\b/i },
  { code: "payment_wording", phrase: "money order", pattern: /\bmoney\s+order\b/i },
  { code: "payment_wording", phrase: "non-refundable upfront fee", pattern: /\bnon[-\s]?refundable\b.{0,60}\b(?:fee|deposit|payment)\b/i }
];

const regulatedIndustryPattern =
  /\b(?:financial|finance|investment|loan|mortgage|insurance|medical|healthcare|legal|law|real estate|realtor|contractor|construction|electrician|plumb(?:er|ing)|child care|daycare)\b/i;

const unsupportedClaimChecks: PlaceholderCheck[] = [
  {
    code: "unsupported_claim",
    phrase: "best service company in the world",
    pattern: /\bbest\s+service\s+company\s+in\s+(?:the\s+)?world\b/i
  },
  { code: "unsupported_claim", phrase: "ahead of competitors", pattern: /\bahead\s+of\s+competitors\b/i },
  { code: "unsupported_claim", phrase: "99.9% client satisfaction", pattern: /\b99(?:\.9)?\s*%\s*(?:client|customer)?\s*satisfaction\b/i },
  { code: "unsupported_claim", phrase: "award winning", pattern: /\baward[-\s]?winning\b/i },
  { code: "unsupported_claim", phrase: "global presence", pattern: /\b(?:world\s*wide|worldwide|global)\s+presence\b/i },
  { code: "unsupported_claim", phrase: "available across globe", pattern: /\bavailable\s+across\s+(?:the\s+)?globe\b/i },
  { code: "unsupported_claim", phrase: "most prolific service provider", pattern: /\bmost\s+prolific\s+service\s+provider\b/i },
  { code: "unsupported_claim", phrase: "top-rated", pattern: /\btop[-\s]?rated\b/i },
  { code: "unsupported_claim", phrase: "number one", pattern: /\b(?:number|no\.?)\s*1\b|\b#1\b/i }
];

const dummyCommerceChecks: PlaceholderCheck[] = [
  { code: "dummy_commerce", phrase: "WooCommerce cart", pattern: /\b(?:woocommerce|add\s+to\s+cart|shopping\s+cart|related\s+products?)\b/i },
  { code: "dummy_commerce", phrase: "Paper Weight", pattern: /\bpaper\s+weight\b/i },
  { code: "dummy_commerce", phrase: "Modern Air Purifier", pattern: /\bmodern\s+air\s+purifier\b/i },
  { code: "dummy_commerce", phrase: "Visiting Card", pattern: /\bvisiting\s+card\b/i },
  { code: "dummy_commerce", phrase: "Garden Bench", pattern: /\bgarden\s+bench\b/i }
];

const socialPlatforms = [
  { label: "Facebook", pattern: /\bfacebook\b/i, hosts: ["facebook.com", "fb.com"] },
  { label: "Instagram", pattern: /\binstagram\b/i, hosts: ["instagram.com"] },
  { label: "LinkedIn", pattern: /\blinkedin\b/i, hosts: ["linkedin.com"] },
  { label: "X", pattern: /(?:^|\b)(?:x|twitter)(?:\b|$)/i, hosts: ["x.com", "twitter.com"] },
  { label: "YouTube", pattern: /\byoutube\b/i, hosts: ["youtube.com", "youtu.be"] },
  { label: "TikTok", pattern: /\btiktok\b/i, hosts: ["tiktok.com"] },
  { label: "Pinterest", pattern: /\bpinterest\b/i, hosts: ["pinterest.com"] },
  { label: "Threads", pattern: /\bthreads\b/i, hosts: ["threads.net"] }
];

const areaCodeStates: Record<string, string[]> = {
  "210": ["TX"],
  "214": ["TX"],
  "254": ["TX"],
  "281": ["TX"],
  "325": ["TX"],
  "346": ["TX"],
  "361": ["TX"],
  "409": ["TX"],
  "430": ["TX"],
  "432": ["TX"],
  "469": ["TX"],
  "512": ["TX"],
  "682": ["TX"],
  "713": ["TX"],
  "726": ["TX"],
  "737": ["TX"],
  "806": ["TX"],
  "817": ["TX"],
  "830": ["TX"],
  "832": ["TX"],
  "903": ["TX"],
  "915": ["TX"],
  "936": ["TX"],
  "940": ["TX"],
  "956": ["TX"],
  "972": ["TX"],
  "979": ["TX"],
  "480": ["AZ"],
  "520": ["AZ"],
  "602": ["AZ"],
  "623": ["AZ"],
  "928": ["AZ"]
};

export function runQualityChecks(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns = [
    ...findPageLoadConcerns(evidence),
    ...findBrokenLinkConcerns(evidence),
    ...findCrawlCoverageConcerns(evidence),
    ...findNavigationConcerns(evidence),
    ...findTitleConcerns(evidence),
    ...findThinContentConcerns(evidence),
    ...findPlaceholderTextConcerns(evidence),
    ...findPlaceholderMetricConcerns(evidence),
    ...findSpellingConcerns(evidence),
    ...findGenericWordingConcerns(evidence),
    ...findGenericWordingCoverageConcerns(evidence),
    ...findTemplateWritingConcerns(evidence),
    ...findUnsupportedClaimConcerns(evidence),
    ...findStaleDateConcerns(evidence),
    ...findDummyCommerceConcerns(evidence),
    ...findThirdPartyContentConcerns(evidence),
    ...findRepeatedSentenceStartConcerns(evidence),
    ...findRepeatedContentBlockConcerns(evidence),
    ...findMissingPageConcerns(evidence),
    ...findBusinessDetailCoverageConcerns(evidence),
    ...findPolicyCoverageConcerns(evidence),
    ...findSocialLinkConcerns(evidence),
    ...findSocialLabelConcerns(evidence),
    ...findContactEmailDomainConcerns(evidence),
    ...findBusinessNameConsistencyConcerns(evidence),
    ...findBusinessDetailConsistencyConcerns(evidence),
    ...findContactGeographyConcerns(evidence),
    ...findExpectedStateConcerns(evidence),
    ...findIndustryAndIdentifierConcerns(evidence),
    ...findDomainDateConcerns(evidence),
    ...findCommercialPaymentConcerns(evidence),
    ...findContactFormConcerns(evidence),
    ...findContactDetailConcerns(evidence),
    ...findIdentityTextConcerns(evidence)
  ];

  return [...concerns, ...findCumulativeConcernPatterns(concerns)];
}

export function summarizeReview(evidence: ReviewEvidence, concerns: ReviewConcern[]): ReviewSummary {
  const high = concerns.filter((concern) => concern.severity === "high").length;
  const medium = concerns.filter((concern) => concern.severity === "medium").length;
  const low = concerns.filter((concern) => concern.severity === "low").length;

  const weightedScore = high * 8 + medium * 3 + low;
  let concernLevel: ReviewSummary["concernLevel"] = "Low concern";
  if (high >= 2 || weightedScore >= 24) {
    concernLevel = "High concern";
  } else if (high >= 1 || medium >= 3 || weightedScore >= 12) {
    concernLevel = "Moderate concern";
  } else if (medium >= 1 || low >= 4) {
    concernLevel = "Mild concern";
  }

  const allText = evidence.pages.map((page) => page.text).join("\n").toLowerCase();
  const positiveNotes = [
    `Reviewed ${evidence.pages.length} public page${evidence.pages.length === 1 ? "" : "s"}.`,
    `Captured ${evidence.pages.filter((page) => page.screenshotPath).length} full-page screenshot${
      evidence.pages.length === 1 ? "" : "s"
    }.`
  ];

  if (evidence.input.companyName && allText.includes(evidence.input.companyName.toLowerCase())) {
    positiveNotes.push("The provided company name appeared in the reviewed page text.");
  }

  if (evidence.input.claimedLocation && textContainsLoosePhrase(allText, evidence.input.claimedLocation)) {
    positiveNotes.push("The provided location appeared in the reviewed page text.");
  }

  if (evidence.input.expectedState && textIncludesState(allText, evidence.input.expectedState)) {
    positiveNotes.push("The expected state appeared in the reviewed page text.");
  }

  if (evidence.input.claimedIndustry && textContainsMeaningfulTerms(allText, evidence.input.claimedIndustry)) {
    positiveNotes.push("The provided industry or service appeared in the reviewed page text.");
  }

  if (evidence.domainRegistration?.status === "found") {
    positiveNotes.push("Public domain registration dates were found for the reviewed domain.");
  }

  if (evidence.pages[0]?.lastModified) {
    positiveNotes.push("A last-modified date was found for the homepage.");
  }

  const signals = evidence.signals ?? extractReviewSignals(evidence);

  if (signals.emails.length) {
    positiveNotes.push("At least one email address was found in reviewed text or links.");
  }

  if (signals.phones.length) {
    positiveNotes.push("At least one phone number was found in reviewed text or links.");
  }

  const contactFormsFound = totalContactForms(evidence);
  if (contactFormsFound > 0) {
    positiveNotes.push(`Found ${contactFormsFound} contact form${contactFormsFound === 1 ? "" : "s"} on reviewed pages.`);
  }

  const commonPages = Object.entries(signals.pagePresence)
    .filter(([, present]) => present)
    .map(([name]) => name);
  if (commonPages.length > 0) {
    positiveNotes.push(`Common site pages found: ${commonPages.join(", ")}.`);
  }

  const assessmentProfile = buildAssessmentProfile(evidence, concerns, signals, commonPages, contactFormsFound);
  const finalAssessment = buildFinalAssessment(evidence, concerns, contactFormsFound);
  const decisionBrief = buildDecisionBrief(evidence, concerns, assessmentProfile, finalAssessment);

  const followUpNotes = [
    "Confirm important business details using sources outside the website before relying on the site for a purchase or contract.",
    "Review any pages that could not be opened from this computer.",
    ...assessmentProfile.manualFollowUps
  ];

  return {
    concernLevel,
    riskLevel: assessmentProfile.riskLevel,
    confidence: assessmentProfile.confidence,
    likelyOfficialWebsite: evidence.siteIdentity?.likelyOfficialSite ?? "Unclear",
    decisionBrief,
    finalAssessment,
    snapshot: {
      pagesReviewed: evidence.pages.length,
      concernsFound: concerns.length,
      screenshotsCaptured: evidence.pages.filter((page) => page.screenshotPath).length,
      linksRecorded: evidence.pages.reduce((total, page) => total + page.links.length, 0),
      emailsFound: signals.emails.length,
      phonesFound: signals.phones.length,
      commonPagesFound: commonPages.length,
      contactFormsFound
    },
    verifiedFacts: assessmentProfile.verifiedFacts,
    positiveIndicators: assessmentProfile.positiveIndicators,
    concernIndicators: assessmentProfile.concernIndicators,
    unknowns: assessmentProfile.unknowns,
    manualFollowUps: assessmentProfile.manualFollowUps,
    categoryAssessments: assessmentProfile.categoryAssessments,
    positiveNotes,
    followUpNotes: uniqueStrings(followUpNotes)
  };
}

function buildFinalAssessment(
  evidence: ReviewEvidence,
  concerns: ReviewConcern[],
  contactFormsFound: number
): ReviewSummary["finalAssessment"] {
  const high = concerns.filter((concern) => concern.severity === "high").length;
  const medium = concerns.filter((concern) => concern.severity === "medium").length;
  const usefulPageCount = evidence.pages.filter((page) => (page.status === undefined || page.status < 400) && countWords(page.text) >= 40).length;
  const identityMatch = evidence.siteIdentity?.matchLevel;
  const missingExpectedPage = concerns.some((concern) =>
    ["missing_contact_page", "missing_privacy_page", "missing_terms_page", "policy_pages_missing"].includes(concern.code)
  );
  const contactMethodFound = (evidence.signals?.emails.length ?? 0) + (evidence.signals?.phones.length ?? 0) + contactFormsFound > 0;

  if (usefulPageCount === 0) {
    return {
      label: "Insufficient website evidence",
      reasons: ["No reviewed page provided enough visible text for a confident website-quality conclusion."],
      recommendation: "Open the site manually and confirm whether the pages are available before relying on this review."
    };
  }

  if (high > 0 || medium >= 3 || missingExpectedPage || identityMatch === "Unclear match" || !contactMethodFound) {
    const reasons = [
      high > 0 ? "One or more high-priority follow-up items were found." : undefined,
      medium >= 3 ? "Several medium-priority follow-up items were found." : undefined,
      missingExpectedPage ? "One or more expected contact or policy pages were not found as reviewed or linked pages." : undefined,
      identityMatch === "Unclear match" ? "The provided or observed business details did not form a clear match." : undefined,
      !contactMethodFound ? "No email, phone number, or contact form was found on reviewed pages." : undefined
    ].filter((reason): reason is string => Boolean(reason));

    return {
      label: "Needs manual follow-up",
      reasons,
      recommendation: "Review the priority items and confirm important business details before relying on the website."
    };
  }

  return {
    label: "Looks complete",
    reasons: ["Reviewed pages loaded with useful visible text, contact details, and common site pages."],
    recommendation: "Keep the report with the screenshots and review any business-specific details that matter for your use case."
  };
}

function buildDecisionBrief(
  evidence: ReviewEvidence,
  concerns: ReviewConcern[],
  profile: Pick<
    ReviewSummary,
    "riskLevel" | "confidence" | "concernIndicators" | "positiveIndicators" | "manualFollowUps"
  >,
  finalAssessment: ReviewSummary["finalAssessment"]
): ReviewSummary["decisionBrief"] {
  const host = readableHost(evidence.input.websiteUrl);
  const headline = `${profile.riskLevel} review outcome for ${host}`;
  const priority = priorityConcernMessages(concerns);
  const topFindings = uniqueStrings([
    ...priority.slice(0, 4),
    ...(priority.length ? [] : profile.positiveIndicators.slice(0, 2))
  ]).slice(0, 4);
  const nextSteps = uniqueStrings([
    ...profile.manualFollowUps.slice(0, 3),
    finalAssessment.recommendation,
    "Keep the generated screenshots and evidence file with this review so findings can be checked later."
  ]).slice(0, 5);

  return {
    headline,
    recommendation: decisionRecommendation(profile.riskLevel, finalAssessment.label),
    topFindings: topFindings.length ? topFindings : ["No priority concern indicators were generated by the built-in checks."],
    nextSteps
  };
}

function decisionRecommendation(
  riskLevel: ReviewSummary["riskLevel"],
  assessmentLabel: ReviewSummary["finalAssessment"]["label"]
): string {
  if (riskLevel === "High risk" || riskLevel === "Severe risk") {
    return "Do not rely on this website for payments, sensitive documents, or business decisions until the manual follow-up items are resolved.";
  }
  if (riskLevel === "Moderate risk" || assessmentLabel === "Needs manual follow-up") {
    return "Use the website as a lead for manual verification, then confirm business details through outside records or direct contact.";
  }
  if (riskLevel === "Mild risk") {
    return "The reviewed pages look usable, but the noted items should be cleaned up or confirmed before presenting the site as fully verified.";
  }
  return "The reviewed pages did not show major built-in concerns, but the report should still be kept as a snapshot rather than a guarantee.";
}

function buildAssessmentProfile(
  evidence: ReviewEvidence,
  concerns: ReviewConcern[],
  signals: ReviewSignals,
  commonPages: string[],
  contactFormsFound: number
): Pick<
  ReviewSummary,
  | "riskLevel"
  | "confidence"
  | "verifiedFacts"
  | "positiveIndicators"
  | "concernIndicators"
  | "unknowns"
  | "manualFollowUps"
  | "categoryAssessments"
> {
  const categoryAssessments = buildCategoryAssessments(evidence, concerns, signals, commonPages, contactFormsFound);
  const concernIndicators = priorityConcernMessages(concerns);
  const unknowns = uniqueStrings([
    ...categoryAssessments.flatMap((category) => category.unknowns),
    ...externalEvidenceUnknowns(evidence)
  ]);
  const manualFollowUps = uniqueStrings([
    ...(evidence.siteIdentity?.manualFollowUps ?? []),
    ...categoryAssessments.flatMap((category) => category.manualFollowUps),
    ...externalEvidenceManualFollowUps(evidence)
  ]).slice(0, 12);

  return {
    riskLevel: calculateRiskLevel(evidence, concerns),
    confidence: calculateConfidence(evidence, signals, unknowns),
    verifiedFacts: buildVerifiedFacts(evidence, signals, commonPages, contactFormsFound),
    positiveIndicators: buildPositiveIndicators(evidence, signals, commonPages, contactFormsFound),
    concernIndicators,
    unknowns,
    manualFollowUps,
    categoryAssessments
  };
}

function buildCategoryAssessments(
  evidence: ReviewEvidence,
  concerns: ReviewConcern[],
  signals: ReviewSignals,
  commonPages: string[],
  contactFormsFound: number
): ReviewCategoryAssessment[] {
  const entryPointSummary = buildEntryPointSummary(evidence);
  const external = evidence.externalEvidence;
  const profileLinkCount = external?.profileLinks.length ?? signals.socialLinks.length;
  const searchLinkCount = external?.searchLinks.length ?? 0;
  const registryCheckCount = external?.registryChecks.length ?? 0;
  return [
    categoryAssessment("site_access", "Site access and entry points", categoryLevel(concerns, "site_access"), [
      `${evidence.pages.length} page${evidence.pages.length === 1 ? "" : "s"} reviewed.`,
      entryPointSummary
    ]),
    categoryAssessment(
      "domain_infrastructure",
      "Domain and infrastructure",
      categoryLevel(concerns, "domain_infrastructure", evidence.domainRegistration?.status === "found" ? 0 : 1),
      [
        evidence.domainRegistration?.creationDate ? `Domain creation date found: ${evidence.domainRegistration.creationDate}.` : undefined,
        evidence.domainRegistration?.registrar ? `Registrar found: ${evidence.domainRegistration.registrar}.` : undefined,
        evidence.domainRegistration?.nameServers.length ? `Name servers found: ${evidence.domainRegistration.nameServers.slice(0, 3).join(", ")}.` : undefined
      ],
      evidence.domainRegistration?.status === "found" ? [] : ["Manual follow-up recommended: public domain registration dates were not available from this run."],
      ["Compare domain dates with any business-history claims if dates matter for your decision."]
    ),
    categoryAssessment("website_quality", "Website quality and maintenance", categoryLevel(concerns, "website_quality"), [
      `${concerns.filter((concern) => concern.code === "broken_link").length} broken link item${concerns.filter((concern) => concern.code === "broken_link").length === 1 ? "" : "s"} found.`,
      `${evidence.pages.filter((page) => page.metaDescription).length} reviewed page${evidence.pages.filter((page) => page.metaDescription).length === 1 ? "" : "s"} had meta descriptions.`
    ]),
    categoryAssessment("content_authenticity", "Content authenticity", categoryLevel(concerns, "content_authenticity"), [
      contentConcernSummary(concerns)
    ]),
    categoryAssessment(
      "business_identity",
      "Business identity and contact details",
      categoryLevel(concerns, "business_identity"),
      [
        `${signals.emails.length} email address${signals.emails.length === 1 ? "" : "es"} found.`,
        `${signals.phones.length} phone number${signals.phones.length === 1 ? "" : "s"} found.`,
        `${signals.addressLines.length} address-like line${signals.addressLines.length === 1 ? "" : "s"} found.`,
        `${contactFormsFound} contact form${contactFormsFound === 1 ? "" : "s"} found.`
      ],
      [],
      businessManualFollowUps(evidence)
    ),
    categoryAssessment("policy_compliance", "Policy and transparency", categoryLevel(concerns, "policy_compliance"), [
      `Common pages found: ${commonPages.length ? commonPages.join(", ") : "none found"}.`
    ]),
    categoryAssessment(
      "external_footprint",
      "External footprint",
      categoryLevel(concerns, "external_footprint"),
      [
        `${profileLinkCount} external profile link${profileLinkCount === 1 ? "" : "s"} found on reviewed pages.`,
        searchLinkCount
          ? `${searchLinkCount} manual public-search link${searchLinkCount === 1 ? "" : "s"} generated for directories, maps, reviews, complaints, and LinkedIn-style profile checks.`
          : undefined,
        registryCheckCount
          ? `${registryCheckCount} state registry follow-up link${registryCheckCount === 1 ? "" : "s"} generated from the expected state.`
          : undefined
      ],
      externalEvidenceUnknowns(evidence),
      [
        searchLinkCount
          ? "Open the generated public-search links and compare names, addresses, phone numbers, website links, and profile details before relying on the business."
          : "Search independent public references and compare names, addresses, phone numbers, website links, and profile details before relying on the business.",
        ...externalEvidenceManualFollowUps(evidence)
      ]
    ),
    categoryAssessment(
      "commercial_behavior",
      "Commercial behavior",
      categoryLevel(concerns, "commercial_behavior"),
      [commercialConcernSummary(concerns)],
      ["Manual follow-up recommended: checkout/payment flow was not completed; only visible wording on reviewed pages was checked."],
      ["Review invoices, contracts, refund terms, and payment instructions before sending funds or sensitive documents."]
    )
  ];
}

function categoryAssessment(
  key: ReviewCategoryAssessment["key"],
  label: string,
  level: AssessmentLevel,
  evidence: Array<string | undefined>,
  unknowns: string[] = [],
  manualFollowUps: string[] = []
): ReviewCategoryAssessment {
  return {
    key,
    label,
    level,
    evidence: uniqueStrings(evidence),
    unknowns,
    manualFollowUps
  };
}

function externalEvidenceUnknowns(evidence: ReviewEvidence): string[] {
  const external = evidence.externalEvidence;
  if (!external) {
    return ["Manual follow-up recommended: optional external evidence was not generated for this run."];
  }

  return uniqueStrings([
    external.searchLinks.length
      ? "Manual follow-up recommended: generated public-search links were not opened or interpreted by this local app."
      : "Manual follow-up recommended: independent directories, map listings, review platforms, and public profile search results were not checked by this local app.",
    external.registryChecks.length
      ? "Manual follow-up recommended: state registry links were generated, but registry result pages were not submitted or interpreted by this local app."
      : evidence.input.expectedState
        ? "Manual follow-up recommended: no supported state registry connector was available for the expected state provided."
        : "Manual follow-up recommended: no expected registration state was provided for a state registry checklist."
  ]);
}

function externalEvidenceManualFollowUps(evidence: ReviewEvidence): string[] {
  const external = evidence.externalEvidence;
  if (!external) {
    return [];
  }

  return uniqueStrings([
    ...external.registryChecks.map(
      (registry) => `Search ${registry.agency} for "${registry.suggestedSearch}" and compare the official record to the website details.`
    ),
    external.searchLinks.length
      ? "Open the generated review, complaint, map, directory, and profile search links and save any meaningful matches with the report."
      : undefined
  ]);
}

function buildEntryPointSummary(evidence: ReviewEvidence): string {
  const precheckLoaded = (evidence.siteAvailability ?? []).filter((check) => check.ok).length;
  const homepageLoaded = evidence.pages.some((page) => page.depth === 0 && (page.status === undefined || page.status < 400));
  if (precheckLoaded > 0) {
    return `${precheckLoaded} common entry point${precheckLoaded === 1 ? "" : "s"} loaded in the precheck.`;
  }
  if (homepageLoaded) {
    return "The browser review loaded the homepage, but the separate entry-point precheck did not load a common entry point.";
  }
  return "0 common entry points loaded in the precheck.";
}

function findPageLoadConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const statusConcerns = evidence.pages
    .filter((page) => page.status !== undefined && page.status >= 400)
    .map((page) => ({
      code: "page_load_status",
      area: "page_quality" as const,
      severity: "medium" as const,
      label: "Needs review",
      message: `Reviewed page returned HTTP ${page.status}.`,
      pageUrl: page.finalUrl,
      evidence: page.title || page.finalUrl
    }));

  const noteConcerns = evidence.pages
    .filter((page) => page.note)
    .map((page) => ({
      code: "page_open_note",
      area: "page_quality" as const,
      severity: "low" as const,
      label: "Needs review",
      message: "Reviewed page had an opening or screenshot note.",
      pageUrl: page.finalUrl,
      evidence: page.note
    }));

  return [...statusConcerns, ...noteConcerns];
}

function findBrokenLinkConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const seen = new Set<string>();
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    for (const link of page.links) {
      if (!link.url || link.status === undefined || link.status < 400) {
        continue;
      }

      const key = `${page.finalUrl}|${link.url}|${link.status}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      concerns.push({
        code: "broken_link",
        area: "page_quality",
        severity: link.internal ? "medium" : "low",
        label: "Broken link",
        message: `${link.internal ? "Site" : "Linked"} page returned HTTP ${link.status}.`,
        pageUrl: page.finalUrl,
        evidence: `${link.text || link.href} -> ${link.url}`
      });
    }
  }

  return concerns;
}

function findCrawlCoverageConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  if (evidence.pages.length < evidence.limits.maxPages) {
    return [];
  }

  return [
    {
      code: "page_limit_reached",
      area: "page_quality",
      severity: "low",
      label: "Review coverage",
      message: "The review reached the configured page limit, so additional linked pages may not be included.",
      evidence: `${evidence.pages.length} of ${evidence.limits.maxPages} allowed pages were reviewed.`
    }
  ];
}

function findNavigationConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const homepage = evidence.pages[0];
  if (!homepage || evidence.limits.maxDepth === 0) {
    return [];
  }

  const internalPageLinks = homepage.links.filter((link) => link.internal && link.url && /^https?:\/\//i.test(link.url));
  if (internalPageLinks.length > 0 || evidence.pages.length > 1) {
    return [];
  }

  return [
    {
      code: "no_internal_page_links",
      area: "page_quality",
      severity: "low",
      label: "Needs review",
      message: "No internal page links were found on the homepage.",
      pageUrl: homepage.finalUrl
    }
  ];
}

function findTitleConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    const title = page.title.trim();
    if (!title || /^(home|homepage|untitled|document)$/i.test(title)) {
      concerns.push({
        code: "weak_page_title",
        area: "content_quality",
        severity: "low",
        label: "Needs review",
        message: "Page title is missing or generic.",
        pageUrl: page.finalUrl,
        evidence: title || "No title"
      });
    }
  }

  const titleGroups = new Map<string, string[]>();
  for (const page of evidence.pages) {
    const title = page.title.trim().toLowerCase();
    if (!title) {
      continue;
    }
    titleGroups.set(title, [...(titleGroups.get(title) ?? []), page.finalUrl]);
  }

  for (const [title, urls] of titleGroups) {
    if (urls.length > 1) {
      concerns.push({
        code: "duplicate_page_title",
        area: "content_quality",
        severity: "low",
        label: "Needs review",
        message: "Multiple reviewed pages use the same title.",
        evidence: `${title}: ${urls.slice(0, 4).join(", ")}`
      });
    }
  }

  return concerns;
}

function findThinContentConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  return evidence.pages
    .filter((page) => page.status === undefined || page.status < 400)
    .filter((page) => countWords(page.text) > 0 && countWords(page.text) < 80)
    .map((page) => ({
      code: "thin_visible_text",
      area: "content_quality" as const,
      severity: "low" as const,
      label: "Thin page",
      message: "Reviewed page has very little visible text.",
      pageUrl: page.finalUrl,
      evidence: `${countWords(page.text)} words`
    }));
}

function findPlaceholderTextConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    for (const check of placeholderChecks) {
      const match = page.text.match(check.pattern);
      if (!match) {
        continue;
      }

      concerns.push({
        code: check.code,
        area: "content_quality",
        severity: "medium",
        label: "Placeholder content",
        message: `Placeholder wording was found: ${check.phrase}.`,
        pageUrl: page.finalUrl,
        evidence: excerptAround(page.text, match.index ?? 0)
      });
    }
  }

  return concerns;
}

function findPlaceholderMetricConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const metricPattern =
    /\b(?:(project(?:s)?(?:\s+done)?|years?\s+experience|award(?:\s+winning)?|happy\s+clients?|clients?|customers?|case\s+studies|employees?)\s+0\s*(?:k|\+)?|0\s*(?:k|\+)?\s+(project(?:s)?(?:\s+done)?|years?\s+experience|award(?:\s+winning)?|happy\s+clients?|clients?|customers?|case\s+studies|employees?))\b/gi;

  for (const page of evidence.pages) {
    const text = page.text.replace(/\s+/g, " ").trim();
    const matches = [...text.matchAll(metricPattern)];
    if (matches.length === 0) {
      continue;
    }

    const labels = uniqueStrings(matches.map((match) => match[1] || match[2]).filter(Boolean));
    concerns.push({
      code: "placeholder_zero_metrics",
      area: "content_quality",
      severity: labels.length >= 2 ? "high" : "medium",
      label: "Placeholder metrics",
      message: "Business metric counters appear to be set to zero or placeholder values.",
      pageUrl: page.finalUrl,
      evidence: labels.slice(0, 6).join(", ")
    });
  }

  return concerns;
}

function findSpellingConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    for (const check of spellingChecks) {
      const match = page.text.match(check.pattern);
      if (!match) {
        continue;
      }

      concerns.push({
        code: "common_misspelling",
        area: "content_quality",
        severity: "low",
        label: "Spelling needs review",
        message: `Possible misspelling found: ${check.misspelling}.`,
        pageUrl: page.finalUrl,
        evidence: `${check.misspelling} -> ${check.suggestion}; ${excerptAround(page.text, match.index ?? 0)}`
      });
    }
  }

  return concerns;
}

function findGenericWordingConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    const phrases = genericWordingChecks.filter((check) => check.pattern.test(page.text)).map((check) => check.phrase);
    if (phrases.length === 0) {
      continue;
    }

    concerns.push({
      code: "generic_marketing_wording",
      area: "content_quality",
      severity: "low",
      label: "Generic wording",
      message: "Generic marketing wording appeared in reviewed text.",
      pageUrl: page.finalUrl,
      evidence: [...new Set(phrases)].join(", ")
    });
  }

  return concerns;
}

function findGenericWordingCoverageConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const phrases = new Set<string>();
  for (const page of evidence.pages) {
    for (const check of genericWordingChecks) {
      if (check.pattern.test(page.text)) {
        phrases.add(check.phrase);
      }
    }
  }

  if (phrases.size < 3) {
    return [];
  }

  return [
    {
      code: "generic_wording_heavy",
      area: "content_quality",
      severity: "medium",
      label: "Generic wording",
      message: "Several generic marketing phrases appeared across the reviewed pages.",
      evidence: [...phrases].join(", ")
    }
  ];
}

function findTemplateWritingConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const phrases = new Set<string>();
  for (const page of evidence.pages) {
    for (const check of templateWritingChecks) {
      if (check.pattern.test(page.text)) {
        phrases.add(check.phrase);
      }
    }
  }

  if (phrases.size < 2) {
    return [];
  }

  return [
    {
      code: "template_like_writing",
      area: "content_quality",
      severity: "medium",
      label: "Template-like writing",
      message: "Reviewed text contains repeated template-like writing patterns. This does not determine how the text was written.",
      evidence: [...phrases].join(", ")
    }
  ];
}

function findUnsupportedClaimConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    const phrases = unsupportedClaimChecks.filter((check) => check.pattern.test(page.text)).map((check) => check.phrase);
    if (phrases.length < 2) {
      continue;
    }

    concerns.push({
      code: "unsupported_marketing_claims",
      area: "content_quality",
      severity: phrases.length >= 3 ? "medium" : "low",
      label: "Marketing claims",
      message: "Several broad marketing claims appeared without supporting detail in the reviewed text.",
      pageUrl: page.finalUrl,
      evidence: uniqueStrings(phrases).join(", ")
    });
  }

  return concerns;
}

function findStaleDateConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const currentYear = new Date().getFullYear();

  for (const page of evidence.pages) {
    const staleMatches = [...page.text.matchAll(/\b(?:apply\s+until|application\s+deadline|deadline|posted|updated)\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-](20\d{2})|20\d{2})\b/gi)];
    const staleEvidence = staleMatches
      .map((match) => ({ text: match[0], year: Number(match[2] ?? match[1]) }))
      .filter((item) => Number.isFinite(item.year) && item.year <= currentYear - 2);

    if (staleEvidence.length === 0) {
      continue;
    }

    concerns.push({
      code: "stale_job_or_deadline_date",
      area: "content_quality",
      severity: staleEvidence.some((item) => item.year <= currentYear - 4) ? "medium" : "low",
      label: "Stale date",
      message: "A job, application, or page date appears old enough to need manual review.",
      pageUrl: page.finalUrl,
      evidence: staleEvidence.slice(0, 4).map((item) => item.text).join(", ")
    });
  }

  return concerns;
}

function findDummyCommerceConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const siteText = evidence.pages.map((page) => page.text).join("\n");
  const serviceSite = /\b(?:software|staffing|consulting|consultation|it services?|technology|recruitment|placement|developer|engineering)\b/i.test(siteText);
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    const phrases = dummyCommerceChecks.filter((check) => check.pattern.test(`${page.title}\n${page.text}\n${page.finalUrl}`)).map((check) => check.phrase);
    if (phrases.length === 0 || (!serviceSite && phrases.length < 2)) {
      continue;
    }

    concerns.push({
      code: "dummy_or_irrelevant_commerce_content",
      area: "content_quality",
      severity: serviceSite || phrases.length >= 3 ? "medium" : "low",
      label: "Unrelated commerce content",
      message: "Product, cart, or sample-commerce wording appeared on a site that otherwise reads like a service business.",
      pageUrl: page.finalUrl,
      evidence: uniqueStrings(phrases).join(", ")
    });
  }

  return concerns;
}

function findThirdPartyContentConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const reviewedHost = normalizedHostFromUrl(evidence.input.websiteUrl);
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    if (isPolicyLikePage(page.finalUrl, page.title)) {
      continue;
    }

    const serviceLikeText = /\b(?:software|staffing|consulting|consultation|proxy|technology|service|product|developer|engineering)\b/i.test(
      `${page.title}\n${page.text}`
    );
    if (!serviceLikeText) {
      continue;
    }

    const externalDomains = uniqueStrings([
      ...extractVisibleDomains(page.text),
      ...page.links.filter((link) => !link.internal).map((link) => normalizedHostFromUrl(link.url ?? link.href))
    ]).filter((domain) => shouldFlagExternalDomain(domain, reviewedHost));
    if (externalDomains.length === 0) {
      continue;
    }

    const actionLinks = page.links
      .filter((link) => !link.internal && link.url && shouldFlagExternalDomain(normalizedHostFromUrl(link.url), reviewedHost))
      .filter((link) => /\b(?:sign(?:ing)?\s*up|register|buy|purchase|start|get started|try)\b/i.test(link.text || link.href));

    concerns.push({
      code: "third_party_service_reference",
      area: "content_quality",
      severity: actionLinks.length > 0 ? "medium" : "low",
      label: "Third-party reference",
      message: "A service-like page referenced an outside domain or provider. This can be normal, but it needs review when assessing copied or borrowed content.",
      pageUrl: page.finalUrl,
      evidence: externalDomains.slice(0, 6).join(", ")
    });
  }

  return concerns;
}

function findRepeatedSentenceStartConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const starts = new Map<string, number>();
  const allText = evidence.pages.map((page) => page.text).join(" ");
  for (const sentence of allText.split(/[.!?]+/)) {
    const words = sentence
      .replace(/[^a-zA-Z0-9\s']/g, " ")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length < 8) {
      continue;
    }

    const start = words.slice(0, 3).join(" ");
    if (!shouldCheckRepeatedSentenceStart(start)) {
      continue;
    }
    starts.set(start, (starts.get(start) ?? 0) + 1);
  }

  const repeated = [...starts.entries()].filter(([, count]) => count >= 3).sort((left, right) => right[1] - left[1]);
  if (repeated.length === 0) {
    return [];
  }

  return [
    {
      code: "repeated_sentence_starts",
      area: "content_quality",
      severity: "low",
      label: "Repetitive writing",
      message: "Several sentences begin with the same wording, which can make the page feel templated.",
      evidence: repeated.slice(0, 3).map(([start, count]) => `${start} (${count})`).join(", ")
    }
  ];
}

function findRepeatedContentBlockConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const linesByText = new Map<string, Set<string>>();

  for (const page of evidence.pages) {
    for (const line of page.text.split(/\r?\n/).map(normalizeRepeatedLine).filter(shouldCheckRepeatedLine)) {
      const urls = linesByText.get(line) ?? new Set<string>();
      urls.add(page.finalUrl);
      linesByText.set(line, urls);
    }
  }

  const repeated = [...linesByText.entries()]
    .filter(([, urls]) => urls.size >= 2)
    .sort((left, right) => right[1].size - left[1].size);

  if (repeated.length === 0) {
    return [];
  }

  return [
    {
      code: "repeated_content_blocks",
      area: "content_quality",
      severity: repeated.length >= 3 ? "medium" : "low",
      label: "Repeated content",
      message: "The same visible text block appeared on more than one reviewed page.",
      evidence: repeated
        .slice(0, 3)
        .map(([line, urls]) => `"${line.slice(0, 90)}" (${urls.size} pages)`)
        .join("; ")
    }
  ];
}

function findMissingPageConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);

  const checks = [
    { code: "missing_contact_page", key: "contact" as const, label: "Contact page", area: "business_identity" as const },
    { code: "missing_about_page", key: "about" as const, label: "About page", area: "business_identity" as const },
    { code: "missing_privacy_page", key: "privacy" as const, label: "Privacy Policy", area: "policy_pages" as const },
    { code: "missing_terms_page", key: "terms" as const, label: "Terms page", area: "policy_pages" as const }
  ];

  return checks
    .filter((check) => !hasLinkedOrReviewedPage(signals, check.key))
    .map((check) => ({
      code: check.code,
      area: check.area,
      severity: "medium" as const,
      label: "Missing expected page",
      message: `${check.label} was not found as a reviewed page or linked page.`,
      evidence: `Reviewed ${evidence.pages.length} page${evidence.pages.length === 1 ? "" : "s"}.`
    }));
}

function findBusinessDetailCoverageConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const hasContactPage = hasLinkedOrReviewedPage(signals, "contact");
  const directDetails =
    signals.emails.length + signals.phones.length + signals.addressLines.length + signals.socialLinks.length;

  if (hasContactPage || directDetails > 0) {
    return [];
  }

  return [
    {
      code: "business_details_sparse",
      area: "business_identity",
      severity: "high",
      label: "Limited business details",
      message: "No linked contact page, email, phone number, address-like line, or social profile was found.",
      evidence: `Reviewed ${evidence.pages.length} page${evidence.pages.length === 1 ? "" : "s"}.`
    }
  ];
}

function findPolicyCoverageConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const hasPrivacy = hasLinkedOrReviewedPage(signals, "privacy");
  const hasTerms = hasLinkedOrReviewedPage(signals, "terms");

  if (hasPrivacy || hasTerms) {
    return [];
  }

  return [
    {
      code: "policy_pages_missing",
      area: "policy_pages",
      severity: "high",
      label: "Policy pages missing",
      message: "No linked or reviewed Privacy Policy or Terms page was found.",
      evidence: `Reviewed ${evidence.pages.length} page${evidence.pages.length === 1 ? "" : "s"}.`
    }
  ];
}

function findSocialLinkConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const seen = new Set<string>();

  for (const page of evidence.pages) {
    for (const link of page.links) {
      const platform = expectedSocialPlatform(link.text || link.href);
      if (!platform) {
        continue;
      }

      const destination = link.url ?? link.href;
      const key = `${page.finalUrl}|${platform.label}|${destination}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (!link.url || !/^https?:\/\//i.test(link.url)) {
        concerns.push({
          code: "social_link_not_page",
          area: "business_identity",
          severity: "medium",
          label: "Social link needs review",
          message: `${platform.label} link does not point to a reviewable web page.`,
          pageUrl: page.finalUrl,
          evidence: `${link.text || link.href} -> ${destination}`
        });
        continue;
      }

      const socialDestination = socialHostMatches(link.url, platform.hosts);
      if (link.internal || !socialDestination) {
        concerns.push({
          code: "social_link_not_external_profile",
          area: "business_identity",
          severity: "medium",
          label: "Social link needs review",
          message: `${platform.label} link does not point to an external ${platform.label} profile domain.`,
          pageUrl: page.finalUrl,
          evidence: `${link.text || link.href} -> ${link.url}`
        });
        continue;
      }

      if (link.status !== undefined && link.status >= 400) {
        concerns.push({
          code: "social_link_status",
          area: "business_identity",
          severity: "low",
          label: "Social link needs review",
          message: `${platform.label} link returned HTTP ${link.status} from this review.`,
          pageUrl: page.finalUrl,
          evidence: `${link.text || link.href} -> ${link.url}`
        });
      }
    }
  }

  return concerns;
}

function findSocialLabelConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const pagesByPlatform = new Map<string, { label: string; urls: Set<string> }>();

  for (const page of evidence.pages) {
    const visiblePlatforms = socialPlatforms.filter((platform) => platform.pattern.test(page.text));
    if (visiblePlatforms.length === 0) {
      continue;
    }

    const missingProfiles = visiblePlatforms.filter(
      (platform) => !page.links.some((link) => link.url && socialHostMatches(link.url, platform.hosts))
    );
    if (missingProfiles.length === 0) {
      continue;
    }

    for (const platform of missingProfiles) {
      const current = pagesByPlatform.get(platform.label) ?? { label: platform.label, urls: new Set<string>() };
      current.urls.add(page.finalUrl);
      pagesByPlatform.set(platform.label, current);
    }
  }

  if (pagesByPlatform.size === 0) {
    return [];
  }

  const missingPlatforms = [...pagesByPlatform.values()];
  const pageCount = new Set(missingPlatforms.flatMap((platform) => [...platform.urls])).size;
  return [
    {
      code: "social_label_without_profile_link",
      area: "business_identity",
      severity: missingPlatforms.length >= 2 || pageCount >= 2 ? "medium" : "low",
      label: "Social links need review",
      message: "Social platform labels appeared, but matching external profile links were not found.",
      evidence: `${missingPlatforms.map((platform) => platform.label).join(", ")} on ${pageCount} page${pageCount === 1 ? "" : "s"}.`
    }
  ];
}

function findContactEmailDomainConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const websiteHost = normalizedHostFromUrl(evidence.input.websiteUrl);
  const concerns: ReviewConcern[] = [];
  const seen = new Set<string>();

  if (signals.emails.length === 1 && /^hr@/i.test(signals.emails[0])) {
    concerns.push({
      code: "only_hr_contact_email",
      area: "business_identity",
      severity: "low",
      label: "Contact email needs review",
      message: "The only email address found is an HR mailbox. That can be normal for hiring pages, but it is narrow for general business verification.",
      evidence: signals.emails[0]
    });
  }

  for (const email of signals.emails) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || seen.has(domain)) {
      continue;
    }
    seen.add(domain);

    if (commonEmailDomains.has(domain)) {
      concerns.push({
        code: "contact_email_common_provider",
        area: "business_identity",
        severity: "low",
        label: "Contact email needs review",
        message: "A contact email uses a common mailbox provider instead of the website domain.",
        evidence: email
      });
      continue;
    }

    if (websiteHost && !hostsMatch(domain, websiteHost)) {
      if (isLookalikeContactDomain(domain, websiteHost)) {
        concerns.push({
          code: "contact_email_lookalike_domain",
          area: "business_identity",
          severity: "medium",
          label: "Contact email needs review",
          message: "A contact email uses a domain that closely resembles, but does not match, the reviewed website domain.",
          evidence: `${email} on ${websiteHost}`
        });
        continue;
      }

      concerns.push({
        code: "contact_email_domain_mismatch",
        area: "business_identity",
        severity: "low",
        label: "Contact email needs review",
        message: "A contact email uses a different domain than the reviewed website.",
        evidence: `${email} on ${websiteHost}`
      });
    }
  }

  return concerns;
}

function findBusinessNameConsistencyConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  if (!evidence.input.companyName) {
    return [];
  }

  const expected = normalizeBusinessName(evidence.input.companyName);
  const names = new Set<string>();
  for (const page of evidence.pages) {
    for (const name of extractCopyrightNames(page.text)) {
      const normalized = normalizeBusinessName(name);
      if (normalized && normalized !== expected) {
        names.add(name);
      }
    }
  }

  if (names.size === 0) {
    return [];
  }

  return [
    {
      code: "different_business_name_seen",
      area: "business_identity",
      severity: "medium",
      label: "Name consistency",
      message: "A different business name appeared in copyright-style page text.",
      evidence: [...names].slice(0, 5).join(", ")
    }
  ];
}

function findBusinessDetailConsistencyConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const concerns: ReviewConcern[] = [];
  const emailDomains = uniqueStrings(signals.emails.map((email) => email.split("@")[1]?.toLowerCase()).filter(Boolean));
  const phones = uniqueStrings(signals.phones);
  const addressLines = uniqueStrings(signals.addressLines.map(normalizeAddressLine));
  const copyrightNames = uniqueStrings(
    evidence.pages
      .flatMap((page) => extractCopyrightNames(page.text))
      .map((name) => normalizeBusinessName(name))
      .filter(Boolean)
  );

  if (copyrightNames.length > 1) {
    concerns.push({
      code: "multiple_business_names_seen",
      area: "business_identity",
      severity: "medium",
      label: "Name consistency",
      message: "Multiple copyright-style business names appeared across reviewed pages.",
      evidence: copyrightNames.slice(0, 5).join(", ")
    });
  }

  if (emailDomains.length > 1) {
    concerns.push({
      code: "multiple_contact_email_domains",
      area: "business_identity",
      severity: "low",
      label: "Contact consistency",
      message: "Multiple contact email domains appeared across reviewed pages.",
      evidence: emailDomains.slice(0, 6).join(", ")
    });
  }

  if (phones.length > 1) {
    concerns.push({
      code: "multiple_contact_phones",
      area: "business_identity",
      severity: "low",
      label: "Contact consistency",
      message: "Multiple phone numbers appeared across reviewed pages.",
      evidence: phones.slice(0, 6).join(", ")
    });
  }

  if (addressLines.length > 1) {
    concerns.push({
      code: "multiple_address_lines",
      area: "business_identity",
      severity: "low",
      label: "Contact consistency",
      message: "Multiple address-like lines appeared across reviewed pages.",
      evidence: signals.addressLines.slice(0, 4).join(" | ")
    });
  }

  return concerns;
}

function findContactGeographyConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const addressStates = uniqueStrings(signals.addressLines.map(addressState).filter(Boolean));
  if (addressStates.length === 0 || signals.phones.length === 0) {
    return [];
  }

  const concerns: ReviewConcern[] = [];
  for (const phone of signals.phones) {
    const areaCode = phoneAreaCode(phone);
    const statesForAreaCode = areaCode ? areaCodeStates[areaCode] : undefined;
    if (!areaCode || !statesForAreaCode || addressStates.some((state) => statesForAreaCode.includes(state))) {
      continue;
    }

    concerns.push({
      code: "phone_area_code_location_mismatch",
      area: "business_identity",
      severity: "low",
      label: "Contact geography",
      message: "A phone area code does not match the address state found in reviewed text. This can be normal for mobile or VoIP numbers, so it needs manual review.",
      evidence: `${phone} area code ${areaCode}; address state ${addressStates.join(", ")}`
    });
  }

  return concerns.slice(0, 3);
}

function findExpectedStateConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const expectedState = evidence.input.expectedState;
  if (!expectedState) {
    return [];
  }

  const allText = evidence.pages.map((page) => `${page.title}\n${page.text}`).join("\n");
  if (textIncludesState(allText, expectedState)) {
    return [];
  }

  return [
    {
      code: "expected_state_not_seen",
      area: "business_identity",
      severity: "low",
      label: "Expected state",
      message: "The expected state for manual business registration follow-up was not found in reviewed page text.",
      evidence: expectedState
    }
  ];
}

function findDomainDateConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const creationYear = yearFromDate(evidence.domainRegistration?.creationDate);
  if (!creationYear) {
    return [];
  }

  const claimedYears = extractBusinessHistoryYears(evidence.pages.map((page) => page.text).join("\n"));
  if (claimedYears.length === 0) {
    return [];
  }

  const earliestClaimedYear = Math.min(...claimedYears);
  if (creationYear <= earliestClaimedYear + 1) {
    return [];
  }

  return [
    {
      code: "domain_date_after_business_history",
      area: "business_identity",
      severity: "low",
      label: "Domain date",
      message: "The website text includes older business-history wording than the public domain creation date.",
      evidence: `Domain created in ${creationYear}; website text references ${earliestClaimedYear}.`
    }
  ];
}

function findIndustryAndIdentifierConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const allText = evidence.pages.map((page) => `${page.title}\n${page.text}`).join("\n").toLowerCase();

  if (evidence.input.claimedIndustry && !textContainsMeaningfulTerms(allText, evidence.input.claimedIndustry)) {
    concerns.push({
      code: "claimed_industry_not_seen",
      area: "business_identity",
      severity: "low",
      label: "Industry or service",
      message: "The provided industry or service was not found clearly in reviewed page text.",
      evidence: evidence.input.claimedIndustry
    });
  }

  if (evidence.input.claimedIndustry && regulatedIndustryPattern.test(evidence.input.claimedIndustry)) {
    concerns.push({
      code: "regulated_industry_manual_follow_up",
      area: "business_identity",
      severity: "low",
      label: "Manual follow-up recommended",
      message: "The provided industry may require licensing or registration checks outside the reviewed website.",
      evidence: evidence.input.claimedIndustry
    });
  }

  for (const identifier of splitIdentifiers(evidence.input.additionalIdentifiers)) {
    if (!allText.includes(identifier.toLowerCase())) {
      concerns.push({
        code: "provided_identifier_not_seen",
        area: "business_identity",
        severity: "low",
        label: "Provided identifier",
        message: "A provided identifier was not found in reviewed page text.",
        evidence: identifier
      });
    }
  }

  return concerns;
}

function findCommercialPaymentConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];

  for (const page of evidence.pages) {
    const text = page.text.toLowerCase();
    const phrases = commercialPaymentPatterns.filter((check) => check.pattern.test(text)).map((check) => check.phrase);
    if (phrases.length === 0) {
      continue;
    }

    concerns.push({
      code: "payment_wording_manual_review",
      area: "commercial_behavior",
      severity: "medium",
      label: "Payment wording",
      message: "Payment wording that deserves manual review appeared on a reviewed page.",
      pageUrl: page.finalUrl,
      evidence: uniqueStrings(phrases).join(", ")
    });
  }

  return concerns;
}

function findContactFormConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const hasContactPage = hasLinkedOrReviewedPage(signals, "contact");
  const directContactMethods = signals.emails.length + signals.phones.length + totalContactForms(evidence);

  if (!hasContactPage || directContactMethods > 0) {
    return [];
  }

  return [
    {
      code: "contact_page_no_contact_method",
      area: "business_identity",
      severity: "medium",
      label: "Contact method",
      message: "A contact page was found, but no email, phone number, or contact form was found on reviewed pages.",
      evidence: `Reviewed ${evidence.pages.length} page${evidence.pages.length === 1 ? "" : "s"}.`
    }
  ];
}

function findContactDetailConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const signals = evidence.signals ?? extractReviewSignals(evidence);
  const concerns: ReviewConcern[] = [];

  if (signals.emails.length === 0) {
    concerns.push({
      code: "email_not_seen",
      area: "business_identity",
      severity: "low",
      label: "Needs review",
      message: "No email address was found in reviewed text or links."
    });
  }

  if (signals.phones.length === 0) {
    concerns.push({
      code: "phone_not_seen",
      area: "business_identity",
      severity: "low",
      label: "Needs review",
      message: "No phone number was found in reviewed text or links."
    });
  }

  if (evidence.input.claimedLocation && signals.addressLines.length === 0) {
    concerns.push({
      code: "street_address_not_seen",
      area: "business_identity",
      severity: "low",
      label: "Needs review",
      message: "No street address-like line was found in reviewed text.",
      evidence: evidence.input.claimedLocation
    });
  }

  return concerns;
}

function findIdentityTextConcerns(evidence: ReviewEvidence): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const allText = evidence.pages.map((page) => `${page.title}\n${page.text}`).join("\n").toLowerCase();

  if (evidence.input.companyName && !allText.includes(evidence.input.companyName.toLowerCase())) {
    concerns.push({
      code: "company_name_not_seen",
      area: "business_identity",
      severity: "medium",
      label: "Needs review",
      message: "The provided company name was not found in reviewed page text.",
      evidence: evidence.input.companyName
    });
  }

  if (evidence.input.claimedLocation && !textContainsLoosePhrase(allText, evidence.input.claimedLocation)) {
    concerns.push({
      code: "claimed_location_not_seen",
      area: "business_identity",
      severity: "medium",
      label: "Needs review",
      message: "The provided location was not found in reviewed page text.",
      evidence: evidence.input.claimedLocation
    });
  }

  return concerns;
}

function findCumulativeConcernPatterns(concerns: ReviewConcern[]): ReviewConcern[] {
  const added: ReviewConcern[] = [];
  const contentCodes = new Set([
    "placeholder_lorem_ipsum",
    "placeholder_todo",
    "placeholder_sample_text",
    "placeholder_your_company",
    "placeholder_address_line",
    "placeholder_zero_metrics",
    "common_misspelling",
    "generic_marketing_wording",
    "generic_wording_heavy",
    "template_like_writing",
    "repeated_sentence_starts",
    "repeated_content_blocks",
    "stale_job_or_deadline_date",
    "dummy_or_irrelevant_commerce_content",
    "third_party_service_reference",
    "unsupported_marketing_claims",
    "thin_visible_text",
    "weak_page_title",
    "duplicate_page_title"
  ]);
  const contentCount = concerns.filter((concern) => contentCodes.has(concern.code)).length;
  if (contentCount >= 5) {
    added.push({
      code: "multiple_content_authenticity_markers",
      area: "content_quality",
      severity: "high",
      label: "Cumulative content quality",
      message: "Multiple independent content-quality markers appeared across the reviewed pages.",
      evidence: `${contentCount} content-quality marker${contentCount === 1 ? "" : "s"} found.`
    });
  }

  const identityCodes = new Set([
    "business_details_sparse",
    "social_link_not_page",
    "social_link_not_external_profile",
    "social_label_without_profile_link",
    "contact_email_common_provider",
    "contact_email_domain_mismatch",
    "contact_email_lookalike_domain",
    "only_hr_contact_email",
    "different_business_name_seen",
    "multiple_business_names_seen",
    "multiple_contact_email_domains",
    "multiple_contact_phones",
    "multiple_address_lines",
    "phone_area_code_location_mismatch",
    "company_name_not_seen",
    "claimed_location_not_seen",
    "expected_state_not_seen",
    "claimed_industry_not_seen",
    "provided_identifier_not_seen"
  ]);
  const identityCount = concerns.filter((concern) => identityCodes.has(concern.code)).length;
  if (identityCount >= 4) {
    added.push({
      code: "multiple_business_identity_followups",
      area: "business_identity",
      severity: "medium",
      label: "Cumulative business details",
      message: "Several business-detail items need manual follow-up when considered together.",
      evidence: `${identityCount} business-detail marker${identityCount === 1 ? "" : "s"} found.`
    });
  }

  return added;
}

function hasLinkedOrReviewedPage(signals: ReviewSignals, key: keyof PagePresence): boolean {
  const detail = signals.pagePresenceDetails[key];
  return Boolean(detail?.sources.includes("linked") || detail?.sources.includes("reviewed_page"));
}

function expectedSocialPlatform(text: string): (typeof socialPlatforms)[number] | undefined {
  return socialPlatforms.find((platform) => platform.pattern.test(text));
}

function socialHostMatches(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return hosts.some((expectedHost) => host === expectedHost || host.endsWith(`.${expectedHost}`));
  } catch {
    return false;
  }
}

const commonEmailDomains = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "aol.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "mail.com"
]);

function addressState(line: string): string | undefined {
  const match = line
    .toUpperCase()
    .match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
  return match?.[1];
}

function phoneAreaCode(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1, 4);
  }
  if (digits.length >= 10) {
    return digits.slice(0, 3);
  }
  return undefined;
}

function isLookalikeContactDomain(emailDomain: string, websiteHost: string): boolean {
  const emailLabel = domainRootLabel(emailDomain);
  const websiteLabel = domainRootLabel(websiteHost);
  if (!emailLabel || !websiteLabel || emailLabel === websiteLabel) {
    return false;
  }

  const longest = Math.max(emailLabel.length, websiteLabel.length);
  return longest >= 6 && levenshteinDistance(emailLabel, websiteLabel) <= 2;
}

function domainRootLabel(host: string): string {
  const labels = host.replace(/^www\./, "").toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) {
    return labels[0] ?? "";
  }
  return labels[labels.length - 2] ?? labels[0] ?? "";
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(previous[rightIndex] + 1, previous[rightIndex - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }

  return previous[right.length];
}

function normalizeAddressLine(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:suite|ste)\.?\s*\d+\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsLoosePhrase(text: string, value: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) {
    return false;
  }
  if (normalizedText.includes(normalizedValue)) {
    return true;
  }

  const terms = normalizedValue
    .split(" ")
    .filter((term) => term.length >= 3 && !commonDescriptorWords.has(term));

  if (terms.length === 0) {
    return false;
  }

  return terms.every((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalizedText));
}

function normalizeRepeatedLine(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%&'. -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldCheckRepeatedLine(line: string): boolean {
  if (countWords(line) < 6 || line.length < 35 || line.length > 220) {
    return false;
  }

  if (isAddressLikeLine(line)) {
    return false;
  }

  return !/\b(?:quick links?|privacy|terms|copyright|all rights reserved|phone|email|contact us|home|about us|services|read more|facebook|twitter|youtube|linkedin|instagram)\b/i.test(line);
}

function shouldCheckRepeatedSentenceStart(start: string): boolean {
  return !/^(?:facebook|twitter|youtube|linkedin|instagram|com facebook|phone email|1203|address|quick links|privacy terms)\b/i.test(start);
}

function isAddressLikeLine(line: string): boolean {
  return /\b\d{1,6}\s+[a-z0-9.' -]{2,80}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|highway|hwy|parkway|pkwy|place|pl|circle|cir|terrace|ter|trail|trl|bend|bnd)\b/i.test(line);
}

function isPolicyLikePage(url: string, title: string): boolean {
  return /\b(?:privacy|terms|conditions|cookie|refund|return|shipping|cancellation)\b/i.test(`${url}\n${title}`);
}

function shouldFlagExternalDomain(domain: string, reviewedHost: string): boolean {
  if (!domain || !reviewedHost || hostsMatch(domain, reviewedHost)) {
    return false;
  }

  const ignoredHosts = [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "google.com",
    "gstatic.com",
    "schema.org",
    "w.org",
    "wordpress.org",
    "wordpress.com",
    "automattic.com",
    "gravatar.com"
  ];
  return !ignoredHosts.some((host) => domain === host || domain.endsWith(`.${host}`));
}

function extractVisibleDomains(text: string): string[] {
  const domains: string[] = [];
  const pattern = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const normalized = normalizeDomain(match[1]);
    if (normalized) {
      domains.push(normalized);
    }
  }
  return uniqueStrings(domains);
}

function normalizeDomain(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().replace(/^www\./, "").replace(/[),.;:]+$/g, "") ?? "";
  if (!normalized || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalized)) {
    return "";
  }
  const finalPart = normalized.split(".").at(-1) ?? "";
  return /[a-z]/i.test(finalPart) && finalPart.length >= 2 ? normalized : "";
}

function totalContactForms(evidence: ReviewEvidence): number {
  return evidence.pages.reduce((total, page) => total + (page.forms?.contactFormCount ?? 0), 0);
}

function excerptAround(text: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function categoryLevel(
  concerns: ReviewConcern[],
  category: ReviewCategoryAssessment["key"],
  extraLowConcernCount = 0
): AssessmentLevel {
  const categoryConcerns = concerns.filter((concern) => concernInCategory(concern, category));
  const high = categoryConcerns.filter((concern) => concern.severity === "high").length;
  const medium = categoryConcerns.filter((concern) => concern.severity === "medium").length;
  const low = categoryConcerns.filter((concern) => concern.severity === "low").length + extraLowConcernCount;

  if (high >= 2 || medium >= 4) {
    return "High risk";
  }
  if (high >= 1 || medium >= 2) {
    return "Moderate risk";
  }
  if (medium >= 1 || low >= 3) {
    return "Mild risk";
  }
  return "Low risk";
}

function concernInCategory(concern: ReviewConcern, category: ReviewCategoryAssessment["key"]): boolean {
  switch (category) {
    case "site_access":
      return ["page_load_status", "page_open_note", "page_limit_reached", "no_internal_page_links"].includes(concern.code);
    case "domain_infrastructure":
      return concern.code === "domain_date_after_business_history";
    case "website_quality":
      return ["broken_link", "weak_page_title", "duplicate_page_title", "thin_visible_text"].includes(concern.code);
    case "content_authenticity":
      return concern.area === "content_quality";
    case "business_identity":
      return concern.area === "business_identity";
    case "policy_compliance":
      return concern.area === "policy_pages";
    case "external_footprint":
      return concern.code.startsWith("social_link_") || concern.code === "social_label_without_profile_link";
    case "commercial_behavior":
      return concern.area === "commercial_behavior";
  }
}

function calculateRiskLevel(evidence: ReviewEvidence, concerns: ReviewConcern[]): AssessmentLevel {
  const score =
    concerns.reduce((total, concern) => {
      if (concern.severity === "high") {
        return total + 18;
      }
      if (concern.severity === "medium") {
        return total + 8;
      }
      return total + 2;
    }, 0) +
    (evidence.pages.length === 0 ? 20 : 0) +
    (evidence.siteIdentity?.matchLevel === "Unclear match" ? 10 : 0) +
    (evidence.domainRegistration?.status === "unavailable" ? 3 : 0);

  if (score >= 120) {
    return "Severe risk";
  }
  if (score >= 60) {
    return "High risk";
  }
  if (score >= 40) {
    return "Moderate risk";
  }
  if (score >= 20) {
    return "Mild risk";
  }
  return "Low risk";
}

function calculateConfidence(evidence: ReviewEvidence, signals: ReviewSignals, unknowns: string[]): ReviewSummary["confidence"] {
  const usefulPageCount = evidence.pages.filter((page) => (page.status === undefined || page.status < 400) && countWords(page.text) >= 40).length;
  if (usefulPageCount === 0) {
    return "Low";
  }

  const identityStrong = evidence.siteIdentity?.matchLevel === "Strong match";
  const domainDatesFound = evidence.domainRegistration?.status === "found";
  const enoughBusinessDetails = signals.emails.length + signals.phones.length + signals.addressLines.length > 0;
  if (usefulPageCount >= 3 && identityStrong && domainDatesFound && enoughBusinessDetails && unknowns.length <= 2) {
    return "High";
  }

  return "Medium";
}

function buildVerifiedFacts(
  evidence: ReviewEvidence,
  signals: ReviewSignals,
  commonPages: string[],
  contactFormsFound: number
): string[] {
  const homepage = evidence.pages[0];
  return uniqueStrings([
    `Reviewed ${evidence.pages.length} public page${evidence.pages.length === 1 ? "" : "s"} from ${evidence.input.websiteUrl}. Source: reviewed pages.`,
    homepage ? `Homepage final URL: ${homepage.finalUrl}. Source: browser review.` : undefined,
    evidence.domainRegistration?.creationDate
      ? `Domain creation date: ${evidence.domainRegistration.creationDate}. Source: public domain registration lookup.`
      : undefined,
    homepage?.lastModified ? `Homepage last modified: ${homepage.lastModified.value}. Source: ${homepage.lastModified.source}.` : undefined,
    signals.emails.length ? `Email addresses found: ${signals.emails.slice(0, 3).join(", ")}. Source: reviewed pages and links.` : undefined,
    signals.phones.length ? `Phone numbers found: ${signals.phones.slice(0, 3).join(", ")}. Source: reviewed pages and links.` : undefined,
    signals.addressLines.length ? `Address-like lines found: ${signals.addressLines.slice(0, 2).join(" | ")}. Source: reviewed pages.` : undefined,
    contactFormsFound ? `${contactFormsFound} contact form${contactFormsFound === 1 ? "" : "s"} found. Source: reviewed pages.` : undefined,
    commonPages.length ? `Common page references found: ${commonPages.join(", ")}. Source: reviewed pages and links.` : undefined,
    evidence.externalEvidence?.profileLinks.length
      ? `${evidence.externalEvidence.profileLinks.length} external profile link${
          evidence.externalEvidence.profileLinks.length === 1 ? "" : "s"
        } found on reviewed website pages. Source: reviewed links.`
      : undefined
  ]);
}

function buildPositiveIndicators(
  evidence: ReviewEvidence,
  signals: ReviewSignals,
  commonPages: string[],
  contactFormsFound: number
): string[] {
  return uniqueStrings([
    evidence.siteIdentity?.matchLevel === "Strong match" ? "Provided and observed business details form a strong match." : undefined,
    evidence.domainRegistration?.status === "found" ? "Public domain registration dates were available." : undefined,
    commonPages.includes("contact") ? "A Contact page was found as a reviewed or linked page." : undefined,
    commonPages.includes("privacy") ? "A Privacy Policy was found as a reviewed or linked page." : undefined,
    commonPages.includes("terms") ? "A Terms page was found as a reviewed or linked page." : undefined,
    signals.emails.length ? "At least one email address was found." : undefined,
    signals.phones.length ? "At least one phone number was found." : undefined,
    contactFormsFound > 0 ? "At least one contact form was found." : undefined,
    signals.socialLinks.length ? "At least one social profile link was found." : undefined,
    evidence.externalEvidence?.registryChecks.length ? "A state registry follow-up link was generated for the expected state." : undefined,
    evidence.externalEvidence?.searchLinks.length ? "Public search links were generated for manual external review." : undefined
  ]);
}

function priorityConcernMessages(concerns: ReviewConcern[]): string[] {
  const sorted = dedupeConcerns(concerns).sort(
    (left, right) =>
      severityRankValue(right.severity) - severityRankValue(left.severity) ||
      concernPriorityValue(right.code) - concernPriorityValue(left.code)
  );
  const selected: ReviewConcern[] = [];
  const areas = new Set<string>();

  for (const concern of sorted) {
    if (selected.length >= 5) {
      break;
    }
    if (areas.has(concern.area)) {
      continue;
    }
    selected.push(concern);
    areas.add(concern.area);
  }

  for (const concern of sorted) {
    if (selected.length >= 8) {
      break;
    }
    if (!selected.includes(concern)) {
      selected.push(concern);
    }
  }

  return selected.map(formatPriorityConcern);
}

function dedupeConcerns(concerns: ReviewConcern[]): ReviewConcern[] {
  const seen = new Set<string>();
  return concerns.filter((concern) => {
    const key = `${concern.code}|${concern.evidence ?? ""}|${concern.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatPriorityConcern(concern: ReviewConcern): string {
  return `${concern.label ? `${concern.label}: ` : ""}${concern.message}${concern.evidence ? ` Evidence: ${concern.evidence}` : ""}`;
}

function concernPriorityValue(code: string): number {
  const priority = new Map<string, number>([
    ["multiple_content_authenticity_markers", 12],
    ["dummy_or_irrelevant_commerce_content", 11],
    ["stale_job_or_deadline_date", 10],
    ["contact_email_lookalike_domain", 9],
    ["third_party_service_reference", 8],
    ["unsupported_marketing_claims", 8],
    ["placeholder_lorem_ipsum", 7],
    ["placeholder_zero_metrics", 7],
    ["social_label_without_profile_link", 5],
    ["only_hr_contact_email", 4]
  ]);
  return priority.get(code) ?? 0;
}

function severityRankValue(severity: ReviewConcern["severity"]): number {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function businessManualFollowUps(evidence: ReviewEvidence): string[] {
  const items: string[] = [];
  if (evidence.input.expectedState && evidence.input.companyName) {
    items.push(`Manual follow-up recommended: search ${evidence.input.expectedState} business registration records for "${evidence.input.companyName}".`);
  }
  if (evidence.input.claimedIndustry && regulatedIndustryPattern.test(evidence.input.claimedIndustry)) {
    items.push("Manual follow-up recommended: check licensing or professional registration for the provided industry if it applies.");
  }
  if (evidence.input.additionalIdentifiers) {
    items.push("Manual follow-up recommended: compare the provided identifiers against business records, profiles, invoices, or other trusted references.");
  }
  return items;
}

function contentConcernSummary(concerns: ReviewConcern[]): string {
  const contentConcerns = concerns.filter((concern) => concernInCategory(concern, "content_authenticity"));
  if (contentConcerns.length === 0) {
    return "No placeholder, generic, repetitive, or common-misspelling concerns were found by the built-in checks.";
  }
  return `${contentConcerns.length} content-authenticity item${contentConcerns.length === 1 ? "" : "s"} found by the built-in checks.`;
}

function commercialConcernSummary(concerns: ReviewConcern[]): string {
  const commercialConcerns = concerns.filter((concern) => concernInCategory(concern, "commercial_behavior"));
  if (commercialConcerns.length === 0) {
    return "No payment wording that matched the built-in manual-review patterns was found.";
  }
  return `${commercialConcerns.length} payment wording item${commercialConcerns.length === 1 ? "" : "s"} needs manual review.`;
}

function textContainsMeaningfulTerms(text: string, value: string): boolean {
  const normalizedText = text.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }
  if (normalizedText.includes(normalizedValue)) {
    return true;
  }

  const terms = normalizedValue
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !commonDescriptorWords.has(term));

  return terms.length > 0 && terms.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text));
}

function splitIdentifiers(value: string | undefined): string[] {
  return uniqueStrings((value ?? "").split(/[,;\n]+/).map((item) => item.trim())).slice(0, 10);
}

function yearFromDate(value: string | undefined): number | undefined {
  const match = value?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function readableHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractBusinessHistoryYears(text: string): number[] {
  const years = new Set<number>();
  const patterns = [
    /\b(?:since|founded|established|est\.?|serving since|in business since)\s*(?:in\s*)?((?:19|20)\d{2})\b/gi,
    /\b(?:founded|established)\s+in\s+((?:19|20)\d{2})\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      years.add(Number(match[1]));
    }
  }

  return [...years].filter((year) => Number.isInteger(year));
}

const commonDescriptorWords = new Set(["and", "the", "for", "with", "services", "service", "company", "business", "solutions"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
