import { BoxRenderable, TextRenderable } from '@opentui/core';
import { isSecretKey } from '@/core/mask.ts';
import { basename } from 'pathe';
import type { TuiContext } from '@tui/context.ts';
import { findKvEntry, formatValue } from '@tui/format.ts';
import { removeAllChildren } from '@tui/render/dom.ts';
import { COLORS } from '@tui/theme.ts';
import type { Prompt } from '@tui/types.ts';

export function promptLabelText(p: Prompt): string {
  switch (p.kind) {
    case 'edit':
      return ` Edit ${p.key} in ${basename(p.file.path)}:`;
    case 'add-key':
      return ` Add new key to ${basename(p.file.path)}:`;
    case 'add-value':
      return ` Value for ${p.key} in ${basename(p.file.path)}:`;
    case 'new-file':
      return ' New env file name (e.g. .env.local):';
  }
}

export function refreshPrompt(ctx: TuiContext): void {
  const {
    el: { promptBox, promptBody, promptHint },
    renderer,
    matrix,
    state
  } = ctx;
  const open = state.mode === 'prompt' && state.prompt !== null;
  promptBox.visible = open;
  if (!open || !state.prompt) return;

  promptBox.title = promptLabelText(state.prompt);
  // Hint depends on which prompt is active — only edit/add-value support
  // the apply-to-all + show-secrets shortcuts.
  const p = state.prompt;
  if (p.kind === 'edit' || p.kind === 'add-value') {
    promptHint.content =
      'Enter · confirm    Ctrl-A · apply to all    ' +
      'Ctrl-T · show/mask secrets    Esc · cancel';
  } else {
    promptHint.content = 'Enter · confirm    Esc · cancel';
  }

  // Body layout: full-width input on top, then a context table of every file
  // and its current value (read-only). For add-key / new-file there's no
  // context to show — just the input.
  removeAllChildren(promptBody);
  // Input is rendered as plain text so we can guarantee char + Esc handling
  // ourselves (opentui's InputRenderable swallows Esc as "blur").
  promptBody.add(
    new TextRenderable(renderer, {
      id: 'prompt-input-text',
      content: `▸ ${state.promptInput}▏`,
      fg: COLORS.fg,
      height: 1,
      wrapMode: 'none'
    })
  );
  // Show validation errors inside the modal so they aren't hidden behind
  // the dim overlay. state.message is set by commitPrompt when input is
  // invalid (and cleared on each fresh openPrompt).
  if (state.message) {
    promptBody.add(
      new TextRenderable(renderer, {
        id: 'prompt-error',
        content: `! ${state.message}`,
        fg: COLORS.missing,
        height: 1,
        marginTop: 1,
        wrapMode: 'none'
      })
    );
  }

  if (p.kind === 'edit' || p.kind === 'add-value') {
    const secret = isSecretKey(p.key) && !state.showSecrets;
    const nameWidth = Math.min(
      26,
      Math.max(...matrix.files.map((f) => basename(f.path).length + 2))
    );

    promptBody.add(
      new TextRenderable(renderer, {
        id: 'prompt-table-header',
        content: 'Current values',
        fg: COLORS.fgSection,
        wrapMode: 'none',
        height: 1,
        marginTop: 1
      })
    );

    for (const file of matrix.files) {
      const isTarget = file === p.file;
      const row = new BoxRenderable(renderer, {
        id: `prompt-row-${file.path}`,
        flexDirection: 'row',
        height: 1,
        flexShrink: 0
      });
      row.add(
        new TextRenderable(renderer, {
          id: `prompt-row-${file.path}-name`,
          content: `${isTarget ? '▸' : ' '} ${basename(file.path)}`.padEnd(
            nameWidth
          ),
          fg: isTarget ? COLORS.fgBase : COLORS.fgDim,
          height: 1,
          wrapMode: 'none'
        })
      );
      const entry = findKvEntry(file, p.key);
      const current = entry ? formatValue(entry.value, secret) : '✗ missing';
      row.add(
        new TextRenderable(renderer, {
          id: `prompt-row-${file.path}-value`,
          content: current,
          fg: !entry ? COLORS.missing : isTarget ? COLORS.fg : COLORS.fgDim,
          height: 1,
          wrapMode: 'none'
        })
      );
      promptBody.add(row);
    }
  }
}
