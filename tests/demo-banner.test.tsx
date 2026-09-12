import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import DemoBanner from "../src/components/demo/DemoBanner";

test("banner first render is stable despite server/client clock drift", () => {
  const original = Date.now;
  try {
    Date.now = () => 100000;
    const first = renderToString(<DemoBanner expiresAt="2099-01-01T00:00:00Z" />);
    Date.now = () => 107000;
    const second = renderToString(<DemoBanner expiresAt="2099-01-01T00:00:00Z" />);
    assert.equal(first, second);
    assert.ok(first.includes("--:--"));
  } finally { Date.now = original; }
});
