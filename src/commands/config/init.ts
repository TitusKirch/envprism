import { writeFile } from 'node:fs/promises';
import { defineCommand } from 'citty';
import consola from 'consola';
import { join, resolve } from 'pathe';

/** Scaffold template, shared with `config edit` for first-time creation. */
export const CONFIG_TEMPLATE = `/**
 * envprism configuration.
 *
 * For type-safe authoring, install envprism and switch to:
 *   import { defineEnvprismConfig } from 'envprism/config';
 *   export default defineEnvprismConfig({ ... });
 *
 * @type {import('envprism/config').EnvprismUserConfig}
 */
export default {
  discovery: {
    // paths: ['.'],
    // skipSuffixesExtra: ['.tmp'],
    // exampleFirst: true
  },
  base: {
    name: '.env.example'
    // priority: ['.env.shared']
  },
  heuristics: {
    // secretTokensExtra: ['JWT'],
    // placeholdersExtra: ['set[_-]?me'],
    grouping: 'auto'
  },
  diff: {
    json: false,
    checkExitCode: 1
  },
  tui: {
    theme: {
      // fgBase: '#82aaff'
    },
    layout: {
      keyColWidth: 22,
      valueColMin: 18,
      sidebarWidth: 30,
      rowGap: 0,
      cellPadX: 1
    },
    undoLimit: 50,
    maskSecrets: true
  }
};
`;

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold an envprism.config.ts with documented defaults.'
  },
  args: {
    out: {
      type: 'positional',
      required: false,
      description: 'Directory to write envprism.config.ts into (default: cwd).'
    },
    force: {
      type: 'boolean',
      description: 'Overwrite an existing config file.'
    }
  },
  async run({ args }) {
    const dir = resolve(typeof args.out === 'string' ? args.out : '.');
    const target = join(dir, 'envprism.config.ts');
    try {
      await writeFile(target, CONFIG_TEMPLATE, {
        encoding: 'utf8',
        flag: args.force ? 'w' : 'wx'
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        consola.error(`${target} already exists. Use --force to overwrite.`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    consola.success(`Wrote ${target}`);
  }
});
