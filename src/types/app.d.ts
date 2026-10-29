/** The version in package.json, put in place by the build (vite.config.ts). */
declare const __CARREL_VERSION__: string
/**
 * The commit the app is built from, and whether the working tree differed from it; null for a
 * build from outside a git checkout. Put in place by the build (vite.config.ts).
 */
declare const __CARREL_BUILD__: { commit: string; dirty: boolean } | null
