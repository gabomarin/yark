import type { ReactElement } from "react";
import { Tabs } from "@mantine/core";
import { allWorkspaceTabs } from "../../model/workspaceTabGroups";
import classes from "../../ServerWorkspacePage.module.css";

export function WorkspaceTabList(): ReactElement {
  return (
    <div className={classes.tabChrome}>
      <Tabs.List className={classes.tabList} aria-label="Workspace tabs">
        {allWorkspaceTabs().map((tab) => (
          <Tabs.Tab key={tab.value} value={tab.value}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </div>
  );
}
