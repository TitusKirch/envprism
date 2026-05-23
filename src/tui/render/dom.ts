import type { BoxRenderable } from '@opentui/core';

export function removeAllChildren(node: BoxRenderable): void {
  const ids = node.getChildren().map((c) => c.id);
  for (const id of ids) node.remove(id);
}
