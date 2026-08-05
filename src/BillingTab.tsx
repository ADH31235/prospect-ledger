import React, { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "./supabaseClient";
import { useTenant } from "./useTenant";
import { TOKENS } from "./theme";

// Client-safe values — the secret API key never goes anywhere
// near frontend code, only these two, which Paddle's own docs
// confirm are safe to expose in the browser.
const PADDLE_CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
const PADDLE_PRICE_ID = import.meta.env.VITE_PADDLE_PRICE_ID || "pri_01kz60a6vjx7e84sd49xsv0ggm";
const PADDLE_ENVIRONMENT = import.meta.env.VITE_PADDLE_ENVIRONMENT || "sandbox";

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

  async function handleSubscribe() {
    if (!PADDLE_CLIENT_TOKEN) {
      setCheckoutError("Checkout isn't configured yet — missing Paddle client token.");
      return;
    }
    setCheckoutOpening(true);
    setCheckoutError("");
    try {
      const Paddle = await loadPaddleJs();
      Paddle.Environment.set(PADDLE_ENVIRONMENT);
      Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
      Paddle.Checkout.open({
        items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
        customData: { tenant_id: tenant?.id },
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
                  Subscribe to unlock full access for your workspace.
                </p>
                <button
                  onClick={handleSubscribe}
                  disabled={checkoutOpening}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                    padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                    opacity: checkoutOpening ? 0.6 : 1,
                  }}
                >
                  <CreditCard size={15} /> {checkoutOpening ? "Opening…" : "Subscribe"}
                </button>
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
      </div>
    </div>
  );
}
