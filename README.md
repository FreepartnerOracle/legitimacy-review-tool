# Business Website Review

Business Website Review is a Windows-friendly desktop app for reviewing public business websites and producing an evidence folder you can keep, share, or revisit later.

The app visits public pages like a normal browser, follows internal links within a small limit, captures full-page screenshots, records visible page evidence, checks common quality and business-detail signals, and saves the results locally.

It is designed for neutral, evidence-based review. Items that cannot be confirmed from the local run are labeled for manual follow-up instead of being treated as proven findings.

Publisher label: **Freepartner Digital**.

## Quick Start

Use the GitHub-built Windows release. This avoids running npm on your computer.

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Choose **Build Windows EXE**.
4. Click **Run workflow**.
5. Open the completed run.
6. Download the artifact named `business-website-review-windows`.
7. Unzip it.
8. Double-click `business-website-review.exe`.

Keep the unzipped files together. The app expects these items to stay in the same release folder:

- `business-website-review.exe`
- `business-website-review-icon.svg`
- `ms-playwright/`
- `node_modules/`
- `README-FIRST.txt`

## Running A Review

Open the app and enter:

- Website URL
- Company name, if known
- Claimed location, if known
- Expected registration state, if known
- Claimed industry or service, if useful
- Additional identifiers, such as license, phone, or email, if available
- Output folder
- Page limit
- Internal link depth

The GUI presents:

- App readiness checks
- Review progress
- A decision brief with recommendation, top findings, and next steps
- A review snapshot
- A final assessment
- A visible conclusion with review outcome, confidence, and likely official website
- Verified facts, positive indicators, concerns, and unknown or unverified items
- A site identity summary
- Domain and page date details
- External evidence with source links and confidence labels
- Category-by-category assessment
- Filterable concerns by category and severity
- Direct screenshot links for reviewed pages
- Report links and saved-folder access

Click **Start Review**. Progress appears on the right side of the page.

Use the **Exit** button when you are done. Closing the browser window also tells the local app to shut down.

## Output

By default, review folders are saved under:

```text
Documents\Business Website Review Reports
```

Each review folder contains:

- `report.html`
- `report.md`
- `summary.html`
- `client-summary.txt`
- `follow-up-checklist.md`
- `evidence.json`
- `screenshots/`

Reports also include an executive summary, decision brief, visible conclusion, verified facts, positive indicators, concerns, unknown or unverified items, final assessment, site identity summary, domain and page date details, external evidence, category assessment, review snapshot, grouped concerns, suggested next steps, public details, page evidence, and a screenshot gallery. The GUI also has a copyable plain-English summary and a recent-review list for the current app session.
The GUI and reports also highlight the highest-priority follow-up items first. Completed results show the saved folder path, report buttons, and per-page screenshot links.

Generated folders such as `reports/`, `dist/`, and `release/` are intentionally ignored by Git so local runs and packaging output do not clutter the project history.

## Review Coverage

- Pages that do not load cleanly
- Common website entry points such as apex and `www` home URLs
- Sitemap page URLs from `/sitemap.xml` when available
- Public domain registration dates when available
- External evidence labels that distinguish reviewed-website facts, public external-source facts, manual follow-up items, and items that could not be verified from the local run
- Website-discovered external profile links, such as LinkedIn, Facebook, Instagram, X, YouTube, TikTok, Pinterest, and Threads
- Manual public search links for independent business footprint, map/local listings, reviews, complaint references, and LinkedIn-style company profile checks
- State registry follow-up links when an expected state is provided
- Homepage last-modified headers or metadata when available
- Links that return HTTP error status codes
- Reviews that hit the configured page limit
- Pages with very little visible text
- Missing or generic page titles
- Duplicate page titles
- Generic marketing wording
- Heavy use of repeated generic marketing wording
- Common misspellings
- Template-like writing patterns
- Repeated sentence starts
- Repeated visible content blocks across reviewed pages
- Stale job, application, or deadline dates
- Placeholder-style zero metrics, such as project, experience, award, or client counters left at `0`
- Dummy or unrelated product/cart content on service-business websites
- Third-party provider or outside-domain references inside service-like pages
- Broad unsupported marketing claims, such as extreme satisfaction claims or "best in the world" wording without detail
- Cumulative content-quality patterns when several weak signals appear together
- Meta description and heading evidence
- Placeholder wording such as `lorem ipsum`
- `TODO`
- `sample text`
- `Your Company`
- `Address Line 1`
- Missing Contact page
- Missing About page
- Missing Privacy Policy
- Missing Terms page
- Common services, pricing, FAQ, refund/return, shipping/delivery, and cancellation page presence
- Social links that do not point to matching external profile domains
- Social platform labels that appear without matching external profile links
- Social profile links that return HTTP error status codes during the review
- Contact emails that use common mailbox providers
- Contact emails that use a domain different from the reviewed website
- Contact emails that closely resemble, but do not match, the reviewed website domain
- HR-only contact email situations where `hr@...` is the only email found
- Different business names in copyright-style text
- Multiple business names, email domains, phone numbers, or address-like lines across reviewed pages
- Phone area codes that do not match address states found in reviewed text, labeled for manual review because mobile and VoIP numbers can be normal
- Cumulative business-detail patterns when several identity follow-up items appear together
- Contact form presence
- Contact pages without a visible email, phone number, or contact form
- Missing visible email address
- Missing visible phone number
- Very limited business details across reviewed pages
- Provided company name not appearing in reviewed text
- Provided location not appearing in reviewed text
- Expected registration state not appearing in reviewed text
- Claimed industry or service not appearing in reviewed text
- Provided identifiers not appearing in reviewed text
- Licensing or registration manual follow-up for industries that may require it
- Domain creation date that appears newer than business-history wording on the website
- Payment wording that deserves manual review, such as wire transfer, gift card, cryptocurrency, money order, or non-refundable upfront fee wording
- Whether the provided details match what appears on reviewed pages
- Related domains found in page text, links, social profiles, or contact emails
- Manual follow-up items for confirming business details outside the reviewed website, including the expected state business registration search when a state is provided
- Manual follow-up items for independent public footprint checks this local app does not complete automatically, such as map listings, directories, review platforms, press mentions, and public business listings

Supported state registry follow-up links:

- Texas
- Delaware
- California
- Florida
- New York
- North Carolina
- New Jersey
- Virginia

Expected pages must be found as reviewed pages or links. A plain text mention of a Contact, Privacy, or Terms page is not counted as enough by itself.

The writing-pattern checks are not a detector for how text was created. They flag wording that reads as generic, repetitive, or template-like so a person can review it.

External evidence links are generated for manual review. This version does not scrape state registries, scrape LinkedIn, interpret search results, perform paid map/directory API lookups, or use automated narrative generation.

## Developer Commands

These are only needed if you are building from source.

```bash
npm install
npx playwright install chromium
npm test
npm run gui
```

Build the Windows release locally:

```bash
npm run package:win:full
```

## Windows Publisher Name

Windows shows **Unknown Publisher** for unsigned downloaded apps. The publisher name is not controlled by the app text; Windows reads it from a trusted Authenticode code-signing certificate.

To show **Freepartner Digital** as the publisher, use a code-signing certificate issued to Freepartner Digital, then add these GitHub repository secrets:

- `WINDOWS_SIGNING_CERT_BASE64`
- `WINDOWS_SIGNING_CERT_PASSPHRASE`
- `WINDOWS_SIGNING_TIMESTAMP_URL` optional, defaults to `http://timestamp.digicert.com`

Create the base64 value from a `.pfx` certificate in PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\certificate.pfx")) | Set-Content signing-cert-base64.txt
```

Copy the contents of `signing-cert-base64.txt` into the `WINDOWS_SIGNING_CERT_BASE64` secret. The GitHub workflow signs `business-website-review.exe` automatically when those secrets are present.

Run from the command line:

```bash
npm run review -- https://example.com --company "Example Inc" --location "Austin, Texas" --state "Texas" --industry "IT consulting"
```
