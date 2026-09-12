import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BLOCKED_API_PREFIXES, DEMO_BLOCKED_DASHBOARD_PREFIXES, isExpired, matchesPrefix, remainingSeconds } from "../src/lib/demo-policy";

test("blocks privileged demo pages and APIs", () => {
  assert.equal(matchesPrefix("/dashboard/staff", DEMO_BLOCKED_DASHBOARD_PREFIXES), true);
  assert.equal(matchesPrefix("/dashboard/staff/42", DEMO_BLOCKED_DASHBOARD_PREFIXES), true);
  assert.equal(matchesPrefix("/api/owner/payments/refunds", DEMO_BLOCKED_API_PREFIXES), true);
  assert.equal(matchesPrefix("/api/owner/plans/1", DEMO_BLOCKED_API_PREFIXES), true);
  assert.equal(matchesPrefix("/api/webhooks/payments/stripe", DEMO_BLOCKED_API_PREFIXES), true);
  assert.equal(matchesPrefix("/api/owner/order", DEMO_BLOCKED_API_PREFIXES), false);
});

test("remaining time never becomes negative", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  assert.equal(remainingSeconds(new Date("2026-09-10T12:01:00.000Z"), now), 60);
  assert.equal(remainingSeconds(new Date("2026-09-10T11:59:00.000Z"), now), 0);
});

test("expiry boundary is server-friendly and inclusive", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  assert.equal(isExpired(new Date("2026-09-10T12:00:00.000Z"), now), true);
  assert.equal(isExpired(new Date("2026-09-10T12:00:01.000Z"), now), false);
});
