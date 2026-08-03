// Supabase Edge Function — PUBLIC (no auth required).
// Deploy with: supabase functions deploy subscribe --no-verify-jwt
//
// Called from the public /subscribe page. Inserts a pending
// subscriber and emails them a confirmation link — nobody is
// ever added as 'confirmed' without clicking that link themselves.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase),
//   RESEND_API_KEY, FROM_EMAIL, FROM_NAME, SITE_URL
//
// NOTE: until you verify your own domain in Resend, FROM_EMAIL must
// be onboarding@resend.dev, and Resend will only actually deliver to
// the email address you signed up to Resend with — fine for testing,
// but you'll need domain verification before this can email anyone else.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendConfirmationEmail(email: string, name: string, token: string) {
  const siteUrl = Deno.env.get("SITE_URL");
  const confirmLink = `${siteUrl}/newsletter-action?type=confirm&token=${token}`;
  const fromEmail = Deno.env.get("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME");

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [email],
      subject: "Confirm your subscription",
      text: `Hi${name ? " " + name : ""},\n\nPlease confirm you'd like to receive occasional market commentary by clicking the link below:\n\n${confirmLink}\n\nIf you didn't request this, you can safely ignore this email — you won't be added unless you confirm.\n\nBest,\n${fromName}`,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });


  try {
    const { email, full_name, lead_id, source } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already subscribed
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (existing?.status === "confirmed") {
      return new Response(JSON.stringify({ ok: true, message: "already_confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token: string;
    if (existing) {
      // Re-subscribing (was pending or previously unsubscribed) — reset and reuse a fresh token
      const { data: updated } = await supabase
        .from("newsletter_subscribers")
        .update({ status: "pending", confirmation_token: crypto.randomUUID(), unsubscribed_at: null })
        .eq("id", existing.id)
        .select("confirmation_token")
        .single();
      token = updated!.confirmation_token;
    } else {
      const { data: created, error } = await supabase
        .from("newsletter_subscribers")
        .insert({ email, full_name: full_name || null, lead_id: lead_id || null, source: source || "website" })
        .select("confirmation_token")
        .single();
      if (error) throw error;
      token = created.confirmation_token;
    }

    await sendConfirmationEmail(email, full_name, token);

    return new Response(JSON.stringify({ ok: true, message: "confirmation_sent" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
