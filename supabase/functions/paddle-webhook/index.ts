// Supabase Edge Function — PUBLIC (Paddle calls this, no user
// session involved), but every request is cryptographically
// verified against PADDLE_WEBHOOK_SECRET before anything is
// trusted. Deploy with: supabase functions deploy paddle-webhook --no-verify-jwt
//
// This is the single source of truth sync point: Paddle owns the
// real subscription state, this function just mirrors it onto
// tenants.subscription_status so the app can gate features
// without calling Paddle's API on every page load.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => p.split("=") as [string, string])
  );
  const { ts, h1 } = parts;
  if (!ts || !h1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}:${rawBody}`)
  );
  const computedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === h1;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("Paddle-Signature");

  const valid = await verifySignature(rawBody, signatureHeader);
  if (!valid) {
    // Deliberately vague response — don't help an attacker learn
    // why verification failed.
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventType = event.event_type;
  const data = event.data;

  try {
    switch (eventType) {
      case "subscription.created":
      case "subscription.updated": {
        const tenantId = data.custom_data?.tenant_id;
        const planTier = data.custom_data?.plan_tier;
        const updates: Record<string, any> = {
          paddle_customer_id: data.customer_id,
          paddle_subscription_id: data.id,
          subscription_status: data.status,
          plan: data.items?.[0]?.price?.id ?? null,
          current_period_end: data.current_billing_period?.ends_at ?? null,
          seat_count: data.items?.[0]?.quantity ?? 1,
        };
        // Only set plan_tier if the checkout actually told us which
        // one was picked — an update event for an existing
        // subscription (e.g. a payment retry) won't carry this, and
        // we don't want to accidentally reset an existing tier to
        // undefined.
        if (planTier) updates.plan_tier = planTier;

        if (tenantId) {
          await supabase.from("tenants").update(updates).eq("id", tenantId);
        } else {
          await supabase.from("tenants").update(updates).eq("paddle_subscription_id", data.id);
        }
        break;
      }

      case "subscription.canceled": {
        await supabase
          .from("tenants")
          .update({ subscription_status: "canceled" })
          .eq("paddle_subscription_id", data.id);
        break;
      }

      case "subscription.paused": {
        await supabase
          .from("tenants")
          .update({ subscription_status: "paused" })
          .eq("paddle_subscription_id", data.id);
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
