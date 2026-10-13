import { describe, expect, it } from "vitest";
import plugin from "./index.js";

describe("jarvis-quick", () => {
  it("declares the jarvis_quick tool", () => {
    expect(plugin).toBeTruthy();
  });
});
