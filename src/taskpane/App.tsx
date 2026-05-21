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
  tokens
} from "@fluentui/react-components";
import { readDocumentText } from "./office/word";
import {
  ClassificationLevel,
  classifyText,
  ClassificationResult,
  getLevels
} from "./classification/classifier";
import {
  CatalogLabel,
  canSetLabel,
  findLabelByNames,
  getCatalogLabels,
  getCurrentLabelId,
  isCatalogEnabled,
  setLabel
} from "./office/sensitivity";
import { ClassificationCard } from "./components/ClassificationCard";
import { MatchList } from "./components/MatchList";
import { ConfirmApplyDialog } from "./components/ConfirmApplyDialog";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px",
    gap: "12px",
    boxSizing: "border-box",
    backgroundColor: tokens.colorNeutralBackground1
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  scroll: {
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  spinnerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  }
});

interface AppProps {
  host: Office.HostType;
}

type Phase = "idle" | "scanning" | "ready" | "applying" | "applied" | "error";

const LABEL_NAME_CANDIDATES: Record<ClassificationLevel["id"], string[]> = {
  Public: ["Public", "General Public", "Non-Business"],
  Internal: ["Internal", "General", "Internal Use"],
  Confidential: ["Confidential", "Confidential - Internal", "Confidential All Employees"],
  HighlyConfidential: [
    "Highly Confidential",
    "Highly Confidential - Internal",
    "Restricted",
    "Strictly Confidential"
  ]
};

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
      const r = classifyText(text);
      setResult(r);
      setChosenLevel(r.recommendedLevel);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        const candidate = findLabelByNames(catalog, LABEL_NAME_CANDIDATES[chosenLevel.id]);
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
  const levels = getLevels();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title3>Content Classifier</Title3>
        <Caption1>
          {host === Office.HostType.Word
            ? "Scans the document body for sensitivity keywords and recommends a classification."
            : "Host not supported in this version."}
        </Caption1>
        {catalogEnabled ? (
          <Caption1>
            Sensitivity label catalog: <b>{catalog.length}</b> labels available.
            {currentLabel ? <> Current label: <b>{currentLabel.name}</b>.</> : null}
          </Caption1>
        ) : (
          <Caption1>
            Sensitivity label catalog is not enabled in this session. Recommendations will still
            work; applying a label may need to be done manually.
          </Caption1>
        )}
      </div>

      <div className={styles.actions}>
        <Button appearance="primary" onClick={runScan} disabled={phase === "scanning"}>
          {phase === "scanning" ? "Scanning…" : result ? "Re-scan document" : "Scan document"}
        </Button>
      </div>

      <Divider />

      <div className={styles.scroll}>
        {phase === "scanning" && (
          <div className={styles.spinnerRow}>
            <Spinner size="tiny" />
            <Body1>Reading document content…</Body1>
          </div>
        )}

        {phase === "error" && error && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Something went wrong</MessageBarTitle>
              {error}
            </MessageBarBody>
          </MessageBar>
        )}

        {phase === "applied" && chosenLevel && (
          <MessageBar intent="success">
            <MessageBarBody>
              <MessageBarTitle>Label applied</MessageBarTitle>
              The "{chosenLevel.label}" sensitivity label has been set on this document.
            </MessageBarBody>
          </MessageBar>
        )}

        {result && (
          <>
            <Subtitle2>Recommendation</Subtitle2>
            <ClassificationCard
              levels={levels}
              recommended={result.recommendedLevel}
              chosen={chosenLevel ?? result.recommendedLevel}
              onChange={setChosenLevel}
              usedDefault={result.usedDefault}
            />

            <Subtitle2>Matches</Subtitle2>
            {result.matches.length === 0 ? (
              <Body1>
                No keywords matched. Defaulted to <b>{result.recommendedLevel.label}</b>.
              </Body1>
            ) : (
              <MatchList matches={result.matches} levels={levels} />
            )}

            <Caption1>Scanned {result.scannedCharacters.toLocaleString()} characters.</Caption1>

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
          chosenLevel ? findLabelByNames(catalog, LABEL_NAME_CANDIDATES[chosenLevel.id]) : undefined
        }
        onCancel={() => setDialogOpen(false)}
        onConfirm={onConfirmApply}
      />
    </div>
  );
};
