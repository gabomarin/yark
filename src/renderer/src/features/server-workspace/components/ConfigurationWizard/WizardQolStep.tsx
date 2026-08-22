import type { ReactElement } from "react";
import { NumberInput, Stack } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { ConfigurationWizardDraft } from "../../configurationWizardModel";
import { SettingSwitch, WizardStep } from "./ConfigurationWizardParts";

interface Props {
  form: UseFormReturnType<ConfigurationWizardDraft>;
}

export function WizardQolStep({ form }: Props): ReactElement {
  return (
    <WizardStep
      title="Choose comfort rules"
      description="Common comfort settings, not performance tuning."
    >
      <Stack gap="xs">
        <SettingSwitch
          label="PvE server"
          description="Prevents direct combat between players."
          {...form.getInputProps("pve", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Hardcore mode"
          description="On death, the character resets to level 1."
          {...form.getInputProps("hardcore", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Show map location"
          description="Each player can see their exact location."
          {...form.getInputProps("showMapLocation", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Show crosshair"
          description="Shows an on-screen aiming reference."
          {...form.getInputProps("crosshair", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Allow third person"
          description="Players can switch the camera to third person."
          {...form.getInputProps("thirdPerson", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Carry creatures with flyers in PvE"
          description="Allows picking up creatures with flyers."
          {...form.getInputProps("flyerCarryPve", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Allow cave building in PvE"
          description="Lets tribes build inside caves on PvE servers."
          {...form.getInputProps("allowCaveBuildingPve", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Show floating damage text"
          description="Shows damage numbers when hitting creatures or structures."
          {...form.getInputProps("showFloatingDamageText", { type: "checkbox" })}
        />
        <SettingSwitch
          label="Always allow structure pickup"
          description="Skip the post-placement timer so structures can be picked up anytime."
          {...form.getInputProps("alwaysAllowStructurePickup", { type: "checkbox" })}
        />
        <NumberInput
          label="Structure pickup time"
          description={
            form.values.alwaysAllowStructurePickup
              ? "Not used while always-allow pickup is on."
              : "Seconds available after placing them. Use 0 for immediate pickup."
          }
          min={0}
          max={3600}
          suffix=" s"
          allowDecimal={false}
          disabled={form.values.alwaysAllowStructurePickup}
          {...form.getInputProps("structurePickupSeconds")}
        />
      </Stack>
    </WizardStep>
  );
}
