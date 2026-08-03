import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { scoreLeadFromSupabase, scoreLead } from "./scoring";

// ============================================================
// Maps a Supabase row (leads joined with jurisdictions and
// licenses) into the shape LeadDashboard.jsx expects. Keeping
// this mapping in one place means the UI component never has
// to know about snake_case columns or foreign key joins.
// ============================================================
function mapRow(row: any) {
  return {
    id: row.id,
    name: row.full_name,
    title: row.job_title ?? "—",
    company: row.company ?? "—",
    email: row.email ?? "",
    phone: row.phone ?? "",
    linkedinUrl: row.linkedin_url ?? "",
    jurisdiction: row.jurisdiction_id ?? null, // key into the jurisdictions map below
    stage: row.stage,
    score: row.score ?? 0,
    netWorth: row.net_worth_signal,
    assets: row.estimated_investable_assets,
    liquidityEvent: row.liquidity_event ?? "none",
    liquidityDate: row.liquidity_event_date,
    source: row.source,
    referredBy: row.referred_by ?? "",
    existingAdvisor: row.existing_advisor,
    currentInvestmentProducts: row.current_investment_products ?? "",
    currentProvider: row.current_provider ?? "",
    riskProfile: row.risk_profile ?? "",
    preferredContactMethod: row.preferred_contact_method ?? "",
    nextFollowUpDate: row.next_follow_up_date ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    optedOut: row.opted_out ?? false,
    optedOutAt: row.opted_out_at ?? null,
    lastContact: row.last_contact_at ?? null, // add this column, or derive from outreach_events
    createdAt: row.created_at ?? null,
    adTracking: row.ad_tracking ?? null,
    notes: row.notes ?? "",
  };
}

export function useLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [jurisdictions, setJurisdictions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);

    // Fetch the FULL jurisdictions list independently — this must
    // not depend on leads already existing, or a fresh account with
    // zero leads would show zero jurisdiction options (a circular
    // bug: can't add a lead with a jurisdiction until leads exist).
    const { data: allJurisdictions, error: jError } = await supabase
      .from("jurisdictions")
      .select("id, country, region, solicitation_risk")
      .order("country", { ascending: true });

    if (jError) {
      setError(jError.message);
      setLoading(false);
      return;
    }

    const jMap: Record<string, any> = {};
    for (const j of allJurisdictions ?? []) {
      jMap[j.id] = {
        country: j.country,
        region: j.region,
        risk: j.solicitation_risk,
        license: null, // filled in below per-lead if a license is attached
      };
    }
    setJurisdictions(jMap);

    const { data, error } = await supabase
      .from("leads")
      .select(
        `*, jurisdictions ( id ), licenses ( entity_name, code )`
      )
      .order("score", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLeads((data ?? []).map(mapRow));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();

    // Realtime: reflect changes made elsewhere (e.g. the
    // enrichment pipeline updating a lead) without a manual
    // refresh. Requires: alter publication supabase_realtime
    // add table leads;  (run once in the Supabase SQL editor)
    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  const updateStage = useCallback(async (id: string, stage: string) => {
    // Optimistic update so the UI feels instant
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
    const { error } = await supabase
      .from("leads")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Failed to update stage", error);
      fetchLeads(); // revert to server truth on failure
    }
  }, [fetchLeads]);

  const updateNotes = useCallback(async (id: string, notes: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, notes } : l)));
    const { error } = await supabase
      .from("leads")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Failed to update notes", error);
      fetchLeads();
    }
  }, [fetchLeads]);

  /**
   * Manual lead entry. Inserts at stage 'new' — same entry point
   * the enrichment pipeline uses, so a manually-added lead flows
   * through enrich -> score -> review -> sequence exactly like
   * one sourced via Apollo would.
   */
  const addLead = useCallback(async (input: {
    full_name: string;
    email?: string;
    phone?: string;
    linkedin_url?: string;
    company?: string;
    job_title?: string;
    jurisdiction_id?: string | null;
    net_worth_signal?: string;
    estimated_investable_assets?: number | null;
    liquidity_event?: string;
    liquidity_event_date?: string | null;
    existing_advisor?: boolean | null;
    current_investment_products?: string;
    current_provider?: string;
    risk_profile?: string;
    preferred_contact_method?: string;
    next_follow_up_date?: string | null;
    date_of_birth?: string | null;
    source?: string;
    referred_by?: string;
    notes?: string;
  }) => {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        full_name: input.full_name,
        email: input.email || null,
        phone: input.phone || null,
        linkedin_url: input.linkedin_url || null,
        company: input.company || null,
        job_title: input.job_title || null,
        jurisdiction_id: input.jurisdiction_id || null,
        net_worth_signal: input.net_worth_signal || "unknown",
        estimated_investable_assets: input.estimated_investable_assets ?? null,
        liquidity_event: input.liquidity_event || "none",
        liquidity_event_date: input.liquidity_event_date || null,
        existing_advisor: input.existing_advisor ?? null,
        current_investment_products: input.current_investment_products || null,
        current_provider: input.current_provider || null,
        risk_profile: input.risk_profile || null,
        preferred_contact_method: input.preferred_contact_method || null,
        next_follow_up_date: input.next_follow_up_date || null,
        date_of_birth: input.date_of_birth || null,
        source: input.source || "manual",
        referred_by: input.referred_by || null,
        notes: input.notes || null,
        stage: "new",
      })
      .select()
      .single();

    if (error) throw error;
    // Score immediately — a lead should never sit at the default 0
    // score just because nothing happened to trigger scoring yet.
    try {
      await scoreLeadFromSupabase(supabase, data.id);
    } catch (scoreErr) {
      console.error("Scoring failed for new lead", scoreErr);
    }
    await fetchLeads();
    return data;
  }, [fetchLeads]);

  /**
   * Deletes a lead permanently. Cascades to related
   * scheduled_sends/enrollments via the schema's ON DELETE CASCADE.
   */
  const deleteLead = useCallback(async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete lead", error);
      fetchLeads(); // restore if the delete actually failed
    }
  }, [fetchLeads]);

  /**
   * Adds a new jurisdiction on the fly (the "Other" option in the
   * Add Lead form). Always created as review_required — a
   * jurisdiction added ad hoc has definitionally not been reviewed,
   * regardless of who's adding it or why.
   */
  const addJurisdiction = useCallback(async (country: string) => {
    const { data, error } = await supabase
      .from("jurisdictions")
      .insert({
        country,
        region: "Other",
        solicitation_risk: "review_required",
        review_notes: "Added manually via Add Lead form — not yet reviewed",
      })
      .select()
      .single();
    if (error) throw error;
    await fetchLeads();
    return data;
  }, [fetchLeads]);

  /**
   * Bulk insert for Excel/CSV import. Every row lands at stage
   * 'new', same as addLead — so imported prospects flow through
   * the same enrich -> score -> review -> sequence pipeline.
   * Returns { inserted, failed } rather than throwing on a partial
   * failure, since one bad row in a 200-row import shouldn't lose
   * the other 199.
   */
  const bulkAddLeads = useCallback(async (rows: Array<Record<string, any>>) => {
    const prepared = rows
      .filter((r) => r.full_name && String(r.full_name).trim())
      .map((r) => ({
        full_name: String(r.full_name).trim(),
        email: r.email || null,
        phone: r.phone || null,
        linkedin_url: r.linkedin_url || null,
        company: r.company || null,
        job_title: r.job_title || null,
        jurisdiction_id: r.jurisdiction_id || null,
        net_worth_signal: r.net_worth_signal || "unknown",
        estimated_investable_assets: r.estimated_investable_assets
          ? Number(r.estimated_investable_assets)
          : null,
        liquidity_event: r.liquidity_event || "none",
        source: r.source || "import",
        referred_by: r.referred_by || null,
        notes: r.notes || null,
        stage: "new",
      }));

    if (!prepared.length) return { inserted: 0, failed: 0 };

    const { data, error } = await supabase.from("leads").insert(prepared).select();
    if (error) {
      console.error("Bulk import failed", error);
      return { inserted: 0, failed: prepared.length, error: error.message };
    }

    // Score all imported rows in one batch — see recalculateAllScores
    // for why this isn't a per-row loop (avoids a refetch-storm from
    // the realtime subscription on larger imports).
    if (data?.length) {
      const ids = data.map((r: any) => r.id);
      const { data: insertedWithJurisdiction } = await supabase
        .from("leads")
        .select("*, jurisdictions(solicitation_risk)")
        .in("id", ids);
      const { data: criteria } = await supabase
        .from("scoring_criteria")
        .select("criterion_key, weight, active")
        .eq("active", true);

      const updates = (insertedWithJurisdiction ?? []).map((lead: any) => {
        const { score } = scoreLead(
          { ...lead, jurisdiction_solicitation_risk: lead.jurisdictions?.solicitation_risk ?? null },
          criteria ?? []
        );
        return { id: lead.id, score };
      });
      if (updates.length) {
        await supabase.from("leads").upsert(updates, { onConflict: "id" });
      }
    }
    await fetchLeads();
    return { inserted: data?.length ?? 0, failed: prepared.length - (data?.length ?? 0) };
  }, [fetchLeads]);

  /**
   * Generic detail update — used by the drawer's "Edit details"
   * mode to save several fields at once (jurisdiction, contact
   * info, investment products, etc.) in a single write, rather
   * than one round-trip per field.
   */
  const updateLeadDetails = useCallback(async (id: string, fields: Record<string, any>) => {
    const { error } = await supabase
      .from("leads")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    // Re-score: editing jurisdiction, net worth signal, liquidity
    // event, etc. all change what the score should be.
    try {
      await scoreLeadFromSupabase(supabase, id);
    } catch (scoreErr) {
      console.error("Re-scoring failed after detail edit", scoreErr);
    }
    await fetchLeads();
  }, [fetchLeads]);

  /**
   * Recalculates scores for every lead in one pass — for the
   * backlog of leads that existed before scoring was wired in
   * everywhere else, or if you ever change the scoring weights
   * and want everything re-evaluated against the new criteria.
   *
   * Deliberately a single fetch + single batch write, not a loop
   * of per-lead updates — updating leads one at a time triggers
   * the realtime subscription to refetch the whole list after
   * EVERY row, which on 50+ leads shows up as the screen
   * flickering "Loading ledger" over and over.
   */
  /**
   * Assigns one jurisdiction to many leads in a single write,
   * then re-scores all of them in one batch (same reasoning as
   * recalculateAllScores — avoids a per-row realtime refetch storm).
   */
  const bulkAssignJurisdiction = useCallback(async (ids: string[], jurisdictionId: string) => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("leads")
      .update({ jurisdiction_id: jurisdictionId, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;

    const { data: updatedLeads } = await supabase
      .from("leads")
      .select("*, jurisdictions(solicitation_risk)")
      .in("id", ids);
    const { data: criteria } = await supabase
      .from("scoring_criteria")
      .select("criterion_key, weight, active")
      .eq("active", true);

    const updates = (updatedLeads ?? []).map((lead: any) => {
      const { score } = scoreLead(
        { ...lead, jurisdiction_solicitation_risk: lead.jurisdictions?.solicitation_risk ?? null },
        criteria ?? []
      );
      return { id: lead.id, score };
    });
    if (updates.length) {
      await supabase.from("leads").upsert(updates, { onConflict: "id" });
    }

    await fetchLeads();
  }, [fetchLeads]);

  /**
   * Deletes many leads at once — same multi-select flow as bulk
   * jurisdiction assignment, since once you're selecting a batch
   * to fix, you'll likely also want to clear out obvious junk
   * rows from an import at the same time.
   */
  const bulkDeleteLeads = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) throw error;
    await fetchLeads();
  }, [fetchLeads]);

  const recalculateAllScores = useCallback(async () => {
    const { data: allLeads, error } = await supabase
      .from("leads")
      .select("*, jurisdictions(solicitation_risk)");
    if (error) throw error;

    const { data: criteria, error: critErr } = await supabase
      .from("scoring_criteria")
      .select("criterion_key, weight, active")
      .eq("active", true);
    if (critErr) throw critErr;

    const updates = (allLeads ?? []).map((lead: any) => {
      const { score } = scoreLead(
        { ...lead, jurisdiction_solicitation_risk: lead.jurisdictions?.solicitation_risk ?? null },
        criteria ?? []
      );
      return { id: lead.id, score };
    });

    if (updates.length) {
      const { error: upsertErr } = await supabase
        .from("leads")
        .upsert(updates, { onConflict: "id" });
      if (upsertErr) throw upsertErr;
    }

    await fetchLeads();
    return { total: updates.length, succeeded: updates.length };
  }, [fetchLeads]);

  return {
    leads, jurisdictions, loading, error,
    updateStage, updateNotes, addLead, deleteLead, addJurisdiction, bulkAddLeads, updateLeadDetails,
    recalculateAllScores, bulkAssignJurisdiction, bulkDeleteLeads,
    refetch: fetchLeads,
  };
}
