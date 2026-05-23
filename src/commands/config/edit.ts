import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { defineCommand } from 'citty';
import consola from 'consola';
import { resolve } from 'pathe';
import { CONFIG_TEMPLATE } from '@/commands/config/init.ts';
import { loadEnvprismConfig } from '@/config/load.ts';

export const editCommand = defineCommand({
  meta: {
    name: 'edit',
    description:
      'Open the config in $EDITOR (creates it in cwd if none exists).'
  },
  args: {
    config: {
      type: 'string',
      description:
        'Path to an envprism.config file (default: walk up from cwd).'
    }
  },
  async run({ args }) {
    let { configFile } = await loadEnvprismConfig({ configFile: args.config });

    if (!configFile) {
      configFile = resolve('envprism.config.ts');
      try {
        await writeFile(configFile, CONFIG_TEMPLATE, {
          encoding: 'utf8',
          flag: 'wx'
        });
        consola.info(`Created ${configFile}`);
      } catch {
        // Created concurrently or already present — open whatever is there.
      }
    }

    const editor = process.env.VISUAL || process.env.EDITOR || 'nano';
    await new Promise<void>((res, rej) => {
      const child = spawn(editor, [configFile!], { stdio: 'inherit' });
      child.on('error', rej);
      child.on('exit', (code) => {
        if (code && code !== 0) {
          consola.warn(`${editor} exited with code ${code}.`);
        }
        res();
      });
    });
  }
});
