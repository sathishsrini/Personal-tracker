import { describe, expect, it } from "vitest";
import { classifyQuadrant } from "../src/lib/domain/quadrant";

describe("classifyQuadrant", () => {
  it("classifies the four quadrants", () => {
    expect(classifyQuadrant(2, 9)).toBe("low-effort-high-impact");
    expect(classifyQuadrant(9, 9)).toBe("high-effort-high-impact");
    expect(classifyQuadrant(2, 2)).toBe("low-effort-low-impact");
    expect(classifyQuadrant(9, 2)).toBe("high-effort-low-impact");
  });

  it("returns null when effort or impact is missing", () => {
    expect(classifyQuadrant(null, 9)).toBeNull();
    expect(classifyQuadrant(5, null)).toBeNull();
  });
});
