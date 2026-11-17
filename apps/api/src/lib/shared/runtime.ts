/**
 * Runtime values the API uses from libs/shared/types, through per-file subpaths of the package
 * (see its package.json `exports`).
 *
 * The package's index re-exports its files as `./lib/x.js` (the library compiles as nodenext),
 * and Turbopack cannot map those specifiers back to the `.ts` sources, so a value imported from
 * `@expedientes/shared-types` breaks `next build`. Type-only imports from the package are erased
 * before bundling and are fine. Only files with no relative imports of their own can be exposed as a
 * subpath; runtime-imports.spec.ts keeps the rule.
 */
export { PLAN_LIMITS } from '@expedientes/shared-types/plan';
export {
  DEFAULT_DECLARATION_AFTER,
  DEFAULT_DECLARATION_BEFORE,
} from '@expedientes/shared-types/consent-boilerplate';
