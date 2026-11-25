import type { BaseRenderable } from '@opentui/core';

/**
 * Anything that holds children — a renderable, or a ScrollBox's `content`
 * facade, which since opentui 0.9 is no renderable of its own.
 */
interface ChildHost {
  getChildren(): BaseRenderable[];
  remove(child: BaseRenderable): void;
}

export function removeAllChildren(node: ChildHost): void {
  const children = [...node.getChildren()];
  for (const child of children) node.remove(child);
}
