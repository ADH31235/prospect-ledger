// ============================================================
// ENRICHMENT PIPELINE
// Provider-agnostic: start on Apollo (cheap, decent NA/EU
// coverage), swap in Clay or Cognism later for better EMEA/
// Middle East/Asia depth without rewriting the pipeline.
//
// NOTE ON CLEARBIT: as of 2026 Clearbit no longer exists as a
// standalone API - it was folded into HubSpot Breeze
// Intelligence and requires a paid HubSpot subscription on top.
// Not included here; add a HubSpotBreezeProvider later only if
// you end up on HubSpot for other reasons.
// ============================================================

export interface RawLeadInput {
  full_name: string;
  email?: string;
  company?: string;
  linkedin_url?: string;
  country_hint?: string; // if you already know roughly where they are
}

export interface EnrichmentResult {
  full_name: string;
  email: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  country: string | null;
  employee_count: number | null;
  estimated_seniority: string | null; // 'c_suite','vp','director','manager','other'
  raw_provider_payload: Record<string, unknown>;
}

export interface EnrichmentProvider {
  name: string;
  enrich(input: RawLeadInput): Promise<EnrichmentResult | null>;
}

// ------------------------------------------------------------
// APOLLO PROVIDER
// Docs: https://docs.apollo.io/reference/people-enrichment
// ------------------------------------------------------------
export class ApolloProvider implements EnrichmentProvider {
  name = 'apollo';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async enrich(input: RawLeadInput): Promise<EnrichmentResult | null> {
    const body: Record<string, unknown> = {};
    if (input.email) body.email = input.email;
    if (input.full_name) {
      const parts = input.full_name.trim().split(/\s+/);
      body.first_name = parts[0];
      body.last_name = parts.slice(1).join(' ') || undefined;
    }
    if (input.company) body.organization_name = input.company;
    if (input.linkedin_url) body.linkedin_url = input.linkedin_url;

    const res = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error('Apollo enrichment failed', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const person = data?.person;
    if (!person) return null;

    return {
      full_name: person.name ?? input.full_name,
      email: person.email ?? null,
      company: person.organization?.name ?? null,
      job_title: person.title ?? null,
      linkedin_url: person.linkedin_url ?? null,
      country: person.country ?? null,
      employee_count: person.organization?.estimated_num_employees ?? null,
      estimated_seniority: mapApolloSeniority(person.seniority),
      raw_provider_payload: person,
    };
  }
}

function mapApolloSeniority(seniority?: string): string | null {
  if (!seniority) return null;
  const s = seniority.toLowerCase();
  if (['founder', 'owner', 'c_suite'].includes(s)) return 'c_suite';
  if (s === 'vp') return 'vp';
  if (s === 'director') return 'director';
  if (s === 'manager') return 'manager';
  return 'other';
}

// ------------------------------------------------------------
// CLAY PROVIDER (stub) — add when EMEA/Middle East volume
// justifies it. Clay is a waterfall over many sources, so one
// call can outperform Apollo alone in these regions.
// Docs: https://docs.clay.com
// ------------------------------------------------------------
export class ClayProvider implements EnrichmentProvider {
  name = 'clay';
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  async enrich(_input: RawLeadInput): Promise<EnrichmentResult | null> {
    throw new Error('ClayProvider not yet implemented — wire up when needed');
  }
}

// ------------------------------------------------------------
// PIPELINE ORCHESTRATION
// ------------------------------------------------------------

/**
 * Maps a raw enrichment result + inferred country into your
 * `net_worth_signal` heuristic and finds the matching
 * jurisdiction row so the compliance gate can apply.
 */
function inferNetWorthSignal(result: EnrichmentResult): string {
  if (result.estimated_seniority === 'c_suite') return 'senior_exec';
  if (result.estimated_seniority === 'vp' && (result.employee_count ?? 0) > 500) {
    return 'senior_exec';
  }
  return 'unknown';
}

/**
 * Runs enrichment, resolves jurisdiction, and upserts into
 * Supabase. Call this from a queue worker or a Supabase Edge
 * Function triggered on lead insert.
 */
export async function enrichAndStoreLead(
  supabase: any,
  provider: EnrichmentProvider,
  leadId: string,
  input: RawLeadInput
) {
  const result = await provider.enrich(input);

  if (!result) {
    await supabase
      .from('leads')
      .update({ stage: 'new', notes: `Enrichment via ${provider.name} returned no match` })
      .eq('id', leadId);
    return null;
  }

  // Resolve jurisdiction by country name (simple exact match —
  // swap for a proper country-code lookup as your jurisdictions
  // table grows).
  let jurisdictionId: string | null = null;
  if (result.country) {
    const { data: jurisdiction } = await supabase
      .from('jurisdictions')
      .select('id')
      .ilike('country', result.country)
      .maybeSingle();
    jurisdictionId = jurisdiction?.id ?? null;
  }

  const { error } = await supabase
    .from('leads')
    .update({
      email: result.email,
      company: result.company,
      job_title: result.job_title,
      linkedin_url: result.linkedin_url,
      jurisdiction_id: jurisdictionId,
      net_worth_signal: inferNetWorthSignal(result),
      stage: 'enriched',
      notes: `Enriched via ${provider.name}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) throw error;

  return result;
}

// ------------------------------------------------------------
// BATCH RUNNER
// Pull all leads in 'new' stage and enrich them, with basic
// rate limiting so you don't blow through API quotas.
// ------------------------------------------------------------
export async function runEnrichmentBatch(
  supabase: any,
  provider: EnrichmentProvider,
  batchSize = 25,
  delayMs = 500
) {
  const { data: newLeads, error } = await supabase
    .from('leads')
    .select('id, full_name, email, company, linkedin_url')
    .eq('stage', 'new')
    .limit(batchSize);

  if (error) throw error;
  if (!newLeads?.length) return { processed: 0 };

  let processed = 0;
  for (const lead of newLeads) {
    try {
      await enrichAndStoreLead(supabase, provider, lead.id, {
        full_name: lead.full_name,
        email: lead.email,
        company: lead.company,
        linkedin_url: lead.linkedin_url,
      });
      processed++;
    } catch (err) {
      console.error(`Failed to enrich lead ${lead.id}`, err);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return { processed };
}
