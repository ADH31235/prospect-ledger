import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookOpen, ShieldCheck, Mail, TrendingUp, Send, BarChart3, Video, FileStack, CreditCard, Shield, Lock } from "lucide-react";
import LeadDashboard from "./LeadDashboard";
import ComplianceReview from "./ComplianceReview";
import NewsletterAdmin from "./NewsletterAdmin";
import DealSignals from "./DealSignals";
import SequencesOverview from "./SequencesOverview";
import ReportsView from "./ReportsView";
import WebinarSignupPage from "./WebinarSignupPage";
import WebinarsAdmin from "./WebinarsAdmin";
import ContentLibrary from "./ContentLibrary";
import ProvisionGate from "./ProvisionGate";
import BillingTab from "./BillingTab";
import AdminConsole from "./AdminConsole";
import { useIsPlatformAdmin } from "./useIsPlatformAdmin";
import { useTenant } from "./useTenant";
import SignupPage from "./SignupPage";
import ResetPasswordPage from "./ResetPasswordPage";
import SubscribePage from "./SubscribePage";
import InquirePage from "./InquirePage";
import NewsletterActionPage from "./NewsletterActionPage";
import Login, { useSession } from "./Login";
import { useLeads } from "./useLeads";
import { useSequences } from "./useSequences";
import { TOKENS, NAV_BG, BORDER } from "./theme";
import { supabase } from "./supabaseClient";
import { LogOut } from "lucide-react";



function AuthenticatedApp() {
  const [view, setView] = useState<"ledger" | "compliance" | "newsletter" | "deals" | "sequences" | "reports" | "webinars" | "content" | "billing" | "admin">("ledger");
  const { isPlatformAdmin } = useIsPlatformAdmin();
  const { tenant } = useTenant();
  // Mirrors has_active_access() in the database — this copy is
  // purely for UI messaging (showing the right prompt); the real
  // enforcement happens at the RLS level, so this can't be bypassed
  // by editing the frontend.
  const isOnTrialGrant = !!tenant?.trial_access_until && new Date(tenant.trial_access_until) >= new Date();
  // Platform admin always has full access on their own account,
  // regardless of that account's own subscription status — this
  // mirrors the same bypass added to the database RLS functions
  // below, so the UI and the actual enforcement stay in sync.
  const hasActiveAccess = isPlatformAdmin || (!!tenant && (
    tenant.subscription_status === "active" ||
    tenant.subscription_status === "trialing" ||
    isOnTrialGrant
  ));
  // Starter gets the Ledger and basic jurisdiction-based compliance
  // gating only — sequences, newsletter, webinars, content, deal
  // signals, and fee/revenue analytics all need Professional+. An
  // admin-granted trial shows the full product regardless of tier,
  // since the whole point is demonstrating everything.
  const hasProfessionalTier = isPlatformAdmin || isOnTrialGrant || (
    hasActiveAccess && (tenant?.plan_tier === "professional" || tenant?.plan_tier === "enterprise")
  );
  const {
    leads, jurisdictions, loading, error,
    updateStage, updateNotes, addLead, deleteLead, addJurisdiction, bulkAddLeads, updateLeadDetails,
    recalculateAllScores, bulkAssignJurisdiction, bulkDeleteLeads,
  } = useLeads();
  const { sequences, enrollLead, getEnrollmentsForLead, stopEnrollment, getAllEnrollments } = useSequences();

  const tabs = [
    { key: "ledger", label: "Ledger", icon: BookOpen },
    { key: "compliance", label: "Compliance", icon: ShieldCheck },
    { key: "newsletter", label: "Newsletter", icon: Mail },
    { key: "deals", label: "Deal Signals", icon: TrendingUp },
    { key: "sequences", label: "Sequences", icon: Send },
    { key: "reports", label: "Reports", icon: BarChart3 },
    { key: "webinars", label: "Webinars", icon: Video },
    { key: "content", label: "Content", icon: FileStack },
    { key: "billing", label: "Billing", icon: CreditCard },
    ...(isPlatformAdmin ? [{ key: "admin" as const, label: "Admin", icon: Shield }] : []),
  ] as const;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          background: NAV_BG, borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", gap: 4, padding: "0 20px", height: 46, flexShrink: 0,
        }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer", padding: "10px 12px", fontSize: 13,
              color: view === key ? TOKENS.textPrimary : TOKENS.textFaint,
              borderBottom: view === key ? `2px solid ${TOKENS.gold}` : "2px solid transparent",
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}

        <button
          onClick={() => {
            // These are meant to persist across tab switches within
            // a session, not indefinitely — clearing them here means
            // the next person to sign in (or the same person next
            // time) starts from a clean slate rather than inheriting
            // whatever filters were left on.
            [
              "ledger_filter_query", "ledger_filter_stage", "ledger_filter_risk",
              "ledger_filter_jurisdiction", "ledger_filter_source", "ledger_filter_networth",
              "ledger_filter_advisor", "ledger_filter_minassets", "ledger_filter_maxassets",
              "ledger_filter_minscore", "ledger_filter_linkedin",
              "ledger_sort_key", "ledger_sort_dir",
              "ledger_assets_display_currency", "ledger_assets_manual_rates",
            ].forEach((k) => localStorage.removeItem(k));
            supabase.auth.signOut();
          }}
          title="Sign out"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer", padding: "8px 12px", fontSize: 13,
            color: TOKENS.textFaint, marginLeft: "auto",
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </nav>

      <div style={{ flex: 1, overflow: "auto" }}>
        {view === "ledger" && (
          loading ? (
            <div style={{ background: "#0E141C", color: "#8B98AC", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Loading ledger…
            </div>
          ) : error ? (
            <div style={{ background: "#0E141C", color: "#BD5A47", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Failed to load: {error}
            </div>
          ) : (
            <LeadDashboard
              leads={leads}
              jurisdictions={jurisdictions}
              readOnly={!hasActiveAccess}
              onUpdateStage={updateStage}
              onUpdateNotes={updateNotes}
              onAddLead={addLead}
              onDeleteLead={deleteLead}
              onAddJurisdiction={addJurisdiction}
              onImportLeads={bulkAddLeads}
              onUpdateDetails={updateLeadDetails}
              onRecalculateScores={recalculateAllScores}
              onBulkAssignJurisdiction={bulkAssignJurisdiction}
              onBulkDeleteLeads={bulkDeleteLeads}
              sequences={sequences}
              onEnrollLead={enrollLead}
              onGetEnrollments={getEnrollmentsForLead}
              onStopEnrollment={stopEnrollment}
            />
          )
        )}
        {view === "compliance" && (hasActiveAccess ? <ComplianceReview /> : <SubscribeGate onGoToBilling={() => setView("billing")} />)}
        {view === "newsletter" && (hasProfessionalTier ? <NewsletterAdmin /> : <SubscribeGate onGoToBilling={() => setView("billing")} requiresProfessional={hasActiveAccess} />)}
        {view === "deals" && (hasProfessionalTier ? <DealSignals jurisdictions={jurisdictions} onAddLead={addLead} /> : <SubscribeGate onGoToBilling={() => setView("billing")} requiresProfessional={hasActiveAccess} />)}
        {view === "sequences" && (hasProfessionalTier ? <SequencesOverview getAllEnrollments={getAllEnrollments} onStopEnrollment={stopEnrollment} /> : <SubscribeGate onGoToBilling={() => setView("billing")} requiresProfessional={hasActiveAccess} />)}
        {view === "reports" && (hasProfessionalTier ? <ReportsView leads={leads} jurisdictions={jurisdictions} /> : <SubscribeGate onGoToBilling={() => setView("billing")} requiresProfessional={hasActiveAccess} />)}
        {view === "webinars" && (hasProfessionalTier ? <WebinarsAdmin /> : <SubscribeGate onGoToBilling={() => setView("billing")} requiresProfessional={hasActiveAccess} />)}
        {view === "content" && (hasProfessionalTier ? <ContentLibrary /> : <SubscribeGate onGoToBilling={() => setView("billing")} requiresProfessional={hasActiveAccess} />)}
        {view === "billing" && <BillingTab />}
        {view === "admin" && isPlatformAdmin && <AdminConsole />}
      </div>
    </div>
  );
}

function ProtectedApp() {
  const { session, loading } = useSession();
  if (loading) return <div style={{ height: "100%", background: "#0E141C" }} />;
  if (!session) return <Login />;
  return (
    <ProvisionGate session={session}>
      <AuthenticatedApp />
    </ProvisionGate>
  );
}

// ============================================================
// Shown in place of any gated tab's content when a tenant doesn't
// have an active subscription (or admin-granted trial). This is
// purely a UX message — the actual enforcement is at the database
// level (RLS), so even if someone bypassed this screen entirely,
// the underlying data would still refuse reads/writes.
// ============================================================
function SubscribeGate({ onGoToBilling, requiresProfessional = false }: { onGoToBilling: () => void; requiresProfessional?: boolean }) {
  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: TOKENS.surface, borderRadius: 10, padding: 32, maxWidth: 380, textAlign: "center" }}>
        <Lock size={28} color={TOKENS.textFaint} style={{ margin: "0 auto 14px" }} />
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 18, color: TOKENS.textPrimary, marginBottom: 8 }}>
          {requiresProfessional ? "Upgrade to Professional" : "Subscribe to unlock this"}
        </div>
        <p style={{ fontSize: 13, color: TOKENS.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
          {requiresProfessional
            ? "This is part of the Professional plan — sequences, newsletter, webinars, content, deal signals, and fee analytics."
            : "This section needs an active subscription. Your Ledger stays visible in the meantime, just without the ability to add or change anything."}
        </p>
        <button
          onClick={onGoToBilling}
          style={{ background: TOKENS.gold, color: "#FFFFFF", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
        >
          Go to Billing
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/inquire" element={<InquirePage />} />
      <Route path="/webinar" element={<WebinarSignupPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/newsletter-action" element={<NewsletterActionPage />} />
      {/* Everything else requires login */}
      <Route path="*" element={<ProtectedApp />} />
    </Routes>
  );
}
