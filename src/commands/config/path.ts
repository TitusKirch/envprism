import { defineCommand } from 'citty';
import consola from 'consola';
import { loadEnvprismConfig } from '@/config/load.ts';

export const pathCommand = defineCommand({
  meta: {
    name: 'path',
    description:
      'Print the resolved config file path (or note that defaults are used).'
  },
  args: {
    config: {
      type: 'string',
      description:
        'Path to an envprism.config file (default: walk up from cwd).'
    }
  },
  async run({ args }) {
    const { configFile, cwd } = await loadEnvprismConfig({
      configFile: args.config
    });
    if (configFile) {
      // Path goes to stdout so it can be piped; the not-found note is on stderr.
      process.stdout.write(configFile + '\n');
    } else {
      consola.info(
        `No envprism.config found (searched up from ${cwd}); using built-in defaults.`
      );
    }
  }
});
