import assert from "node:assert/strict";
import test from "node:test";
import { assertInventoryReferences, InventoryReferenceError, optionalPositiveId } from "../src/lib/inventory-security";

test("optional inventory references validate IDs", () => {
  assert.equal(optionalPositiveId("12"), 12);
  assert.equal(optionalPositiveId(null), null);
  for (const id of [-1, 0, 1.5, "invalid"]) assert.throws(() => optionalPositiveId(id), InventoryReferenceError);
});

test("inventory reference queries include the authenticated restaurant", async () => {
  const calls: unknown[] = [];
  const tx = {
    category: { findFirst: async (args: unknown) => { calls.push(args); return { id: 2 }; } },
    supplier: { findFirst: async (args: unknown) => { calls.push(args); return { id: 3 }; } },
  };
  await assertInventoryReferences(tx as never, 7, 2, 3);
  assert.deepEqual(calls, [
    { where: { id: 2, restaurantId: 7 }, select: { id: true } },
    { where: { id: 3, restaurantId: 7 }, select: { id: true } },
  ]);
});

test("foreign category and supplier references are independently rejected", async () => {
  for (const missing of ["category", "supplier"]) {
    const tx = {
      category: { findFirst: async () => missing === "category" ? null : { id: 2 } },
      supplier: { findFirst: async () => missing === "supplier" ? null : { id: 3 } },
    };
    await assert.rejects(assertInventoryReferences(tx as never, 7, 2, 3), InventoryReferenceError);
  }
});
