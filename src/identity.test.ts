import test from "node:test";
import assert from "node:assert/strict";
import { buildSiteIdentityReview } from "./identity.js";
import { extractReviewSignals } from "./signals.js";
import type { ReviewEvidence } from "./types.js";

test("builds a strong match when provided details and website-domain email are present", () => {
  const evidence = makeEvidence({
    input: {
      websiteUrl: "https://example.com",
      companyName: "Example Consulting",
      claimedLocation: "Austin, Texas"
    },
    text: "Example Consulting serves Austin, Texas. Contact hello@example.com. Copyright 2026 Example Consulting LLC.",
    siteAvailability: [{ url: "https://example.com/", ok: true, status: 200, finalUrl: "https://example.com/" }]
  });
  evidence.signals = extractReviewSignals(evidence);

  const identity = buildSiteIdentityReview(evidence, []);

  assert.equal(identity.matchLevel, "Strong match");
  assert.equal(identity.likelyOfficialSite, "Provided URL");
  assert.equal(identity.found.companyNameInText, true);
  assert.equal(identity.found.claimedLocationInText, true);
  assert.deepEqual(identity.found.emailDomains, ["example.com"]);
});

test("notes related domains when another domain appears in text or email", () => {
  const evidence = makeEvidence({
    input: {
      websiteUrl: "https://techrobots.com",
      companyName: "TechRobots Inc"
    },
    text: "Training details are available at techrobots.in. Contact info@techrobots.in.",
    siteAvailability: [{ url: "https://techrobots.com/", ok: false, note: "Could not open entry point" }]
  });
  evidence.signals = extractReviewSignals(evidence);

  const identity = buildSiteIdentityReview(evidence, []);

  assert.equal(identity.matchLevel, "Unclear match");
  assert.equal(identity.likelyOfficialSite, "Related domain seen");
  assert.ok(identity.relatedDomains.some((record) => record.domain === "techrobots.in"));
  assert.ok(identity.manualFollowUps.some((item) => item.includes("related domains")));
});

function makeEvidence(
  overrides: Partial<ReviewEvidence["pages"][number]> & {
    input?: ReviewEvidence["input"];
    siteAvailability?: ReviewEvidence["siteAvailability"];
  } = {}
): ReviewEvidence {
  return {
    startedAt: "2026-05-13T00:00:00.000Z",
    input: overrides.input ?? { websiteUrl: "https://example.com" },
    limits: {
      maxDepth: 2,
      maxPages: 25
    },
    pages: [
      {
        requestedUrl: overrides.input?.websiteUrl ?? "https://example.com",
        finalUrl: overrides.input?.websiteUrl ?? "https://example.com",
        title: "Example",
        status: 200,
        text: "Example public website.",
        links: [],
        screenshotPath: "screenshots/example.png",
        depth: 0,
        ...withoutInput(overrides)
      }
    ],
    siteAvailability: overrides.siteAvailability
  };
}

function withoutInput(
  value: Partial<ReviewEvidence["pages"][number]> & {
    input?: ReviewEvidence["input"];
    siteAvailability?: ReviewEvidence["siteAvailability"];
  }
): Partial<ReviewEvidence["pages"][number]> {
  const copy: Partial<ReviewEvidence["pages"][number]> & {
    input?: ReviewEvidence["input"];
    siteAvailability?: ReviewEvidence["siteAvailability"];
  } = { ...value };
  delete copy.input;
  delete copy.siteAvailability;
  return copy;
}
