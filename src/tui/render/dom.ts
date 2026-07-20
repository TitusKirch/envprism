import type { BoxRenderable } from '@opentui/core';

export function removeAllChildren(node: BoxRenderable): void {
  const children = [...node.getChildren()];
  for (const child of children) node.remove(child);
}
