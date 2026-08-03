// Every param a Meta/Google ad click can carry, captured verbatim
// so campaigns/adsets/ads/placements can be attributed later —
// mirrors the standard Meta Ads Manager tracking template.
export const TRACKED_PARAMS = [
  "campaign_name", "adset_name", "ad_name", "placement",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "fbclid", "gclid",
];

export function captureAdTracking() {
  const params = new URLSearchParams(window.location.search);
  const tracking: Record<string, string> = {};
  for (const key of TRACKED_PARAMS) {
    const value = params.get(key);
    if (value) tracking[key] = value;
  }
  return tracking;
}
