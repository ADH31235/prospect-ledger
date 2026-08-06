import React, { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, RefreshCw, XCircle, Mail } from "lucide-react";
import { supabase } from "./supabaseClient";
import { useTenant } from "./useTenant";
import { TOKENS } from "./theme";

// Client-safe values — the secret API key never goes anywhere
// near frontend code, only these two, which Paddle's own docs
// confirm are safe to expose in the browser.
const PADDLE_CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
const PADDLE_ENVIRONMENT = import.meta.env.VITE_PADDLE_ENVIRONMENT || "sandbox";
const TIER_PRICE_IDS = {
  starter: import.meta.env.VITE_PADDLE_STARTER_PRICE_ID,
  professional: import.meta.env.VITE_PADDLE_PROFESSIONAL_PRICE_ID,
};
const TIER_INFO = {
  starter: { label: "Starter", price: "$49/user/mo", blurb: "Ledger and basic jurisdiction-based compliance gating." },
  professional: { label: "Professional", price: "$79/user/mo", blurb: "Full compliance workflow, sequences, newsletter, webinars, content library, and fee/revenue analytics." },
};

const STATUS_META = {
  none: { label: "No active subscription", color: TOKENS.textFaint },
  trialing: { label: "Trial", color: TOKENS.riskReview },
  active: { label: "Active", color: TOKENS.riskLow },
  past_due: { label: "Payment overdue", color: TOKENS.riskBlocked },
  canceled: { label: "Canceled", color: TOKENS.textFaint },
  paused: { label: "Paused", color: TOKENS.riskReview },
};

let paddleLoadPromise = null;

function loadPaddleJs() {
  if (paddleLoadPromise) return paddleLoadPromise;
  paddleLoadPromise = new Promise((resolve, reject) => {
    if (window.Paddle) {
      resolve(window.Paddle);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => resolve(window.Paddle);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return paddleLoadPromise;
}

export default function BillingTab() {
  const { tenant, loading, refetch } = useTenant();
  const [checkoutOpening, setCheckoutOpening] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [seatCount, setSeatCount] = useState(1);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelRequested, setCancelRequested] = useState(false);
  const [notifyEmailDraft, setNotifyEmailDraft] = useState("");
  const [savingNotifyEmail, setSavingNotifyEmail] = useState(false);
  const [notifyEmailSaved, setNotifyEmailSaved] = useState(false);
  const [notifyEmailError, setNotifyEmailError] = useState("");

  useEffect(() => {
    if (tenant?.notify_email) setNotifyEmailDraft(tenant.notify_email);
  }, [tenant?.notify_email]);

  async function handleSaveNotifyEmail() {
    setSavingNotifyEmail(true);
    setNotifyEmailError("");
    setNotifyEmailSaved(false);
    try {
      const { error } = await supabase.functions.invoke("update-notify-email", {
        body: { notify_email: notifyEmailDraft },
      });
      if (error) throw error;
      setNotifyEmailSaved(true);
      await refetch();
    } catch (err) {
      setNotifyEmailError(err?.message ?? "Couldn't save.");
    } finally {
      setSavingNotifyEmail(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of your current billing period, then it won't renew.")) {
      return;
    }
    setCanceling(true);
    setCancelError("");
    try {
      const { error } = await supabase.functions.invoke("cancel-subscription");
      if (error) throw error;
      setCancelRequested(true);
      await refetch();
    } catch (err) {
      setCancelError(err?.message ?? "Couldn't cancel — please try again.");
    } finally {
      setCanceling(false);
    }
  }

  async function handleSubscribe(tier) {
    if (!PADDLE_CLIENT_TOKEN) {
      setCheckoutError("Checkout isn't configured yet — missing Paddle client token.");
      return;
    }
    const priceId = TIER_PRICE_IDS[tier];
    if (!priceId) {
      setCheckoutError(`Checkout isn't configured yet for ${TIER_INFO[tier].label} — missing its Price ID.`);
      return;
    }
    setCheckoutOpening(true);
    setCheckoutError("");
    try {
      const Paddle = await loadPaddleJs();
      Paddle.Environment.set(PADDLE_ENVIRONMENT);
      Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
      Paddle.Checkout.open({
        items: [{ priceId, quantity: seatCount }],
        customData: { tenant_id: tenant?.id, plan_tier: tier },
      });
    } catch (err) {
      setCheckoutError(err?.message ?? "Couldn't open checkout — please try again.");
    } finally {
      setCheckoutOpening(false);
    }
  }

  const status = tenant?.subscription_status ?? "none";
  const meta = STATUS_META[status] ?? STATUS_META.none;
  const isActive = status === "active" || status === "trialing";

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 28, color: TOKENS.white }}>
            Billing
          </h1>
          <p style={{ color: TOKENS.ivory, fontSize: 13, marginTop: 2 }}>
            Manage your subscription.
          </p>
        </div>

        {loading ? (
          <div style={{ color: TOKENS.ivoryMuted, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ background: TOKENS.surface, borderRadius: 10, padding: 24 }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div style={{ fontSize: 12, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  Status
                </div>
                <div className="flex items-center gap-2">
                  <span style={{
                    fontSize: 13, padding: "3px 10px", borderRadius: 999,
                    background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}55`,
                  }}>
                    {meta.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isActive && <CheckCircle2 size={22} color={TOKENS.riskLow} />}
                <button onClick={refetch} title="Refresh status" style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.textFaint, display: "flex" }}>
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {tenant?.current_period_end && (
              <div style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 16 }}>
                {status === "canceled" ? "Access until" : "Renews"}{" "}
                {new Date(tenant.current_period_end).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
              </div>
            )}

            {isActive && tenant?.plan_tier && (
              <div style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 16 }}>
                {TIER_INFO[tenant.plan_tier]?.label ?? tenant.plan_tier} — {tenant.seat_count ?? 1} seat{(tenant.seat_count ?? 1) === 1 ? "" : "s"}
              </div>
            )}

            {isActive && !cancelRequested && (
              <>
                <button
                  onClick={handleCancel}
                  disabled={canceling}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "none", color: TOKENS.riskBlocked, border: `1px solid ${TOKENS.riskBlocked}55`, borderRadius: 6,
                    padding: "9px 16px", fontSize: 13, cursor: "pointer",
                    opacity: canceling ? 0.6 : 1,
                  }}
                >
                  <XCircle size={14} /> {canceling ? "Canceling…" : "Cancel subscription"}
                </button>
                {cancelError && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5, marginTop: 10 }}>{cancelError}</div>}
              </>
            )}
            {cancelRequested && (
              <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                Cancellation scheduled — you'll keep access until your current period ends.
              </div>
            )}

            {!isActive && (
              <>
                <p style={{ fontSize: 13.5, color: TOKENS.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                  Choose a plan to unlock full access for your workspace.
                </p>

                <div className="flex items-center gap-2 mb-4">
                  <label style={{ fontSize: 12.5, color: TOKENS.textMuted }}>Seats</label>
                  <input
                    type="number" min="1" max="50" value={seatCount}
                    onChange={(e) => setSeatCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ width: 60, background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, color: TOKENS.textPrimary }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {Object.entries(TIER_INFO).map(([tier, info]) => (
                    <div key={tier} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{info.label}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TOKENS.textMuted, marginBottom: 8 }}>{info.price}</div>
                      <p style={{ fontSize: 11.5, color: TOKENS.textFaint, marginBottom: 12, lineHeight: 1.5 }}>{info.blurb}</p>
                      <button
                        onClick={() => handleSubscribe(tier)}
                        disabled={checkoutOpening}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
                          background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                          padding: "8px 0", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                          opacity: checkoutOpening ? 0.6 : 1,
                        }}
                      >
                        <CreditCard size={13} /> {checkoutOpening ? "Opening…" : `Subscribe (${seatCount} seat${seatCount === 1 ? "" : "s"})`}
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: TOKENS.textFaint }}>
                  Larger team or need custom terms?{" "}
                  <a href={`mailto:support@trivaraservices.com?subject=${encodeURIComponent(`Enterprise plan — ${tenant?.name ?? "my account"}`)}`} style={{ color: TOKENS.gold }}>
                    Contact us about Enterprise
                  </a>
                </div>

                {checkoutError && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5, marginTop: 10 }}>{checkoutError}</div>}
              </>
            )}
          </div>
        )}

        {!loading && (
          <div style={{ background: TOKENS.surface, borderRadius: 10, padding: 24, marginTop: 20 }}>
            <div style={{ fontSize: 12, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Notifications
            </div>
            <p style={{ fontSize: 12.5, color: TOKENS.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
              Where alerts for this workspace go — new inquiries, webinar registrations, upcoming birthdays.
            </p>
            <div className="flex gap-2">
              <input
                type="email" value={notifyEmailDraft} onChange={(e) => setNotifyEmailDraft(e.target.value)}
                placeholder="you@company.com"
                style={{ flex: 1, background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 10px", fontSize: 13, color: TOKENS.textPrimary }}
              />
              <button
                onClick={handleSaveNotifyEmail}
                disabled={savingNotifyEmail}
                style={{ background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: savingNotifyEmail ? 0.6 : 1 }}
              >
                {savingNotifyEmail ? "Saving…" : "Save"}
              </button>
            </div>
            {notifyEmailSaved && <div style={{ color: TOKENS.riskLow, fontSize: 12, marginTop: 8 }}>Saved.</div>}
            {notifyEmailError && <div style={{ color: TOKENS.riskBlocked, fontSize: 12, marginTop: 8 }}>{notifyEmailError}</div>}
          </div>
        )}

        {!loading && (
          <div style={{ background: TOKENS.surface, borderRadius: 10, padding: 24, marginTop: 20 }}>
            <div style={{ fontSize: 12, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Need help?
            </div>
            <p style={{ fontSize: 12.5, color: TOKENS.textMuted, marginBottom: 14, lineHeight: 1.6 }}>
              Questions about your subscription, billing, or account — reach out directly.
            </p>
            <a
              href={`mailto:support@trivaraservices.com?subject=${encodeURIComponent(`Support request — ${tenant?.name ?? "my account"}`)}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "none", color: TOKENS.gold, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                padding: "9px 16px", fontSize: 13, textDecoration: "none",
              }}
            >
              <Mail size={14} /> Contact admin
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
