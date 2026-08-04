import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useIsPlatformAdmin() {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle();
      setIsPlatformAdmin(!!data?.is_platform_admin);
      setLoading(false);
    })();
  }, []);

  return { isPlatformAdmin, loading };
}
