import { defineCommand } from 'citty';

export const rootCommand = defineCommand({
  meta: {
    name: 'envprism',
    description:
      'TUI-based env file manager — refract one set of variables into many environment views.'
  },
  run() {
    // PR 1 bootstrap stub — TUI command lands in a later PR.
    console.log(
      'envprism: bootstrap stub. TUI and `diff` subcommand land in follow-up PRs.'
    );
  }
});
