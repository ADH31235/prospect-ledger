// Supabase Edge Function — AUTHENTICATED (default verify_jwt = true).
// Deploy with: supabase functions deploy send-newsletter
//
// Only callable by a logged-in user (you) — this is why it does
// NOT get --no-verify-jwt like the other two. Sends one issue to
// every confirmed subscriber, substituting a real per-recipient
// unsubscribe link into each email.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function sendOne(email: string, subject: string, body: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${Deno.env.get("FROM_NAME")} <${Deno.env.get("FROM_EMAIL")}>`,
      to: [email],
      subject,
      text: body,
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const { issue_id } = await req.json();
    if (!issue_id) {
      return new Response(JSON.stringify({ error: "issue_id required" }), { status: 400 });
    }

    const { data: issue, error: issueErr } = await supabase
      .from("newsletter_issues")
      .select("*")
      .eq("id", issue_id)
      .single();
    if (issueErr || !issue) {
      return new Response(JSON.stringify({ error: "issue not found" }), { status: 404 });
    }
    if (issue.status === "sent") {
      return new Response(JSON.stringify({ error: "already sent" }), { status: 400 });
    }

    await supabase.from("newsletter_issues").update({ status: "sending" }).eq("id", issue_id);

    const { data: subscribers, error: subErr } = await supabase
      .from("newsletter_subscribers")
      .select("email, full_name, confirmation_token")
      .eq("status", "confirmed");
    if (subErr) throw subErr;

    const siteUrl = Deno.env.get("SITE_URL");
    let sentCount = 0;

    for (const sub of subscribers ?? []) {
      const unsubscribeLink = `${siteUrl}/newsletter-action?type=unsubscribe&token=${sub.confirmation_token}`;
      const body = `${issue.body}\n\n---\nUnsubscribe: ${unsubscribeLink}`;
      const ok = await sendOne(sub.email, issue.subject, body);
      if (ok) sentCount++;
      await new Promise((r) => setTimeout(r, 300)); // basic rate limiting
    }

    await supabase
      .from("newsletter_issues")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_count: sentCount })
      .eq("id", issue_id);

    return new Response(JSON.stringify({ ok: true, sent: sentCount, total: subscribers?.length ?? 0 }));
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
