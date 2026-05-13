import test from "node:test";
import assert from "node:assert/strict";
import { runQualityChecks, summarizeReview } from "./checks.js";
import { extractReviewSignals } from "./signals.js";
import type { ReviewEvidence } from "./types.js";

test("finds broken links", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [
        {
          text: "Missing page",
          href: "/missing",
          url: "https://example.com/missing",
          internal: true,
          status: 404
        }
      ]
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "broken_link"));
});

test("finds placeholder wording", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Welcome to Your Company. TODO: replace this sample text. Address Line 1"
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "placeholder_todo"));
  assert.ok(concerns.some((concern) => concern.code === "placeholder_sample_text"));
  assert.ok(concerns.some((concern) => concern.code === "placeholder_your_company"));
  assert.ok(concerns.some((concern) => concern.code === "placeholder_address_line"));
});

test("finds common misspellings", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Our proffesional servcie team can recieve your request at this adress."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "common_misspelling"));
  assert.ok(concerns.some((concern) => concern.evidence?.includes("proffesional -> professional")));
  assert.ok(concerns.some((concern) => concern.evidence?.includes("servcie -> service")));
  assert.ok(concerns.some((concern) => concern.evidence?.includes("recieve -> receive")));
  assert.ok(concerns.some((concern) => concern.evidence?.includes("adress -> address")));
});

test("finds missing contact and policy pages", () => {
  const concerns = runQualityChecks(makeEvidence());
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("missing_contact_page"));
  assert.ok(codes.includes("missing_privacy_page"));
  assert.ok(codes.includes("missing_terms_page"));
});

test("does not mark common pages missing when links are present", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [
        { text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 },
        { text: "Privacy", href: "/privacy", url: "https://example.com/privacy", internal: true, status: 200 },
        { text: "Terms", href: "/terms", url: "https://example.com/terms", internal: true, status: 200 }
      ]
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.equal(codes.includes("missing_contact_page"), false);
  assert.equal(codes.includes("missing_privacy_page"), false);
  assert.equal(codes.includes("missing_terms_page"), false);
});

test("notes when provided identity text is not seen", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      input: {
        websiteUrl: "https://example.com",
        companyName: "Example Inc",
        claimedLocation: "Austin, Texas"
      }
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("company_name_not_seen"));
  assert.ok(codes.includes("claimed_location_not_seen"));
});

test("accepts claimed location when punctuation differs", () => {
  const evidence = makeEvidence({
    input: {
      websiteUrl: "https://example.com",
      claimedLocation: "Addison, TX"
    },
    text: "Visit us at 15305 Dallas Parkway Suite 300 Addison TX 75001.",
    links: [
      { text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 },
      { text: "Privacy", href: "/privacy", url: "https://example.com/privacy", internal: true, status: 200 },
      { text: "Terms", href: "/terms", url: "https://example.com/terms", internal: true, status: 200 }
    ]
  });
  evidence.signals = extractReviewSignals(evidence);
  const concerns = runQualityChecks(evidence);
  const summary = summarizeReview(evidence, concerns);

  assert.equal(concerns.some((concern) => concern.code === "claimed_location_not_seen"), false);
  assert.ok(summary.positiveNotes.includes("The provided location appeared in the reviewed page text."));
});

test("summarizes concern level", () => {
  const evidence = makeEvidence({
    text: "lorem ipsum TODO sample text"
  });
  const concerns = runQualityChecks(evidence);
  const summary = summarizeReview(evidence, concerns);

  assert.match(summary.concernLevel, /concern$/);
  assert.match(summary.riskLevel, /risk$/);
  assert.equal(summary.confidence, "Low");
  assert.ok(summary.categoryAssessments.length > 0);
  assert.ok(summary.verifiedFacts.length > 0);
  assert.ok(summary.decisionBrief.headline.includes("example.com"));
  assert.ok(summary.decisionBrief.recommendation.length > 0);
  assert.ok(summary.decisionBrief.topFindings.length > 0);
  assert.ok(summary.decisionBrief.nextSteps.length > 0);
});

test("finds missing visible contact details", () => {
  const concerns = runQualityChecks(makeEvidence());
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("email_not_seen"));
  assert.ok(codes.includes("phone_not_seen"));
});

test("recognizes visible contact details", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Contact us at hello@example.com or 555-123-4567.",
      links: [
        { text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 },
        { text: "About", href: "/about", url: "https://example.com/about", internal: true, status: 200 },
        { text: "Privacy", href: "/privacy", url: "https://example.com/privacy", internal: true, status: 200 },
        { text: "Terms", href: "/terms", url: "https://example.com/terms", internal: true, status: 200 }
      ]
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.equal(codes.includes("email_not_seen"), false);
  assert.equal(codes.includes("phone_not_seen"), false);
});

test("finds thin text and weak titles", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      title: "Home",
      text: "Short text."
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("weak_page_title"));
  assert.ok(codes.includes("thin_visible_text"));
});

test("extracts common page presence details", () => {
  const evidence = makeEvidence({
    text: "Visit our Services page and FAQ.",
    links: [
      { text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 },
      { text: "Services", href: "/services", url: "https://example.com/services", internal: true, status: 200 },
      { text: "FAQ", href: "/faq", url: "https://example.com/faq", internal: true, status: 200 }
    ]
  });
  const signals = extractReviewSignals(evidence);

  assert.equal(signals.pagePresence.contact, true);
  assert.equal(signals.pagePresence.services, true);
  assert.equal(signals.pagePresence.faq, true);
  assert.ok(signals.pagePresenceDetails.contact.sources.includes("linked"));
});

test("extracts address suffixes and normalizes duplicate phone formats", () => {
  const evidence = makeEvidence({
    text: "Visit 1203 Cambridge Bend, Tyler, TX, 75703, USA. Call +1 520 666 6327 or 15206666327."
  });
  const signals = extractReviewSignals(evidence);

  assert.ok(signals.addressLines.some((line) => line.includes("1203 Cambridge Bend")));
  assert.deepEqual(signals.phones, ["+15206666327"]);
});

test("handles saved evidence with incomplete extracted details", () => {
  const evidence = makeEvidence({
    details: { emails: ["hello@example.com"] } as ReviewEvidence["pages"][number]["details"]
  });
  const signals = extractReviewSignals(evidence);

  assert.deepEqual(signals.emails, ["hello@example.com"]);
  assert.deepEqual(signals.phones, []);
  assert.deepEqual(signals.addressLines, []);
  assert.deepEqual(signals.socialLinks, []);
});

test("does not count plain text mentions as linked expected pages", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Contact us after reviewing our Privacy Policy and Terms."
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("missing_contact_page"));
  assert.ok(codes.includes("missing_privacy_page"));
  assert.ok(codes.includes("missing_terms_page"));
});

test("raises concern level when business details are sparse", () => {
  const evidence = makeEvidence({
    text: "A public example website with general services."
  });
  const concerns = runQualityChecks(evidence);
  const summary = summarizeReview(evidence, concerns);
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("business_details_sparse"));
  assert.ok(codes.includes("policy_pages_missing"));
  assert.equal(summary.concernLevel, "High concern");
});

test("finds heavy generic wording", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Our dedicated team provides tailored solutions, innovative solutions, and a commitment to excellence."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "generic_wording_heavy"));
});

test("finds social links that do not point to external profile domains", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [
        { text: "Facebook", href: "/facebook", url: "https://example.com/facebook", internal: true, status: 200 },
        { text: "LinkedIn", href: "#", internal: false }
      ]
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("social_link_not_external_profile"));
  assert.ok(codes.includes("social_link_not_page"));
});

test("groups social labels without matching external profile links", () => {
  const evidence = makeEvidence({ text: "Facebook-f Twitter Youtube" });
  evidence.pages.push({
    requestedUrl: "https://example.com/about",
    finalUrl: "https://example.com/about",
    title: "About",
    status: 200,
    text: "Facebook-f Twitter Youtube",
    links: [],
    screenshotPath: "screenshots/about.png",
    depth: 1
  });

  const concerns = runQualityChecks(evidence).filter((concern) => concern.code === "social_label_without_profile_link");

  assert.equal(concerns.length, 1);
  assert.ok(concerns[0].evidence?.includes("2 pages"));
});

test("accepts social links that point to matching external profile domains", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [
        {
          text: "Facebook",
          href: "https://facebook.com/example",
          url: "https://facebook.com/example",
          internal: false,
          status: 200
        }
      ]
    })
  );

  assert.equal(concerns.some((concern) => concern.code === "social_link_not_external_profile"), false);
  assert.equal(concerns.some((concern) => concern.code === "social_link_status"), false);
});

test("notes social links with unavailable status", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [
        {
          text: "Instagram",
          href: "https://instagram.com/example",
          url: "https://instagram.com/example",
          internal: false,
          status: 404
        }
      ]
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "social_link_status"));
});

test("finds template-like writing patterns", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "In today's fast-paced world, our team can help. We pride ourselves on a seamless experience."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "template_like_writing"));
});

test("finds placeholder-style zero metrics", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "PROJECT DONE 0 K YEARS EXPERIENCE 0 K AWARD WINNING 0 HAPPY CLIENTS 0 K"
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "placeholder_zero_metrics"));
});

test("finds repeated visible content blocks across pages", () => {
  const repeated = "All software and IT majors benefit from our core solutions across verticals.";
  const evidence = makeEvidence({
    text: `${repeated}\nFirst page specific text for the review.`
  });
  evidence.pages.push({
    requestedUrl: "https://example.com/services",
    finalUrl: "https://example.com/services",
    title: "Services",
    status: 200,
    text: `${repeated}\nSecond page specific text for the review.`,
    links: [],
    screenshotPath: "screenshots/services.png",
    depth: 1
  });

  const concerns = runQualityChecks(evidence);

  assert.ok(concerns.some((concern) => concern.code === "repeated_content_blocks"));
});

test("does not flag repeated footer address blocks as content reuse", () => {
  const address = "1203 Cambridge Bend Tyler TX 75703 USA";
  const evidence = makeEvidence({ text: `${address}\nFirst page specific text for the review.` });
  evidence.pages.push({
    requestedUrl: "https://example.com/about",
    finalUrl: "https://example.com/about",
    title: "About",
    status: 200,
    text: `${address}\nSecond page specific text for the review.`,
    links: [],
    screenshotPath: "screenshots/about.png",
    depth: 1
  });

  const concerns = runQualityChecks(evidence);

  assert.equal(concerns.some((concern) => concern.code === "repeated_content_blocks"), false);
});

test("finds stale job or deadline dates", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Senior Developer Apply until 05.22.2020. Lorem ipsum dolor sit amet."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "stale_job_or_deadline_date"));
});

test("finds dummy commerce content on a service-business site", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      title: "Paper Weight - Example IT Consulting",
      text: "Example IT consulting services. Add to cart Paper Weight $10.00 Related products Modern Air Purifier Visiting Card Garden Bench."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "dummy_or_irrelevant_commerce_content"));
});

test("finds third-party provider references on service-like pages", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Our smart proxy service helps developers. Start by signing up at crawlbase.com.",
      links: [{ text: "signing up", href: "https://crawlbase.com/signup", url: "https://crawlbase.com/signup", internal: false, status: 200 }]
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "third_party_service_reference"));
});

test("raises high risk for globaltechnoit-like generic claim patterns", () => {
  const evidence = makeEvidence({
    input: {
      websiteUrl: "https://globaltechnoit.com",
      companyName: "Global Techno IT",
      claimedLocation: "Addison, TX",
      expectedState: "Texas",
      claimedIndustry: "IT consulting"
    },
    text: [
      "Global Techno IT is the best service company in world and stays ahead of competitors.",
      "In today's digital landscape, we pride ourselves on tailored solutions and innovative solutions.",
      "Lorem ipsum dolor sit amet.",
      "99.9% client satisfaction and services available across globe.",
      "Facebook-f Twitter Youtube",
      "15305 Dallas Parkway Suite 300 Addison TX 75001",
      "Contact +1 (520) 580-8649 or contact@globaltechnoit.com."
    ].join("\n"),
    links: [
      { text: "About", href: "/about", url: "https://globaltechnoit.com/about", internal: true, status: 200 },
      { text: "Contact", href: "/contact", url: "https://globaltechnoit.com/contact", internal: true, status: 200 }
    ]
  });
  evidence.signals = extractReviewSignals(evidence);

  const concerns = runQualityChecks(evidence);
  const summary = summarizeReview(evidence, concerns);
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("missing_privacy_page"));
  assert.ok(codes.includes("missing_terms_page"));
  assert.ok(codes.includes("policy_pages_missing"));
  assert.ok(codes.includes("unsupported_marketing_claims"));
  assert.ok(codes.includes("social_label_without_profile_link"));
  assert.ok(codes.includes("phone_area_code_location_mismatch"));
  assert.equal(codes.includes("claimed_location_not_seen"), false);
  assert.ok(summary.decisionBrief.topFindings.some((finding) => finding.includes("Marketing claims")));
  assert.equal(summary.riskLevel, "High risk");
});

test("finds repeated sentence starts", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text:
        "Our team provides careful support for every client. Our team provides useful guidance for every project. Our team provides clear updates for every account."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "repeated_sentence_starts"));
});

test("notes when configured page limit is reached", () => {
  const evidence = makeEvidence();
  evidence.limits.maxPages = 1;
  const concerns = runQualityChecks(evidence);

  assert.ok(concerns.some((concern) => concern.code === "page_limit_reached"));
});

test("notes contact email domains that need review", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Email hello@gmail.com or support@vendor.example.",
      input: { websiteUrl: "https://example.com" }
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("contact_email_common_provider"));
  assert.ok(codes.includes("contact_email_domain_mismatch"));
});

test("finds contact email domains that closely resemble the reviewed website domain", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Email info@globatechnoit.com for support.",
      input: { websiteUrl: "https://globaltechnoit.com" }
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("contact_email_lookalike_domain"));
  assert.equal(codes.includes("contact_email_domain_mismatch"), false);
});

test("notes when HR is the only email found", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Email HR@globaltechnoit.com for all contact.",
      input: { websiteUrl: "https://globaltechnoit.com" }
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "only_hr_contact_email"));
});

test("accepts contact email on the reviewed website domain", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Email hello@example.com.",
      input: { websiteUrl: "https://example.com" }
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.equal(codes.includes("contact_email_common_provider"), false);
  assert.equal(codes.includes("contact_email_domain_mismatch"), false);
});

test("finds a different business name in copyright-style text", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Copyright 2026 Different Company LLC. All rights reserved.",
      input: { websiteUrl: "https://example.com", companyName: "Example Company LLC" }
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "different_business_name_seen"));
});

test("notes contact pages without a visible contact method", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [{ text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 }]
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "contact_page_no_contact_method"));
});

test("accepts contact form as a visible contact method", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      links: [{ text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 }],
      forms: {
        formCount: 1,
        contactFormCount: 1,
        fieldLabels: ["name", "email", "message"]
      }
    })
  );

  assert.equal(concerns.some((concern) => concern.code === "contact_page_no_contact_method"), false);
});

test("notes multiple contact email domains", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Email hello@example.com or support@example.org."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "multiple_contact_email_domains"));
});

test("notes when the expected registration state is not seen", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      input: { websiteUrl: "https://example.com", expectedState: "Texas" },
      text: "Example Consulting serves clients nationwide."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "expected_state_not_seen"));
});

test("accepts expected registration state abbreviations in reviewed text", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      input: { websiteUrl: "https://example.com", expectedState: "Texas" },
      text: "Example Consulting is based in Austin, TX."
    })
  );

  assert.equal(concerns.some((concern) => concern.code === "expected_state_not_seen"), false);
});

test("compares public domain dates with business-history wording", () => {
  const evidence = makeEvidence({
    text: "Example Consulting was founded in 2012 and serves clients with careful project guidance."
  });
  evidence.domainRegistration = {
    domain: "example.com",
    checkedAt: "2026-05-13T00:00:00.000Z",
    status: "found",
    creationDate: "2022-04-10T00:00:00Z",
    nameServers: []
  };

  const concerns = runQualityChecks(evidence);

  assert.ok(concerns.some((concern) => concern.code === "domain_date_after_business_history"));
});

test("checks claimed industry and additional identifiers", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      input: {
        websiteUrl: "https://example.com",
        claimedIndustry: "medical billing",
        additionalIdentifiers: "License ABC123, support@example.com"
      },
      text: "Example Consulting provides general operations support. Contact support@example.com."
    })
  );
  const codes = concerns.map((concern) => concern.code);

  assert.ok(codes.includes("claimed_industry_not_seen"));
  assert.ok(codes.includes("regulated_industry_manual_follow_up"));
  assert.ok(codes.includes("provided_identifier_not_seen"));
});

test("finds payment wording that deserves manual review", () => {
  const concerns = runQualityChecks(
    makeEvidence({
      text: "Invoices may require wire transfer or cryptocurrency payment before onboarding."
    })
  );

  assert.ok(concerns.some((concern) => concern.code === "payment_wording_manual_review"));
});

test("adds a rule-based final assessment to the summary", () => {
  const evidence = makeEvidence({
    text:
      "Example Consulting provides implementation support, training, and careful project guidance for clients across Austin, Texas. Contact hello@example.com or 555-123-4567.",
    links: [
      { text: "Contact", href: "/contact", url: "https://example.com/contact", internal: true, status: 200 },
      { text: "Privacy", href: "/privacy", url: "https://example.com/privacy", internal: true, status: 200 },
      { text: "Terms", href: "/terms", url: "https://example.com/terms", internal: true, status: 200 }
    ],
    forms: {
      formCount: 1,
      contactFormCount: 1,
      fieldLabels: ["name", "email", "message"]
    },
    input: {
      websiteUrl: "https://example.com",
      companyName: "Example Consulting",
      claimedLocation: "Austin, Texas"
    }
  });
  evidence.signals = extractReviewSignals(evidence);
  const concerns = runQualityChecks(evidence);
  const summary = summarizeReview(evidence, concerns);

  assert.match(summary.finalAssessment.label, /Looks complete|Needs manual follow-up|Insufficient website evidence/);
  assert.equal(summary.snapshot.contactFormsFound, 1);
  assert.equal(summary.likelyOfficialWebsite, "Unclear");
  assert.ok(summary.manualFollowUps.some((item) => item.includes("independent public references")));
});

function makeEvidence(overrides: Partial<ReviewEvidence["pages"][number]> & { input?: ReviewEvidence["input"] } = {}): ReviewEvidence {
  return {
    startedAt: "2026-05-12T00:00:00.000Z",
    input: overrides.input ?? { websiteUrl: "https://example.com" },
    limits: {
      maxDepth: 2,
      maxPages: 25
    },
    pages: [
      {
        requestedUrl: "https://example.com",
        finalUrl: "https://example.com",
        title: "Example",
        status: 200,
        text: "A public example website.",
        links: [],
        screenshotPath: "screenshots/example.png",
        depth: 0,
        ...withoutInput(overrides)
      }
    ]
  };
}

function withoutInput(
  value: Partial<ReviewEvidence["pages"][number]> & { input?: ReviewEvidence["input"] }
): Partial<ReviewEvidence["pages"][number]> {
  const copy: Partial<ReviewEvidence["pages"][number]> & { input?: ReviewEvidence["input"] } = { ...value };
  delete copy.input;
  return copy;
}
