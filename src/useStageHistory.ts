import { useCallback } from "react";
import { supabase } from "./supabaseClient";

export function useStageHistory() {
  /**
   * Full history for one lead — used for a per-lead timeline
   * in the drawer.
   */
  const getHistoryForLead = useCallback(async (leadId: string) => {
    const { data, error } = await supabase
      .from("lead_stage_history")
      .select("from_stage, to_stage, changed_at")
      .eq("lead_id", leadId)
      .order("changed_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }, []);

  /**
   * Recent transitions across all leads, with the lead's name
   * attached — powers the "Recent activity" feed on Reports.
   */
  const getRecentChanges = useCallback(async (limit = 20) => {
    const { data, error } = await supabase
      .from("lead_stage_history")
      .select("from_stage, to_stage, changed_at, leads(full_name)")
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }, []);

  /**
   * All history rows across all leads, unfiltered — used to
   * compute the true historical funnel (how many reached each
   * stage over time) rather than just today's snapshot.
   */
  const getAllHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("lead_stage_history")
      .select("lead_id, from_stage, to_stage, changed_at")
      .order("changed_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }, []);

  return { getHistoryForLead, getRecentChanges, getAllHistory };
}
