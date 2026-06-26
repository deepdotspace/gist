/** App name — replaced by the CLI during scaffolding */
export const APP_NAME = 'gist'

/** Primary scope ID for the app's RecordRoom DO */
export const SCOPE_ID = `app:${APP_NAME}`

/** Roles and display config — imported from SDK (single source of truth) */
export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'

/**
 * Apify actor that scrapes a YouTube transcript. Verified working through the
 * `apify/run-actor` proxy; returns one dataset item shaped
 * `{ data: [{ start, dur, text }, ...] }`.
 */
export const TRANSCRIPT_ACTOR_ID = 'pintostudio/youtube-transcript-scraper'

/** Hard cap on Apify spend per run (USD). PAY_PER_EVENT actors require this. */
export const TRANSCRIPT_MAX_COST_USD = 2

/**
 * Claude model used for summarizing/structuring + quiz generation.
 * NOTE: the anthropic integration's own schema default
 * (`claude-sonnet-4-20250514`) is dead on the platform (404 model not found),
 * so the model id must be passed explicitly. `claude-sonnet-4-6` is verified
 * working through the proxy.
 */
export const SUMMARY_MODEL = 'claude-sonnet-4-6'
