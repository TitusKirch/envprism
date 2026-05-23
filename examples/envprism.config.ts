/**
 * Example envprism configuration for the bundled fixtures.
 *
 * Run from this directory to see it take effect:
 *   bunx envprism diff .
 *   bunx envprism .            # TUI
 *
 * For type-safe authoring in a real project, install envprism and use:
 *   import { defineEnvprismConfig } from 'envprism/config';
 *   export default defineEnvprismConfig({ ... });
 *
 * @type {import('envprism/config').EnvprismUserConfig}
 */
export default {
  base: {
    // The fixtures use .env.example as the reference (also the default).
    name: '.env.example'
  },
  heuristics: {
    // The defaults already mask SECRET/TOKEN/KEY/DSN/PASSWORD… keys, but the
    // fixtures also carry SLACK_WEBHOOK_URL — appending WEBHOOK masks it too,
    // without losing the built-in tokens.
    secretTokensExtra: ['WEBHOOK'],
    // Treat "fill-in" / "set-me" markers as placeholders alongside the
    // built-ins (TODO, CHANGEME, xxx, …).
    placeholdersExtra: ['fill[_-]?in', 'set[_-]?me'],
    // The fixtures are grouped by comment banners (Application, Database, …),
    // so force banner grouping instead of leaving it to the 'auto' heuristic.
    grouping: 'banner'
  },
  diff: {
    json: false,
    checkExitCode: 1
  },
  tui: {
    theme: {
      // Tint the section banners + base column teal to show theming works.
      fgBase: '#5fd7d7',
      fgSection: '#5fd7d7'
    },
    maskSecrets: true,
    undoLimit: 50
  }
};
