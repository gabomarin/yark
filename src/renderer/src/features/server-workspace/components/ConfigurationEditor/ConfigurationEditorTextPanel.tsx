import type { ReactElement } from "react";
import { Alert, Stack, Textarea } from "@mantine/core";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { textForFile, withFileText } from "../../iniModel";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  iniFile: IniFileKey;
  payload: ServerIniPayload;
  onPayloadChange: (next: ServerIniPayload) => void;
}

export function ConfigurationEditorTextPanel(props: Props): ReactElement {
  const { iniFile, payload, onPayloadChange } = props;

  return (
    <Stack gap="md">
      {iniFile === "gameUserSettings" && (
        <Alert color="blue" variant="light" title="Server settings override">
          Session name, ports, and passwords come from the{" "}
          <strong>Server</strong> tab and are rewritten on start. ASA ignores INI{" "}
          <code>MaxPlayers</code> – set <strong>Max players</strong> there for{" "}
          <code>-WinLiveMaxPlayers</code> (empty or <code>0</code> omits the flag;
          ASA then defaults to 70).
        </Alert>
      )}
      <Textarea
        className={classes.rawEditor}
        minRows={22}
        value={textForFile(payload, iniFile)}
        onChange={(event) => {
          onPayloadChange(
            withFileText(payload, iniFile, event.currentTarget.value),
          );
        }}
        styles={{
          input: {
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: 12,
          },
        }}
      />
    </Stack>
  );
}
