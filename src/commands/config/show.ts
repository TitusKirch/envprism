import { defineCommand } from 'citty';
import { loadEnvprismConfig } from '@/config/load.ts';

export const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: 'Print the effective (merged) config as JSON.'
  },
  args: {
    config: {
      type: 'string',
      description:
        'Path to an envprism.config file (default: walk up from cwd).'
    }
  },
  async run({ args }) {
    const { config } = await loadEnvprismConfig({ configFile: args.config });
    process.stdout.write(JSON.stringify(config, null, 2) + '\n');
  }
});
