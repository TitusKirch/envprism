// Public, dependency-light entry for `envprism/config`. Types + identity
// helper only — must never import c12, defu, or @opentui/core so config
// authoring stays cheap to load.

import type { EnvprismUserConfig } from '@/config/schema.ts';

export type {
  BaseConfig,
  DiffConfig,
  DiscoveryConfig,
  EnvprismConfig,
  EnvprismUserConfig,
  GroupingMode,
  HeuristicsConfig,
  LayoutConfig,
  ThemeConfig,
  TuiConfig
} from '@/config/schema.ts';

/**
 * Identity helper for type-safe config authoring:
 *
 * ```ts
 * import { defineEnvprismConfig } from 'envprism/config';
 * export default defineEnvprismConfig({ heuristics: { grouping: 'prefix' } });
 * ```
 */
export function defineEnvprismConfig(
  config: EnvprismUserConfig
): EnvprismUserConfig {
  return config;
}
