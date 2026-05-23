import { defineCommand } from 'citty';
import { editCommand } from '@/commands/config/edit.ts';
import { initCommand } from '@/commands/config/init.ts';
import { pathCommand } from '@/commands/config/path.ts';
import { showCommand } from '@/commands/config/show.ts';

export const configCommand = defineCommand({
  meta: {
    name: 'config',
    description: 'Inspect and manage the envprism config.'
  },
  subCommands: {
    init: initCommand,
    path: pathCommand,
    show: showCommand,
    edit: editCommand
  }
});
