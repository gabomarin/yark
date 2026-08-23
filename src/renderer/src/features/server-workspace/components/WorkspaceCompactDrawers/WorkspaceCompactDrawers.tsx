import type { ReactElement, ReactNode } from "react";
import { Drawer } from "@mantine/core";
import classes from "../../ServerWorkspacePage.module.css";

interface Props {
  serverSwitcherOpen: boolean;
  serverActionsOpen: boolean;
  onCloseServerSwitcher: () => void;
  onCloseServerActions: () => void;
  serverList: ReactNode;
  sidePanel: ReactNode;
}

export function WorkspaceCompactDrawers(props: Props): ReactElement {
  const drawerClassNames = {
    content: classes.drawerContent,
    header: classes.drawerHeader,
    body: classes.drawerBody,
  };

  return (
    <>
      <Drawer
        opened={props.serverSwitcherOpen}
        onClose={props.onCloseServerSwitcher}
        title="Switch server"
        position="left"
        size={320}
        overlayProps={{ backgroundOpacity: 0.68 }}
        classNames={drawerClassNames}
      >
        <div className={classes.drawerPanel}>{props.serverList}</div>
      </Drawer>

      <Drawer
        opened={props.serverActionsOpen}
        onClose={props.onCloseServerActions}
        title="Status and actions"
        position="right"
        size={340}
        overlayProps={{ backgroundOpacity: 0.68 }}
        classNames={drawerClassNames}
      >
        <div className={classes.drawerPanel}>{props.sidePanel}</div>
      </Drawer>
    </>
  );
}
