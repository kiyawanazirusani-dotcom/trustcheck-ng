import { describe, it, expect } from "vitest";

// T1.7 — trivial smoke test so `pnpm test:run` has something to run before the
// rules engine exists.
describe("smoke", () => {
  it("adds up", () => {
    expect(1 + 1).toBe(2);
  });
});
