export function expandIdsWithChildren(
  ids: string[],
  rows: { id: string; parent_id: string | null }[],
): string[] {
  const selected = new Set(ids);
  const byParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = byParent.get(row.parent_id) ?? [];
    list.push(row.id);
    byParent.set(row.parent_id, list);
  }
  const stack = [...selected];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of byParent.get(current) ?? []) {
      if (selected.has(child)) continue;
      selected.add(child);
      stack.push(child);
    }
  }
  return [...selected];
}

export function selectRestoreIds(
  rootRows: { id: string; deleted_at: string | null }[],
  familyRows: { id: string; deleted_at: string | null }[],
): string[] {
  const stamps = new Set(
    rootRows.map((row) => row.deleted_at).filter((value): value is string => Boolean(value)),
  );
  return familyRows
    .filter((row) => row.deleted_at && stamps.has(row.deleted_at))
    .map((row) => row.id);
}
