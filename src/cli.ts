import { defineCommand } from 'citty';
import { diffCommand } from './commands/diff.ts';
import { runTui, tuiCommand } from './commands/tui.ts';

export const rootCommand = defineCommand({
  meta: {
    name: 'envprism',
    description:
      'TUI-based env file manager — refract one set of variables into many environment views.'
  },
  args: {
    paths: {
      type: 'positional',
      required: false,
      description: 'Directory or files to scan (defaults to cwd).'
    },
    base: {
      type: 'string',
      description: 'Base file to diff against (defaults to .env.example).'
    }
  },
  subCommands: {
    tui: tuiCommand,
    diff: diffCommand
  },
  // Default invocation (no subcommand) launches the TUI.
  async run({ args }) {
    await runTui({ paths: args.paths, base: args.base });
  }
});
