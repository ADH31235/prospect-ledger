import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { enrollLead as enrollLeadEngine } from "./sequenceEngine";

export function useSequences() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sequences")
      .select("id, name, description")
      .eq("active", true)
      .order("name", { ascending: true });
    setSequences(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  /**
   * Enrolls a lead in a sequence. Delegates to sequenceEngine.ts,
   * which refuses to enroll a lead whose jurisdiction is already
   * flagged do-not-contact — that check happens before this ever
   * schedules a single send.
   */
  const enrollLead = useCallback(async (leadId: string, sequenceId: string) => {
    return enrollLeadEngine(leadId, sequenceId);
  }, []);

  /**
   * Fetches enrollment history for one lead — called on demand
   * when the drawer opens, not baked into the main leads list
   * query, since most leads won't have any enrollments yet.
   */
  const getEnrollmentsForLead = useCallback(async (leadId: string) => {
    const { data, error } = await supabase
      .from("sequence_enrollments")
      .select("id, status, current_step, enrolled_at, sequences(name)")
      .eq("lead_id", leadId)
      .order("enrolled_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);

  /**
   * Stops an active enrollment — cancels any future scheduled
   * sends for it. Doesn't touch sends already marked 'sent'.
   */
  const stopEnrollment = useCallback(async (enrollmentId: string) => {
    const { error } = await supabase
      .from("sequence_enrollments")
      .update({ status: "stopped" })
      .eq("id", enrollmentId);
    if (error) throw error;

    await supabase
      .from("scheduled_sends")
      .update({ status: "skipped" })
      .eq("enrollment_id", enrollmentId)
      .eq("status", "pending");
  }, []);

  return { sequences, loading, enrollLead, getEnrollmentsForLead, stopEnrollment };
}
