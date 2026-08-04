import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Session } from "@supabase/supabase-js";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0E141C", fontFamily: "sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "#161E29", border: "1px solid #2A3644", borderRadius: 10,
        padding: 28, width: 300, display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ color: "#E7ECF2", fontSize: 18, marginBottom: 6 }}>Prospect Ledger</div>
        <input
          type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ background: "#1C2733", border: "1px solid #2A3644", borderRadius: 6, padding: "9px 10px", color: "#E7ECF2", fontSize: 13 }}
        />
        <input
          type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ background: "#1C2733", border: "1px solid #2A3644", borderRadius: 6, padding: "9px 10px", color: "#E7ECF2", fontSize: 13 }}
        />
        {error && <div style={{ color: "#BD5A47", fontSize: 12.5 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{
          background: "#C9A227", border: "none", borderRadius: 6, padding: "9px 0",
          color: "#0E141C", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4,
        }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div style={{ fontSize: 12.5, color: "#8B98AC", marginTop: 14, textAlign: "center" }}>
          New here? <a href="/signup" style={{ color: "#C9A227" }}>Create an account</a>
        </div>
      </form>
    </div>
  );
}
