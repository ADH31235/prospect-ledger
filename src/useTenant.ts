import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useTenant() {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setTenant(null);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) {
      setTenant(null);
      setLoading(false);
      return;
    }
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    setTenant(tenantRow);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tenant, loading, refetch };
}
