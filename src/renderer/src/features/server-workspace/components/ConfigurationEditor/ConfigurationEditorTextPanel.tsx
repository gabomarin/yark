import type { ReactElement } from "react";
import { Alert, Stack, Textarea } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { textForFile, withFileText } from "../../iniModel";
import { INI_GUS_OVERRIDE_HINT_STORAGE_KEY } from "./configurationEditorModel";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  iniFile: IniFileKey;
  payload: ServerIniPayload;
  onPayloadChange: (next: ServerIniPayload) => void;
}

export function ConfigurationEditorTextPanel(props: Props): ReactElement {
  const { iniFile, payload, onPayloadChange } = props;
  const [hintDismissed, setHintDismissed] = useLocalStorage({
    key: INI_GUS_OVERRIDE_HINT_STORAGE_KEY,
    defaultValue: false,
  });
  const fileLabel =
    iniFile === "gameUserSettings" ? "GameUserSettings.ini" : "Game.ini";

  return (
    <Stack gap="sm" className={classes.textPanel}>
      {iniFile === "gameUserSettings" && !hintDismissed && (
        <Alert
          color="blue"
          variant="light"
          title="Server settings override"
          withCloseButton
          closeButtonLabel="Dismiss"
          onClose={() => setHintDismissed(true)}
        >
          Session name, ports, and passwords come from the{" "}
          <strong>Server</strong> tab and are rewritten on start. ASA ignores INI{" "}
          <code>MaxPlayers</code> – set <strong>Max players</strong> there for{" "}
          <code>-WinLiveMaxPlayers</code> (empty or <code>0</code> omits the flag;
          ASA then defaults to 70).
        </Alert>
      )}
      <Textarea
        className={classes.rawEditor}
        aria-label={`${fileLabel} raw editor`}
        data-ini-raw-editor={iniFile}
        autosize={false}
        value={textForFile(payload, iniFile)}
        onChange={(event) => {
          onPayloadChange(
            withFileText(payload, iniFile, event.currentTarget.value),
          );
        }}
      />
    </Stack>
  );
}
