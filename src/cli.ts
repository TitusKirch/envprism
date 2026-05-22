import { defineCommand } from 'citty';
import { diffCommand } from './commands/diff.ts';

export const rootCommand = defineCommand({
  meta: {
    name: 'envprism',
    description:
      'TUI-based env file manager — refract one set of variables into many environment views.'
  },
  subCommands: {
    diff: diffCommand
  }
  // The default invocation will launch the TUI in a follow-up PR. Until then,
  // citty prints help when no subcommand is given.
});
