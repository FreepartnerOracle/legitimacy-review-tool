import test from "node:test";
import assert from "node:assert/strict";
import { buildExternalEvidence, registryConnectorForState, supportedRegistryStates } from "./externalEvidence.js";
import type { ReviewEvidence } from "./types.js";

test("builds a Texas registry checklist and public search links", () => {
  const evidence = makeEvidence({
    input: {
      websiteUrl: "https://globaltechnoit.com",
      companyName: "Global Techno IT",
      expectedState: "Texas",
      claimedLocation: "Tyler, TX"
    }
  });

  const external = buildExternalEvidence(evidence);
  const registry = external.registryChecks[0];

  assert.equal(external.registryChecks.length, 1);
  assert.ok(registry);
  assert.equal(registry.state, "Texas");
  assert.match(registry.searchUrl, /comptroller\.texas\.gov/);
  assert.ok(external.searchLinks.some((link) => link.category === "complaints"));
  assert.ok(external.searchLinks.every((link) => link.confidenceLabel === "Manual follow-up recommended"));
});

test("recognizes supported state registry connectors", () => {
  assert.equal(registryConnectorForState("DE")?.state, "Delaware");
  assert.equal(registryConnectorForState("California")?.stateCode, "CA");
  assert.equal(registryConnectorForState("New Jersey")?.stateCode, "NJ");
  assert.equal(registryConnectorForState("Virginia")?.stateCode, "VA");
  assert.ok(supportedRegistryStates().some((state) => state.includes("North Carolina")));
});

test("adds RDAP as public external evidence when domain registration is found", () => {
  const evidence = makeEvidence();
  evidence.domainRegistration = {
    domain: "example.com",
    lookupUrl: "https://rdap.org/domain/example.com",
    checkedAt: "2026-05-13T00:00:00.000Z",
    status: "found",
    creationDate: "1995-08-14T04:00:00Z",
    lastChangedDate: "2024-01-01T00:00:00Z",
    registrar: "Example Registrar",
    nameServers: []
  };

  const external = buildExternalEvidence(evidence);
  const domainItem = external.items.find((item) => item.title === "Domain registration data");

  assert.equal(domainItem?.label, "Found in public external source");
  assert.match(domainItem?.detail ?? "", /created 1995/);
});

test("records website-discovered external profile links", () => {
  const evidence = makeEvidence({
    links: [
      {
        text: "LinkedIn",
        href: "https://www.linkedin.com/company/example",
        url: "https://www.linkedin.com/company/example",
        internal: false,
        status: 200
      }
    ]
  });

  const external = buildExternalEvidence(evidence);
  const profile = external.profileLinks[0];

  assert.equal(external.profileLinks.length, 1);
  assert.ok(profile);
  assert.equal(profile.platform, "LinkedIn");
  assert.equal(profile.label, "Verified from reviewed website");
});

function makeEvidence(overrides: Partial<ReviewEvidence["pages"][number]> & { input?: ReviewEvidence["input"] } = {}): ReviewEvidence {
  return {
    startedAt: "2026-05-13T00:00:00.000Z",
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
        text: "Example website text.",
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
