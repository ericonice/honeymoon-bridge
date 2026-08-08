/** The workspace root's version — see `appVersion` in `vite.config.ts`. */
declare const __APP_VERSION__: string;

/** Stamped in by Vite at build time — see `buildId` in `vite.config.ts`. */
declare const __BUILD_ID__: string;

/** UTC, to the minute. */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Origin of the table server. Empty or unset means the local `wrangler dev`. */
  readonly VITE_SERVER_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
