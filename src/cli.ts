import { defineCommand } from 'citty';
import { diffCommand } from '@/commands/diff.ts';
import { runTui, tuiCommand } from '@/commands/tui.ts';

const SUBCOMMANDS = new Set(['tui', 'diff']);

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
  // citty 0.1.6 invokes the root `run` after a matched subcommand returns,
  // so guard against double-execution by bailing when the first positional
  // arg names a known subcommand. With no args at all we launch the TUI in
  // the cwd, which is the documented default.
  async run({ rawArgs }) {
    const firstPositional = rawArgs.find((a) => !a.startsWith('-'));
    if (firstPositional && SUBCOMMANDS.has(firstPositional)) return;
    await runTui({});
  }
});
