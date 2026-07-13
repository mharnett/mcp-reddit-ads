import { describe, it, expect } from "vitest";
import { buildAdGroupCreateBody } from "./adGroupBody.js";

describe("buildAdGroupCreateBody", () => {
  const base = { campaignId: "t2_c1", name: "AG", startTime: "2026-01-01T00:00:00Z" };

  it("sends BIDLESS as bid_strategy with bid_type CPM (not bid_type=BIDLESS)", () => {
    const body = buildAdGroupCreateBody(base);
    expect(body.bid_type).toBe("CPM");
    expect(body.bid_strategy).toBe("BIDLESS");
    // No bid_value / bid_micro on a BIDLESS ad group.
    expect("bid_value" in body).toBe(false);
    expect("bid_micro" in body).toBe(false);
  });

  it("maps daily budget to goal_value (micros) and defaults status to PAUSED", () => {
    const body = buildAdGroupCreateBody({ ...base, goalValue: 20_000_000 });
    expect(body.goal_value).toBe(20_000_000);
    expect(body.configured_status).toBe("PAUSED");
  });

  it("passes targeting through unchanged (geolocations as string codes + keywords)", () => {
    const body = buildAdGroupCreateBody({
      ...base,
      target: { geolocations: ["US", "CA"], keywords: ["seo", "ppc"] },
    });
    expect(body.targeting.geolocations).toEqual(["US", "CA"]);
    expect(body.targeting.keywords).toEqual(["seo", "ppc"]);
  });

  it("includes view_through_conversion_type and optimization_goal when provided", () => {
    const body = buildAdGroupCreateBody({
      ...base,
      viewThroughConversionType: "SEVEN_DAY_CLICKS_ONE_DAY_VIEW",
      optimizationGoal: "LEAD",
    });
    expect(body.view_through_conversion_type).toBe("SEVEN_DAY_CLICKS_ONE_DAY_VIEW");
    expect(body.optimization_goal).toBe("LEAD");
  });

  it("omits optional fields when not provided", () => {
    const body = buildAdGroupCreateBody(base);
    expect("goal_value" in body).toBe(false);
    expect("end_time" in body).toBe(false);
    expect("targeting" in body).toBe(false);
    expect("view_through_conversion_type" in body).toBe(false);
    expect("optimization_goal" in body).toBe(false);
  });
});
