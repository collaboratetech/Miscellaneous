import * as React from "react";
import {
  Body1,
  Caption1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ClassificationEvidence } from "../types";

const useStyles = makeStyles({
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px",
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
  snippet: {
    fontFamily: tokens.fontFamilyMonospace,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: "4px 6px",
    borderRadius: tokens.borderRadiusSmall,
    wordBreak: "break-word",
  },
});

interface Props {
  evidence: ClassificationEvidence[];
  policyReferences: string[];
}

export const EvidenceList: React.FC<Props> = ({ evidence, policyReferences }) => {
  const styles = useStyles();

  if (evidence.length === 0 && policyReferences.length === 0) {
    return <Body1>No specific triggers — classified under the policy default.</Body1>;
  }

  return (
    <>
      {evidence.map((e, i) => (
        <div key={i} className={styles.group}>
          <Body1 className={styles.snippet}>"{e.snippet}"</Body1>
          <Caption1>{e.reason}</Caption1>
        </div>
      ))}
      {policyReferences.length > 0 && (
        <Caption1>
          <b>Policy:</b> {policyReferences.join(" · ")}
        </Caption1>
      )}
    </>
  );
};
