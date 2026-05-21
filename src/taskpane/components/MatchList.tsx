import * as React from "react";
import {
  Body1,
  Caption1,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { ClassificationId, ClassificationLevel, KeywordMatch } from "../classification/classifier";

const useStyles = makeStyles({
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px",
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall
  },
  match: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: tokens.fontFamilyMonospace
  }
});

interface Props {
  matches: KeywordMatch[];
  levels: ClassificationLevel[];
}

export const MatchList: React.FC<Props> = ({ matches, levels }) => {
  const styles = useStyles();
  const grouped = matches.reduce<Record<ClassificationId, KeywordMatch[]>>(
    (acc, m) => {
      acc[m.levelId] = acc[m.levelId] ?? [];
      acc[m.levelId].push(m);
      return acc;
    },
    { Public: [], Internal: [], Confidential: [], HighlyConfidential: [] }
  );

  return (
    <>
      {levels
        .filter((l) => grouped[l.id]?.length)
        .reverse()
        .map((l) => (
          <div key={l.id} className={styles.group}>
            <Body1>
              <b>{l.label}</b> — {grouped[l.id].length} unique keyword{grouped[l.id].length === 1 ? "" : "s"}
            </Body1>
            {grouped[l.id].map((m) => (
              <Caption1 key={`${l.id}-${m.keyword}`} className={styles.match}>
                <span>"{m.keyword}"</span>
                <span>×{m.count}</span>
              </Caption1>
            ))}
          </div>
        ))}
    </>
  );
};
