import { describe, it, expect } from "vitest";
import { safeResponse, withResilience } from "./resilience.js";

describe("safeResponse", () => {
  it("returns small data unchanged", () => {
    const data = { name: "test", count: 100 };
    expect(safeResponse(data, "test")).toEqual(data);
  });

  it("truncates large arrays", () => {
    const large = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      x: "y".repeat(100),
    }));
    const result = safeResponse(large, "test");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(large.length / 2);
  });

  it("truncates large rows in objects", () => {
    const obj = {
      rows: Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        data: "x".repeat(200),
      })),
      row_count: 5000,
    };
    const result = safeResponse(obj, "test");
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows.length).toBeLessThanOrEqual(2500);
    expect((result as any).truncated).toBe(true);
    expect(result.row_count).toBe(result.rows.length);
  });
});

describe("withResilience", () => {
  it("succeeds on first attempt", async () => {
    const fn = async () => ({ success: true });
    const result = await withResilience(fn, "test");
    expect(result).toEqual({ success: true });
  });

  it("retries on transient failure", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) throw new Error("500 Internal Server Error");
      return { success: true };
    };
    const result = await withResilience(fn, "test");
    expect(result).toEqual({ success: true });
    expect(attempts).toBe(2);
  });

  it("fails after max retries", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("500 Server Error");
    };
    await expect(withResilience(fn, "test")).rejects.toThrow("Server Error");
    expect(attempts).toBe(4);
  });
});
