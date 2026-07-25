declare const __APP_VERSION__: string;

/**
 * App SemVer injected at build/test time.
 * Source of truth remains package.json -> version.
 */
export const APP_VERSION: string = __APP_VERSION__;
