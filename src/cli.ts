import { defineCommand } from 'citty';
import { diffCommand } from './commands/diff.ts';
import { runTui, tuiCommand } from './commands/tui.ts';

export const rootCommand = defineCommand({
  meta: {
    name: 'envprism',
    description:
      'TUI-based env file manager — refract one set of variables into many environment views.'
  },
  subCommands: {
    tui: tuiCommand,
    diff: diffCommand
  },
  // Default invocation (no subcommand) launches the TUI in the cwd. Use
  // `envprism tui <path>` or `envprism diff <path>` to scan another directory.
  async run() {
    await runTui({});
  }
});
