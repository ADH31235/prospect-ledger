// ============================================================
// LEAD SCORING MODULE
// Weighted scoring model, pulls weights from scoring_criteria
// table so you can tune it without redeploying code.
// ============================================================

export interface Lead {
  id: string;
  net_worth_signal: string | null;
  estimated_investable_assets: number | null;
  liquidity_event: string | null;
  liquidity_event_date: string | null;
  existing_advisor: boolean | null;
  source: string | null;
  jurisdiction_solicitation_risk: 'low' | 'review_required' | 'do_not_contact' | null;
}

export interface ScoringCriterion {
  criterion_key: string;
  weight: number;
  active: boolean;
}

/**
 * Calculates a 0-100ish lead score. Higher = better fit and
 * lower compliance friction. This intentionally keeps the
 * logic transparent (no black-box ML) since you'll want to
 * explain scores to yourself, and later to other advisors if
 * you license this out.
 */
export function scoreLead(lead: Lead, criteria: ScoringCriterion[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  const weights = Object.fromEntries(
    criteria.filter(c => c.active).map(c => [c.criterion_key, c.weight])
  );

  const breakdown: Record<string, number> = {};

  // Liquidity event recency
  if (lead.liquidity_event && lead.liquidity_event !== 'none' && lead.liquidity_event_date) {
    const monthsAgo =
      (Date.now() - new Date(lead.liquidity_event_date).getTime()) /
      (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo <= 12) {
      breakdown['liquidity_event_recent'] = weights['liquidity_event_recent'] ?? 0;
    }
  }

  // Net worth confidence
  if (
    lead.net_worth_signal &&
    ['exited_founder', 'senior_exec', 'inherited_wealth'].includes(lead.net_worth_signal) &&
    (lead.estimated_investable_assets ?? 0) >= 1_000_000
  ) {
    breakdown['net_worth_high_confidence'] = weights['net_worth_high_confidence'] ?? 0;
  }

  // No existing advisor
  if (lead.existing_advisor === false) {
    breakdown['no_existing_advisor'] = weights['no_existing_advisor'] ?? 0;
  }

  // Warm referral
  if (lead.source === 'referral') {
    breakdown['warm_referral'] = weights['warm_referral'] ?? 0;
  }

  // Jurisdiction risk — this is a fit signal AND a compliance gate.
  // A lead in a 'do_not_contact' jurisdiction should never reach
  // a positive score regardless of other signals.
  if (lead.jurisdiction_solicitation_risk === 'do_not_contact') {
    return { score: 0, breakdown: { blocked_jurisdiction: 0 } };
  }
  if (lead.jurisdiction_solicitation_risk === 'low') {
    breakdown['jurisdiction_low_risk'] = weights['jurisdiction_low_risk'] ?? 0;
  }

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { score, breakdown };
}

/**
 * Convenience wrapper: fetch a lead + jurisdiction + active
 * criteria from Supabase and return a score. Wire this into a
 * Supabase Edge Function or a scheduled job that re-scores
 * leads as new enrichment data comes in.
 */
export async function scoreLeadFromSupabase(supabase: any, leadId: string) {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*, jurisdictions(solicitation_risk)')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) throw leadErr ?? new Error('Lead not found');

  const { data: criteria, error: critErr } = await supabase
    .from('scoring_criteria')
    .select('criterion_key, weight, active')
    .eq('active', true);

  if (critErr) throw critErr;

  const result = scoreLead(
    {
      ...lead,
      jurisdiction_solicitation_risk: lead.jurisdictions?.solicitation_risk ?? null,
    },
    criteria
  );

  await supabase
    .from('leads')
    .update({ score: result.score, updated_at: new Date().toISOString() })
    .eq('id', leadId);

  return result;
}
