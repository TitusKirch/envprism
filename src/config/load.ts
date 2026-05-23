import { existsSync } from 'node:fs';
import { loadConfig } from 'c12';
import { dirname, join } from 'pathe';
import { mergeConfig } from '@/config/resolve.ts';
import type { EnvprismConfig, EnvprismUserConfig } from '@/config/schema.ts';

const CONFIG_EXTS = ['ts', 'js', 'mjs', 'json'] as const;

/**
 * Walk up from `start` looking for envprism.config.{ts,js,mjs,json}. c12 does
 * not climb ancestors itself, so we resolve the file path here and hand it to
 * c12 explicitly. Returns the first match or undefined at the filesystem root.
 */
function findConfigUp(start: string): string | undefined {
  let dir = start;
  for (;;) {
    for (const ext of CONFIG_EXTS) {
      const candidate = join(dir, `envprism.config.${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface LoadOptions {
  /** Directory to start the walk-up search from (default: process.cwd()). */
  cwd?: string;
  /** Explicit config file path; overrides walk-up and the env var. */
  configFile?: string;
}

export interface LoadedConfig {
  config: EnvprismConfig;
  /** Absolute path of the config file that was loaded, if any. */
  configFile: string | undefined;
  /** Directory the search ran from. */
  cwd: string;
}

/**
 * Load and resolve the envprism config. Precedence for *where* to look:
 * explicit `configFile` > `ENVPRISM_CONFIG` env var > walk-up from cwd.
 * c12 handles the walk-up (envprism.config.{ts,js,mjs,json}); we keep
 * rc/global/dotenv off and apply our own merge (defu deep-merges defaults
 * into user lists, which we don't want — see resolve.ts).
 */
export async function loadEnvprismConfig(
  options: LoadOptions = {}
): Promise<LoadedConfig> {
  const envConfig = process.env.ENVPRISM_CONFIG;
  const startCwd = options.cwd ?? process.cwd();
  // Precedence: explicit flag > env var > walk-up from cwd.
  const resolved = options.configFile ?? envConfig ?? findConfigUp(startCwd);
  const cwd = resolved ? dirname(resolved) : startCwd;

  if (!resolved) {
    return { config: mergeConfig({}), configFile: undefined, cwd };
  }

  const { config } = await loadConfig<EnvprismUserConfig>({
    name: 'envprism',
    cwd,
    configFile: resolved,
    rcFile: false,
    globalRc: false,
    dotenv: false
  });

  return {
    config: mergeConfig(config ?? {}),
    configFile: resolved,
    cwd
  };
}
