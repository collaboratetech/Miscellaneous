import fs from "fs";
import path from "path";

const POLICY_DIR = path.join(__dirname, "..", "policy");

const FALLBACK_POLICY = `[PLACEHOLDER CLASSIFICATION POLICY]

This is a generic placeholder used until the real company classification
policy PDF is dropped into server/policy/. Replace it by adding either:
  - server/policy/classification-policy.pdf   (auto-extracted on startup), or
  - server/policy/classification-policy.txt   (used as-is)

CLASSIFICATION LEVELS
1. Public
   Information cleared for unrestricted public release. Examples: published
   marketing material, press releases, public regulatory filings.

2. Internal
   Default classification for ordinary business information shared inside
   the organization. Examples: internal memos, org charts, routine
   project plans without customer or personal data.

3. Confidential
   Sensitive business information that could harm the organization, a
   customer, or a partner if disclosed. Examples: customer lists,
   non-public financials, contract terms, source code, NDA-covered
   material, third-party proprietary content, internal security details.

4. Highly Confidential
   Information whose disclosure would cause severe harm or breach legal,
   regulatory, or contractual obligations. Examples: personal data (PII)
   identifying an individual (e.g. SSN, passport, government ID, full
   payment card number), protected health information (PHI), authentication
   secrets, board-level strategic plans, M&A activity, material non-public
   information.

CLASSIFICATION RULES
- When a document plausibly fits multiple levels, choose the HIGHEST level
  that any piece of its content requires.
- If you cannot find any keyword, regulated identifier, or sensitive
  business context, default to Internal.
- Do not classify Public unless the document is explicitly cleared for or
  intended for external release.
- Treat presence of regulated identifiers (PII, PHI, payment data,
  credentials) as Highly Confidential.
`;

let cachedPolicyText: string | null = null;
let policySource = "placeholder";

export async function loadPolicy(): Promise<void> {
  const textPath = path.join(POLICY_DIR, "classification-policy.txt");
  const pdfPath = path.join(POLICY_DIR, "classification-policy.pdf");

  if (fs.existsSync(textPath)) {
    cachedPolicyText = fs.readFileSync(textPath, "utf-8");
    policySource = textPath;
    console.log(
      `[policy] Loaded from ${textPath} (${cachedPolicyText.length} chars)`
    );
    return;
  }

  if (fs.existsSync(pdfPath)) {
    const pdfParse = (await import("pdf-parse")).default;
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    cachedPolicyText = data.text.trim();
    policySource = pdfPath;
    console.log(
      `[policy] Extracted from ${pdfPath} (${cachedPolicyText.length} chars, ${data.numpages} pages)`
    );
    return;
  }

  cachedPolicyText = FALLBACK_POLICY;
  policySource = "placeholder";
  console.warn(
    `[policy] No classification policy found in ${POLICY_DIR}. Using placeholder.\n` +
      `         Drop your PDF at server/policy/classification-policy.pdf` +
      ` (or .txt) and restart.`
  );
}

export function getPolicyText(): string {
  if (cachedPolicyText === null) {
    throw new Error("Policy not loaded. Call loadPolicy() at startup.");
  }
  return cachedPolicyText;
}

export function getPolicySource(): string {
  return policySource;
}
