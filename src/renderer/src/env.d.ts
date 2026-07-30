import type { JSX as ReactJSX } from "react";
import type { RendererApi } from "@shared/ipc";

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    api: RendererApi;
  }

  /** React 19 types nest JSX under `react`; keep `JSX.Element` return types compiling. */
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}

export {};
