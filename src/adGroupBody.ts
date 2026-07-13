// Ad-group create-body builder, extracted from RedditAdsManager so the BIDLESS /
// goal_value / targeting shaping is unit-testable (index.ts has import-time side
// effects — server bootstrap — and can't be imported by tests).
//
// Reddit Ads API v3 quirks this encodes:
//   - BIDLESS ad groups must send `bid_type: "CPM"` + `bid_strategy: "BIDLESS"`
//     as separate fields. Passing the strategy as `bid_type` is rejected.
//   - Daily budget travels as `goal_value` (micros), not `bid_value`.

export interface AdGroupCreateInput {
  campaignId: string;
  name: string;
  goalValue?: number;
  startTime: string;
  endTime?: string;
  target?: Record<string, any>;
  configuredStatus?: string;
  optimizationGoal?: string;
  viewThroughConversionType?: string;
}

export function buildAdGroupCreateBody(data: AdGroupCreateInput): Record<string, any> {
  const body: Record<string, any> = {
    campaign_id: data.campaignId,
    name: data.name,
    bid_type: "CPM",
    bid_strategy: "BIDLESS",
    start_time: data.startTime,
    configured_status: data.configuredStatus || "PAUSED",
  };
  if (data.goalValue) body.goal_value = data.goalValue;
  if (data.endTime) body.end_time = data.endTime;
  if (data.target) body.targeting = data.target;
  if (data.optimizationGoal) body.optimization_goal = data.optimizationGoal;
  if (data.viewThroughConversionType) body.view_through_conversion_type = data.viewThroughConversionType;
  return body;
}
