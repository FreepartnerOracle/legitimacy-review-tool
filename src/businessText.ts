export function normalizedHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function hostsMatch(left: string, right: string): boolean {
  const normalizedLeft = left.replace(/^www\./, "").toLowerCase();
  const normalizedRight = right.replace(/^www\./, "").toLowerCase();
  return normalizedLeft === normalizedRight || normalizedLeft.endsWith(`.${normalizedRight}`);
}

export function extractCopyrightNames(text: string): string[] {
  const names: string[] = [];
  const pattern = /\b(?:copyright|\(c\))\s*(?:\d{4}(?:\s*-\s*\d{4})?\s*)?([A-Z][A-Za-z0-9&.,' -]{2,70})/gi;

  for (const match of text.matchAll(pattern)) {
    const name = match[1]
      .replace(/\ball rights reserved\b.*$/i, "")
      .replace(/\bprivacy\b.*$/i, "")
      .replace(/\bterms\b.*$/i, "")
      .trim();

    if (name) {
      names.push(name);
    }
  }

  return names;
}

export function normalizeBusinessName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:llc|inc|ltd|co|corp|corporation|company|limited)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}
