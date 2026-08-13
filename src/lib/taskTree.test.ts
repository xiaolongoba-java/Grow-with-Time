import { describe, expect, it } from "vitest";
import { expandIdsWithChildren, selectRestoreIds } from "./taskTree";

describe("expandIdsWithChildren", () => {
  it("includes nested children of selected parents", () => {
    const rows = [
      { id: "p", parent_id: null },
      { id: "c1", parent_id: "p" },
      { id: "c2", parent_id: "c1" },
      { id: "other", parent_id: null },
    ];
    expect([...expandIdsWithChildren(["p"], rows)].sort()).toEqual(["c1", "c2", "p"]);
  });
});

it("restores only descendants deleted in the selected deletion batch", () => {
  expect(selectRestoreIds(
    [{ id: "parent", deleted_at: "2026-08-13T10:00:00Z" }],
    [
      { id: "parent", deleted_at: "2026-08-13T10:00:00Z" },
      { id: "same-batch", deleted_at: "2026-08-13T10:00:00Z" },
      { id: "older-delete", deleted_at: "2026-08-12T10:00:00Z" },
    ],
  )).toEqual(["parent", "same-batch"]);
});
