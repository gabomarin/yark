import type { ReactElement } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import classes from "./ClusterIniTemplateModal.module.css";

interface Props {
  exists: boolean;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  payloadReady: boolean;
  onClose: () => void;
  onDelete: () => void;
  onReload: () => void;
  onSave: () => void;
}

export function ClusterIniTemplateModalFooter(props: Props): ReactElement {
  const {
    exists,
    dirty,
    loading,
    saving,
    payloadReady,
    onClose,
    onDelete,
    onReload,
    onSave,
  } = props;

  return (
    <div className={classes.footer} data-cluster-ini-footer>
      <div className={classes.notice}>
        Template edits never write member install folders. Use Promote / Restore on
        a stopped member, or opt into seed when adding servers.
      </div>

      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="default" disabled={saving || loading} onClick={onClose}>
            Close
          </Button>
          {exists && (
            <Button
              variant="filled"
              color="red"
              disabled={saving || loading}
              onClick={onDelete}
            >
              Delete template
            </Button>
          )}
        </Group>
        <Group gap="xs">
          <Button
            variant="default"
            disabled={saving || loading || !dirty}
            onClick={onReload}
          >
            Reload
          </Button>
          <Button
            leftSection={<FloppyDisk size={16} />}
            loading={saving}
            disabled={loading || !payloadReady || (exists && !dirty)}
            onClick={onSave}
          >
            {exists ? "Save template" : "Create template"}
          </Button>
        </Group>
      </Group>
    </div>
  );
}
