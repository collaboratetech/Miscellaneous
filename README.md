# Content Classifier — Word Add-in

A task-pane add-in for Microsoft Word that:

1. Reads the document body via `Word.js`.
2. Scans the text against a bundled keyword dictionary
   (`src/taskpane/classification/keywords.json`).
3. Recommends one of four classifications: **Public**, **Internal**,
   **Confidential**, **Highly Confidential** (highest matching level wins;
   defaults to **Internal** if nothing matches).
4. Lets the user override the recommendation, then — on confirmation —
   applies the matching Microsoft Information Protection (MIP) sensitivity
   label using `Office.context.sensitivityLabelsCatalog` /
   `Office.context.document.setSelectedSensitivityLabelAsync` where
   available, with a graceful fallback that asks the user to apply the
   label manually via Word's built-in **Sensitivity** menu.

> **Scope (v1):** Word only. The code is structured so Excel / PowerPoint
> hosts can be added by introducing an `office/excel.ts` / `office/powerpoint.ts`
> reader and extending the manifest's `<Hosts>` and `VersionOverrides`.

## Requirements

- Node.js 18+
- Microsoft 365 account with Word desktop or Word on the web
- For automatic label application: a tenant with sensitivity labels
  enabled and an Office build that exposes
  `Office.context.document.setSelectedSensitivityLabelAsync`. Otherwise the
  add-in will recommend the label and prompt for manual application.

## Setup

```bash
npm install
npm run dev-server   # serves https://localhost:3000
```

On first run, accept the locally-generated HTTPS certificate.

In a separate terminal, sideload the manifest:

```bash
npm start            # uses office-addin-debugging to sideload manifest.xml
```

The add-in registers a **Classification → Classify Document** button on
the Home tab. Click it to open the task pane.

## Keyword dictionary

Edit `src/taskpane/classification/keywords.json` to tune the rules. Each
level has:

- `id` — one of `Public`, `Internal`, `Confidential`, `HighlyConfidential`
- `rank` — higher rank wins
- `label` / `description` — shown in the UI
- `keywords` — list of strings; alpha-only matches use word boundaries,
  punctuation-containing entries match as substrings (still
  case-insensitive)

## Sensitivity label mapping

Tenant label names vary, so `App.tsx` keeps a `LABEL_NAME_CANDIDATES`
table mapping each classification id to several likely tenant label
names. The first match (case- and punctuation-insensitive) is applied.
Edit that table to match your tenant's exact label names, or extend the
add-in to let users pick from the catalog in the UI.

## Project layout

```
manifest.xml                     Office Add-in manifest (XML format)
src/
  taskpane/
    taskpane.html                Task pane shell, loads Office.js + index.tsx
    index.tsx                    React bootstrap (FluentProvider)
    App.tsx                      Main component (scan / recommend / apply)
    classification/
      classifier.ts              Pure scanning + ranking logic
      keywords.json              Bundled keyword dictionary
    office/
      word.ts                    Word.js body text reader
      sensitivity.ts             Office.js sensitivity label wrappers + feature detection
    components/
      ClassificationCard.tsx     Recommendation + override radio group
      MatchList.tsx              Grouped keyword matches per level
      ConfirmApplyDialog.tsx     Confirmation dialog with optional justification
  commands/
    commands.html / commands.ts  Required FunctionFile (no-op currently)
webpack.config.js                Bundles taskpane + commands, serves https://localhost:3000
tsconfig.json
package.json
```

## Notes & caveats

- The `setSelectedSensitivityLabelAsync` API is not part of the
  long-stable Office.js surface; it is feature-detected at runtime and
  the add-in degrades to a manual-application prompt when missing.
- The bundled keywords are starting defaults — review them with your
  compliance / data-classification owners before relying on the
  recommendations.
- All scanning happens client-side in the task pane; the document text
  never leaves the user's session.
