import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { readDocumentText } from "./office/word";
import {
  CatalogLabel,
  canSetLabel,
  findLabelByNames,
  getCatalogLabels,
  getCurrentLabelId,
  isCatalogEnabled,
  setLabel,
} from "./office/sensitivity";
import { ClassificationCard } from "./components/ClassificationCard";
import { EvidenceList } from "./components/EvidenceList";
import { ConfirmApplyDialog } from "./components/ConfirmApplyDialog";
import { ClassificationLevel, ClassificationResult } from "./types";
import { LABEL_NAME_CANDIDATES, LEVELS, getLevelById } from "./levels";
import { classifyDocument, ClassifierApiError } from "./api/classify";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px",
    gap: "12px",
    boxSizing: "border-box",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  scroll: {
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  spinnerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
});

interface AppProps {
  host: Office.HostType;
}

type Phase = "idle" | "scanning" | "ready" | "applying" | "applied" | "error";

export const App: React.FC<AppProps> = ({ host }) => {
  const styles = useStyles();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [result, setResult] = React.useState<ClassificationResult | undefined>();
  const [chosenLevel, setChosenLevel] = React.useState<ClassificationLevel | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [catalog, setCatalog] = React.useState<CatalogLabel[]>([]);
  const [catalogEnabled, setCatalogEnabled] = React.useState<boolean>(false);
  const [currentLabelId, setCurrentLabelId] = React.useState<string | undefined>();
  const [canApplyProgrammatically, setCanApplyProgrammatically] = React.useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    (async () => {
      const enabled = await isCatalogEnabled();
      setCatalogEnabled(enabled);
      if (enabled) {
        const labels = await getCatalogLabels();
        setCatalog(labels);
        const current = await getCurrentLabelId();
        setCurrentLabelId(current);
      }
      setCanApplyProgrammatically(canSetLabel());
    })();
  }, []);

  const runScan = React.useCallback(async () => {
    setPhase("scanning");
    setError(undefined);
    try {
      const text = await readDocumentText();
      if (!text.trim()) {
        throw new Error("Document is empty. Add content before classifying.");
      }
      const r = await classifyDocument({ documentText: text, host: "Word" });
      setResult(r);
      setChosenLevel(getLevelById(r.classification));
      setPhase("ready");
    } catch (e) {
      let msg: string;
      if (e instanceof ClassifierApiError) {
        msg = `Backend error (${e.status}): ${e.message}`;
      } else if (e instanceof TypeError && e.message.includes("fetch")) {
        msg =
          "Cannot reach the classifier backend at https://localhost:4000. " +
          "Make sure the server in /server is running and its HTTPS cert is trusted.";
      } else if (e instanceof Error) {
        msg = e.message;
      } else {
        msg = String(e);
      }
      setError(msg);
      setPhase("error");
    }
  }, []);

  const onConfirmApply = React.useCallback(
    async (justification?: string) => {
      if (!chosenLevel) return;
      setDialogOpen(false);
      setPhase("applying");
      setError(undefined);
      try {
        const candidate = findLabelByNames(
          catalog,
          LABEL_NAME_CANDIDATES[chosenLevel.id]
        );
        if (!candidate) {
          throw new Error(
            `No matching sensitivity label found in your tenant for "${chosenLevel.label}". ` +
              `Apply it manually using the Sensitivity menu on the Home tab.`
          );
        }
        if (!canApplyProgrammatically) {
          throw new Error(
            `This Office build cannot set sensitivity labels via add-ins. ` +
              `Please apply "${candidate.name}" manually using the Sensitivity menu on the Home tab.`
          );
        }
        await setLabel(candidate.id, justification);
        setCurrentLabelId(candidate.id);
        setPhase("applied");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [chosenLevel, catalog, canApplyProgrammatically]
  );

  const currentLabel = catalog.find((l) => l.id === currentLabelId);
  const recommendedLevel = result ? getLevelById(result.classification) : undefined;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title3>Content Classifier</Title3>
        <Caption1>
          {host === Office.HostType.Word
            ? "Sends document content to the classifier backend, which grades it against your company policy and recommends a sensitivity label."
            : "Host not supported in this version."}
        </Caption1>
        {catalogEnabled ? (
          <Caption1>
            Sensitivity label catalog: <b>{catalog.length}</b> labels available.
            {currentLabel ? (
              <> Current label: <b>{currentLabel.name}</b>.</>
            ) : null}
          </Caption1>
        ) : (
          <Caption1>
            Sensitivity label catalog is not enabled in this session.
            Recommendations will still work; applying a label may need to be
            done manually.
          </Caption1>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          appearance="primary"
          onClick={runScan}
          disabled={phase === "scanning"}
        >
          {phase === "scanning"
            ? "Classifying…"
            : result
            ? "Re-classify document"
            : "Classify document"}
        </Button>
      </div>

      <Divider />

      <div className={styles.scroll}>
        {phase === "scanning" && (
          <div className={styles.spinnerRow}>
            <Spinner size="tiny" />
            <Body1>Reading content and asking the classifier…</Body1>
          </div>
        )}

        {phase === "error" && error && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Classification failed</MessageBarTitle>
              {error}
            </MessageBarBody>
          </MessageBar>
        )}

        {phase === "applied" && chosenLevel && (
          <MessageBar intent="success">
            <MessageBarBody>
              <MessageBarTitle>Label applied</MessageBarTitle>
              The "{chosenLevel.label}" sensitivity label has been set on this
              document.
            </MessageBarBody>
          </MessageBar>
        )}

        {result && recommendedLevel && (
          <>
            <Subtitle2>Recommendation</Subtitle2>
            <ClassificationCard
              levels={LEVELS}
              recommended={recommendedLevel}
              chosen={chosenLevel ?? recommendedLevel}
              onChange={setChosenLevel}
              rationale={result.rationale}
              confidence={result.confidence}
            />

            <Subtitle2>Evidence</Subtitle2>
            <EvidenceList
              evidence={result.evidence}
              policyReferences={result.policyReferences}
            />

            <Caption1>
              Model: {result.model}
              {result.cache?.hit ? " · policy cache hit" : ""}
            </Caption1>

            <div className={styles.actions}>
              <Button
                appearance="primary"
                onClick={() => setDialogOpen(true)}
                disabled={!chosenLevel || phase === "applying"}
              >
                {phase === "applying" ? "Applying…" : "Apply label…"}
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmApplyDialog
        open={dialogOpen}
        level={chosenLevel}
        canApplyProgrammatically={canApplyProgrammatically && catalogEnabled}
        catalogLabel={
          chosenLevel
            ? findLabelByNames(catalog, LABEL_NAME_CANDIDATES[chosenLevel.id])
            : undefined
        }
        onCancel={() => setDialogOpen(false)}
        onConfirm={onConfirmApply}
      />
    </div>
  );
};
