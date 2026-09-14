import { forwardRef, type ReactNode } from "react";
import classes from "./StatusWord.module.css";

type StatusWordTone = "ok" | "warn" | "danger" | "neutral";

interface Props {
  tone: StatusWordTone;
  children: ReactNode;
}

/** Word + status dot — quieter than a filled Badge for routine states. */
export const StatusWord = forwardRef<HTMLSpanElement, Props>(
  function StatusWord(props, ref) {
    return (
      <span ref={ref} className={classes.root} data-tone={props.tone}>
        <span className={classes.dot} aria-hidden="true" />
        {props.children}
      </span>
    );
  },
);
StatusWord.displayName = "StatusWord";
