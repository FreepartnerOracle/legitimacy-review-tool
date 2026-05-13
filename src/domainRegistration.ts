import { throwIfCancelled } from "./cancel.js";
import type { DomainRegistrationEvidence } from "./types.js";

type RdapEvent = {
  eventAction?: unknown;
  eventDate?: unknown;
};

type RdapEntity = {
  roles?: unknown;
  vcardArray?: unknown;
};

type RdapResponse = {
  events?: unknown;
  entities?: unknown;
  nameservers?: unknown;
};

const lookupTimeoutMs = 6_000;

export async function lookupDomainRegistrationDates(
  websiteUrl: string,
  signal?: AbortSignal
): Promise<DomainRegistrationEvidence> {
  const checkedAt = new Date().toISOString();
  const candidates = domainCandidates(websiteUrl);
  const fallbackDomain = candidates[0] ?? "";

  if (!fallbackDomain) {
    return {
      domain: "",
      checkedAt,
      status: "unavailable",
      nameServers: [],
      note: "Could not determine a domain name for the registration-date lookup."
    };
  }

  for (const domain of candidates) {
    const lookupUrl = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
    const result = await readRdapDomain(domain, lookupUrl, checkedAt, signal);

    if (result.status === "found" || result.status === "unavailable") {
      return result;
    }
  }

  return {
    domain: fallbackDomain,
    lookupUrl: `https://rdap.org/domain/${encodeURIComponent(fallbackDomain)}`,
    checkedAt,
    status: "not_found",
    nameServers: [],
    note: "No public registration-date record was returned for the reviewed domain."
  };
}

async function readRdapDomain(
  domain: string,
  lookupUrl: string,
  checkedAt: string,
  signal?: AbortSignal
): Promise<DomainRegistrationEvidence> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), lookupTimeoutMs);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    throwIfCancelled(signal);
    const response = await fetch(lookupUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/rdap+json, application/json;q=0.9"
      }
    });

    if (response.status === 404) {
      return {
        domain,
        lookupUrl,
        checkedAt,
        status: "not_found",
        nameServers: []
      };
    }

    if (response.status >= 400) {
      return {
        domain,
        lookupUrl,
        checkedAt,
        status: "unavailable",
        nameServers: [],
        note: `Registration-date lookup returned HTTP ${response.status}.`
      };
    }

    const body = (await response.json()) as RdapResponse;
    return {
      domain,
      lookupUrl,
      checkedAt,
      status: "found",
      creationDate: eventDate(body, ["registration"]),
      lastChangedDate: eventDate(body, ["last changed", "last update", "last modified", "updated"]),
      expirationDate: eventDate(body, ["expiration", "expiry"]),
      registrar: registrarName(body),
      nameServers: nameServers(body)
    };
  } catch (error) {
    throwIfCancelled(signal);
    return {
      domain,
      lookupUrl,
      checkedAt,
      status: "unavailable",
      nameServers: [],
      note: `Could not read public registration dates: ${readableError(error)}`
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

function domainCandidates(websiteUrl: string): string[] {
  try {
    const hostname = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "");
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length < 2 || labels.some((label) => !/^[a-z0-9-]+$/i.test(label))) {
      return [];
    }

    return labels
      .map((_, index) => labels.slice(index).join("."))
      .filter((domain) => domain.includes("."))
      .slice(0, 4);
  } catch {
    return [];
  }
}

function eventDate(body: RdapResponse, actions: string[]): string | undefined {
  const event = rdapEvents(body).find((item) => {
    const action = stringValue(item.eventAction).toLowerCase();
    return actions.some((expected) => action.includes(expected));
  });
  return stringValue(event?.eventDate);
}

function rdapEvents(body: RdapResponse): RdapEvent[] {
  if (!Array.isArray(body.events)) {
    return [];
  }

  return body.events.filter(isRecord).map((event) => ({
    eventAction: event.eventAction,
    eventDate: event.eventDate
  }));
}

function registrarName(body: RdapResponse): string | undefined {
  const registrar = rdapEntities(body).find((entity) =>
    arrayValue(entity.roles).some((role) => stringValue(role).toLowerCase() === "registrar")
  );
  return registrar ? vcardName(registrar.vcardArray) : undefined;
}

function rdapEntities(body: RdapResponse): RdapEntity[] {
  if (!Array.isArray(body.entities)) {
    return [];
  }

  return body.entities.filter(isRecord).map((entity) => ({
    roles: entity.roles,
    vcardArray: entity.vcardArray
  }));
}

function vcardName(value: unknown): string | undefined {
  if (!Array.isArray(value) || !Array.isArray(value[1])) {
    return undefined;
  }

  for (const entry of value[1]) {
    if (!Array.isArray(entry) || entry[0] !== "fn") {
      continue;
    }

    const name = stringValue(entry[3]).trim();
    if (name) {
      return name;
    }
  }

  return undefined;
}

function nameServers(body: RdapResponse): string[] {
  if (!Array.isArray(body.nameservers)) {
    return [];
  }

  return [
    ...new Set(
      body.nameservers
        .filter(isRecord)
        .map((item) => stringValue(item.ldhName ?? item.unicodeName).toLowerCase())
        .filter(Boolean)
    )
  ].slice(0, 12);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
