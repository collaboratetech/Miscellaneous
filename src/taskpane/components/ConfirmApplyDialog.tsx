import * as React from "react";
import {
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Textarea
} from "@fluentui/react-components";
import { ClassificationLevel } from "../classification/classifier";
import { CatalogLabel } from "../office/sensitivity";

interface Props {
  open: boolean;
  level: ClassificationLevel | undefined;
  canApplyProgrammatically: boolean;
  catalogLabel: CatalogLabel | undefined;
  onCancel: () => void;
  onConfirm: (justification?: string) => void;
}

export const ConfirmApplyDialog: React.FC<Props> = ({
  open,
  level,
  canApplyProgrammatically,
  catalogLabel,
  onCancel,
  onConfirm
}) => {
  const [justification, setJustification] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) setJustification("");
  }, [open]);

  if (!level) return null;

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onCancel()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Apply "{level.label}" label?</DialogTitle>
          <DialogContent>
            <Body1>{level.description}</Body1>
            <br />
            {catalogLabel ? (
              <Body1>
                Matched tenant label: <b>{catalogLabel.name}</b>
              </Body1>
            ) : (
              <Body1>
                No tenant label name matched <b>{level.label}</b>. You may need to apply it
                manually via the Sensitivity menu on the Home tab.
              </Body1>
            )}
            {!canApplyProgrammatically && (
              <>
                <br />
                <Body1>
                  Note: this Office build does not allow add-ins to change the sensitivity
                  label programmatically. You'll be prompted to apply it manually.
                </Body1>
              </>
            )}
            <br />
            <Field label="Justification (optional)">
              <Textarea
                value={justification}
                onChange={(_, data) => setJustification(data.value)}
                placeholder="Optional. Some tenants require a justification when lowering a label."
                rows={3}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => onConfirm(justification.trim() || undefined)}
            >
              Confirm and apply
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
