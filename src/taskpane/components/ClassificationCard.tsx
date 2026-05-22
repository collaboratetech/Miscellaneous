import * as React from "react";
import {
  Badge,
  Body1,
  Caption1,
  Radio,
  RadioGroup,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ClassificationId, ClassificationLevel } from "../types";

const useStyles = makeStyles({
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
});

const badgeColor: Record<
  ClassificationId,
  "informative" | "subtle" | "warning" | "danger"
> = {
  Public: "informative",
  Internal: "subtle",
  Confidential: "warning",
  HighlyConfidential: "danger",
};

interface Props {
  levels: ClassificationLevel[];
  recommended: ClassificationLevel;
  chosen: ClassificationLevel;
  onChange: (level: ClassificationLevel) => void;
  rationale: string;
  confidence: "low" | "medium" | "high";
}

export const ClassificationCard: React.FC<Props> = ({
  levels,
  recommended,
  chosen,
  onChange,
  rationale,
  confidence,
}) => {
  const styles = useStyles();
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <Body1>Recommended:</Body1>
        <Badge appearance="filled" color={badgeColor[recommended.id]}>
          {recommended.label}
        </Badge>
        <Caption1>confidence: {confidence}</Caption1>
      </div>
      <Body1>{rationale}</Body1>
      <Body1>Override before applying:</Body1>
      <RadioGroup
        value={chosen.id}
        onChange={(_, data) => {
          const next = levels.find((l) => l.id === data.value);
          if (next) onChange(next);
        }}
      >
        {levels.map((l) => (
          <Radio
            key={l.id}
            value={l.id}
            label={`${l.label} — ${l.description}`}
          />
        ))}
      </RadioGroup>
    </div>
  );
};
