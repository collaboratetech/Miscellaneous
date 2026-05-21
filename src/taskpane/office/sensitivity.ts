/**
 * Wrappers around Office.js sensitivity label APIs.
 *
 * Reading the catalog and the current label is supported in modern Office builds via
 * `Office.context.sensitivityLabelsCatalog`. Programmatically setting the active label is
 * only available in some hosts/builds. We feature-detect at runtime and fall back to
 * prompting the user to apply the label manually via the Sensitivity menu in the ribbon.
 */

export interface CatalogLabel {
  id: string;
  name: string;
  /** Optional tooltip/description from the tenant config. */
  tooltip?: string;
}

interface SensitivityLabelsCatalogLike {
  getIsEnabledAsync?: (cb: (r: Office.AsyncResult<boolean>) => void) => void;
  getAsync?: (cb: (r: Office.AsyncResult<CatalogLabel[]>) => void) => void;
}

interface DocumentWithLabelApi {
  getSelectedSensitivityLabelAsync?: (cb: (r: Office.AsyncResult<{ id: string }>) => void) => void;
  setSelectedSensitivityLabelAsync?: (
    label: { id: string; assignmentMethod?: "Standard" | "Privileged" | "Auto"; justification?: string },
    cb: (r: Office.AsyncResult<void>) => void
  ) => void;
}

function getCatalog(): SensitivityLabelsCatalogLike | undefined {
  return (Office.context as unknown as { sensitivityLabelsCatalog?: SensitivityLabelsCatalogLike })
    .sensitivityLabelsCatalog;
}

function getDocumentLabelApi(): DocumentWithLabelApi | undefined {
  return Office.context.document as unknown as DocumentWithLabelApi;
}

export async function isCatalogEnabled(): Promise<boolean> {
  const catalog = getCatalog();
  if (!catalog?.getIsEnabledAsync) return false;
  return new Promise((resolve) => {
    catalog.getIsEnabledAsync!((res) => {
      resolve(res.status === Office.AsyncResultStatus.Succeeded && res.value === true);
    });
  });
}

export async function getCatalogLabels(): Promise<CatalogLabel[]> {
  const catalog = getCatalog();
  if (!catalog?.getAsync) return [];
  return new Promise((resolve) => {
    catalog.getAsync!((res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded && Array.isArray(res.value)) {
        resolve(res.value);
      } else {
        resolve([]);
      }
    });
  });
}

export async function getCurrentLabelId(): Promise<string | undefined> {
  const docApi = getDocumentLabelApi();
  if (!docApi?.getSelectedSensitivityLabelAsync) return undefined;
  return new Promise((resolve) => {
    docApi.getSelectedSensitivityLabelAsync!((res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded && res.value) {
        resolve(res.value.id);
      } else {
        resolve(undefined);
      }
    });
  });
}

export function canSetLabel(): boolean {
  return typeof getDocumentLabelApi()?.setSelectedSensitivityLabelAsync === "function";
}

export async function setLabel(labelId: string, justification?: string): Promise<void> {
  const docApi = getDocumentLabelApi();
  if (!docApi?.setSelectedSensitivityLabelAsync) {
    throw new Error("This Office build does not expose an API for setting the sensitivity label.");
  }
  return new Promise((resolve, reject) => {
    docApi.setSelectedSensitivityLabelAsync!(
      { id: labelId, assignmentMethod: "Standard", justification },
      (res) => {
        if (res.status === Office.AsyncResultStatus.Succeeded) {
          resolve();
        } else {
          reject(new Error(res.error?.message ?? "Failed to set sensitivity label."));
        }
      }
    );
  });
}

/**
 * Try to find the catalog label whose name best matches one of the supplied candidate names
 * (case-insensitive, ignoring punctuation). Returns the first match.
 */
export function findLabelByNames(
  catalog: CatalogLabel[],
  candidateNames: string[]
): CatalogLabel | undefined {
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = candidateNames.map(normalise);
  return catalog.find((l) => wanted.includes(normalise(l.name)));
}
