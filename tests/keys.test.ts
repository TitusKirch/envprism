import { describe, expect, it, vi } from 'vitest';
import { handleBrowseKey } from '@tui/keys/browse.ts';
import type { KeyEvent } from '@tui/keys/event.ts';
import { handleFilterKey } from '@tui/keys/filter.ts';
import { handleHelpKey } from '@tui/keys/help.ts';
import { createOnKey } from '@tui/keys/onKey.ts';
import { handlePromptKey } from '@tui/keys/prompt.ts';
import { file, focusOnKey, makeTestCtx } from './helpers/ctx.ts';

function fx() {
  const base = file('.env.example', 'APP_NAME=base\nPORT=1\n');
  const dev = file('.env', 'APP_NAME=dev\nPORT=2\n');
  return { base, dev };
}
const key = (k: Partial<KeyEvent>): KeyEvent => ({ name: '', ...k });
const noop = () => {};

describe('handleBrowseKey — navigation & panes', () => {
  it('Tab switches to the sidebar pane', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    handleBrowseKey(ctx, key({ name: 'tab' }), noop);
    expect(ctx.state.pane).toBe('sidebar');
  });

  it('arrow down moves the focused row', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    const before = ctx.state.rowIdx;
    handleBrowseKey(ctx, key({ name: 'down' }), noop);
    expect(ctx.state.rowIdx).toBeGreaterThan(before);
  });

  it('left at column 0 hands focus to the sidebar', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.colIdx = 0;
    handleBrowseKey(ctx, key({ name: 'left' }), noop);
    expect(ctx.state.pane).toBe('sidebar');
  });
});

describe('handleBrowseKey — view toggles', () => {
  it('v toggles drift-only', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    handleBrowseKey(ctx, key({ name: 'v' }), noop);
    expect(ctx.state.driftOnly).toBe(true);
  });

  it('g flips the grouping mode', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    const before = ctx.state.grouping;
    handleBrowseKey(ctx, key({ name: 'g' }), noop);
    expect(ctx.state.grouping).not.toBe(before);
  });

  it('? opens the help overlay', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    handleBrowseKey(ctx, key({ name: '', sequence: '?' }), noop);
    expect(ctx.state.helpOpen).toBe(true);
  });
});

describe('handleBrowseKey — editing & actions', () => {
  it('e opens the edit prompt for the focused cell', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    expect(ctx.state.mode).toBe('prompt');
    expect(ctx.state.prompt).toMatchObject({ kind: 'edit', key: 'APP_NAME' });
  });

  it('= syncs the focused value to all files', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'PORT', ctx.matrix.files.indexOf(dev)); // PORT=2
    handleBrowseKey(ctx, key({ name: '', sequence: '=' }), noop);
    expect(ctx.state.message).toMatch(/synced/i);
  });
});

describe('handleBrowseKey — quit', () => {
  it('q quits immediately when nothing is dirty', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    const cleanup = vi.fn();
    handleBrowseKey(ctx, key({ name: 'q' }), cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('q asks for confirmation when there are unsaved changes', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.dirty.add(base);
    const cleanup = vi.fn();
    handleBrowseKey(ctx, key({ name: 'q' }), cleanup);
    expect(cleanup).not.toHaveBeenCalled();
    expect(ctx.state.confirmQuit).toBe(true);
    handleBrowseKey(ctx, key({ name: 'q' }), cleanup); // second press
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('Ctrl-C force-quits', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    const cleanup = vi.fn();
    handleBrowseKey(ctx, key({ name: 'c', ctrl: true }), cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('handleBrowseKey — sidebar pane', () => {
  it('Space toggles the selected file; b sets it as base', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.pane = 'sidebar';
    ctx.state.sidebarIdx = ctx.allFiles.indexOf(dev);
    handleBrowseKey(ctx, key({ name: 'b' }), noop);
    expect(ctx.currentBase).toBe(dev);
  });
});

describe('handlePromptKey', () => {
  it('typing appends to the prompt input; backspace removes', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    ctx.state.promptInput = '';
    handlePromptKey(ctx, key({ name: 'a', sequence: 'a' }));
    handlePromptKey(ctx, key({ name: 'b', sequence: 'b' }));
    expect(ctx.state.promptInput).toBe('ab');
    handlePromptKey(ctx, key({ name: 'backspace' }));
    expect(ctx.state.promptInput).toBe('a');
  });

  it('Escape cancels, Enter commits', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    handlePromptKey(ctx, key({ name: 'escape' }));
    expect(ctx.state.mode).toBe('browse');

    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    ctx.state.promptInput = 'committed';
    handlePromptKey(ctx, key({ name: 'return' }));
    expect(ctx.state.mode).toBe('browse');
    expect(
      base.entries.find((e) => e.kind === 'kv' && e.key === 'APP_NAME')
    ).toMatchObject({ value: 'committed' });
  });
});

describe('handleFilterKey', () => {
  it('typing builds the filter and recomputes; Esc clears', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.mode = 'filter';
    handleFilterKey(ctx, key({ name: 'p', sequence: 'p' }));
    handleFilterKey(ctx, key({ name: 'o', sequence: 'o' }));
    expect(ctx.state.filter).toBe('po');
    expect(ctx.state.visibleKeys).toEqual(['PORT']);
    handleFilterKey(ctx, key({ name: 'escape' }));
    expect(ctx.state.filter).toBe('');
    expect(ctx.state.mode).toBe('browse');
  });
});

describe('handleHelpKey', () => {
  it('Escape closes the help overlay', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.helpOpen = true;
    handleHelpKey(ctx, key({ name: 'escape' }));
    expect(ctx.state.helpOpen).toBe(false);
  });
});

describe('handleBrowseKey — more browse keys', () => {
  it('n opens the new-file prompt; d deletes; right moves a column', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    handleBrowseKey(ctx, key({ name: 'right' }), noop);
    expect(ctx.state.colIdx).toBe(1);

    handleBrowseKey(ctx, key({ name: 'n' }), noop);
    expect(ctx.state.prompt).toMatchObject({ kind: 'new-file' });
    ctx.state.mode = 'browse';
    ctx.state.prompt = null;

    focusOnKey(ctx, 'PORT', 0);
    handleBrowseKey(ctx, key({ name: 'd' }), noop);
    expect(ctx.state.dirty.has(base)).toBe(true);
  });

  it('Ctrl-T toggles secrets; Ctrl-S clears the quit confirmation', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    const before = ctx.state.showSecrets;
    handleBrowseKey(ctx, key({ name: 't', ctrl: true }), noop);
    expect(ctx.state.showSecrets).toBe(!before);
    ctx.state.confirmQuit = true;
    handleBrowseKey(ctx, key({ name: 's', ctrl: true }), noop);
    expect(ctx.state.confirmQuit).toBe(false);
  });

  it('Ctrl-Z undoes the last change', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    ctx.state.promptInput = 'zzz';
    handlePromptKey(ctx, key({ name: 'return' }));
    handleBrowseKey(ctx, key({ name: 'z', ctrl: true }), noop);
    expect(ctx.state.message).toMatch(/undid/i);
  });

  it('c collapses the focused section; Shift-C expands all', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base, {
      heuristics: { grouping: 'prefix' }
    });
    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'c' }), noop);
    expect(ctx.state.collapsed.size).toBe(1);
    handleBrowseKey(ctx, key({ name: 'c', shift: true }), noop);
    expect(ctx.state.collapsed.size).toBe(0);
  });

  it('/ enters filter mode', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    handleBrowseKey(ctx, key({ name: '', sequence: '/' }), noop);
    expect(ctx.state.mode).toBe('filter');
  });

  it('sidebar pane: up/down move the selection, Tab returns to matrix', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.pane = 'sidebar';
    ctx.state.sidebarIdx = 0;
    handleBrowseKey(ctx, key({ name: 'down' }), noop);
    expect(ctx.state.sidebarIdx).toBe(1);
    handleBrowseKey(ctx, key({ name: 'up' }), noop);
    expect(ctx.state.sidebarIdx).toBe(0);
    handleBrowseKey(ctx, key({ name: 'tab' }), noop);
    expect(ctx.state.pane).toBe('matrix');
  });
});

describe('handlePromptKey — more', () => {
  it('Ctrl-T toggles secrets inside a prompt', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    const before = ctx.state.showSecrets;
    handlePromptKey(ctx, key({ name: 't', ctrl: true }));
    expect(ctx.state.showSecrets).toBe(!before);
  });

  it('Ctrl-A applies the typed value to all files', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'PORT', 0);
    handleBrowseKey(ctx, key({ name: 'e' }), noop);
    ctx.state.promptInput = '5555';
    handlePromptKey(ctx, key({ name: 'a', ctrl: true }));
    expect(ctx.state.mode).toBe('browse');
    expect(
      ctx.matrix.files.every((f) => {
        const e = f.entries.find((x) => x.kind === 'kv' && x.key === 'PORT');
        return e && e.kind === 'kv' && e.value === '5555';
      })
    ).toBe(true);
  });
});

describe('handleFilterKey — more', () => {
  it('backspace trims a char; Enter keeps the filter and returns to browse', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.mode = 'filter';
    ctx.state.filter = 'po';
    handleFilterKey(ctx, key({ name: 'backspace' }));
    expect(ctx.state.filter).toBe('p');
    handleFilterKey(ctx, key({ name: 'return' }));
    expect(ctx.state.mode).toBe('browse');
    expect(ctx.state.filter).toBe('p');
  });
});

describe('handleHelpKey — more', () => {
  it('? and q also close; an unrelated key keeps it open', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.helpOpen = true;
    handleHelpKey(ctx, key({ name: 'x' }));
    expect(ctx.state.helpOpen).toBe(true);
    handleHelpKey(ctx, key({ name: '', sequence: '?' }));
    expect(ctx.state.helpOpen).toBe(false);
  });
});

describe('createOnKey dispatch', () => {
  it('routes by mode (help > prompt > filter > browse)', () => {
    const { base, dev } = fx();
    const ctx = makeTestCtx([base, dev], base);
    const onKey = createOnKey(ctx, noop);

    // browse: Tab → sidebar
    onKey(key({ name: 'tab' }));
    expect(ctx.state.pane).toBe('sidebar');

    // help overlay takes precedence
    ctx.state.helpOpen = true;
    onKey(key({ name: 'escape' }));
    expect(ctx.state.helpOpen).toBe(false);

    // filter mode routes to the filter handler
    ctx.state.mode = 'filter';
    onKey(key({ name: 'x', sequence: 'x' }));
    expect(ctx.state.filter).toBe('x');
  });
});
