import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookOpen, ShieldCheck, Mail, TrendingUp, Send, BarChart3, Video, FileStack } from "lucide-react";
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
import SignupPage from "./SignupPage";
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
  const [view, setView] = useState<"ledger" | "compliance" | "newsletter" | "deals" | "sequences" | "reports" | "webinars" | "content">("ledger");
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
          onClick={() => supabase.auth.signOut()}
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
        {view === "compliance" && <ComplianceReview />}
        {view === "newsletter" && <NewsletterAdmin />}
        {view === "deals" && <DealSignals jurisdictions={jurisdictions} onAddLead={addLead} />}
        {view === "sequences" && <SequencesOverview getAllEnrollments={getAllEnrollments} onStopEnrollment={stopEnrollment} />}
        {view === "reports" && <ReportsView leads={leads} jurisdictions={jurisdictions} />}
        {view === "webinars" && <WebinarsAdmin />}
        {view === "content" && <ContentLibrary />}
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

export default function App() {
  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/inquire" element={<InquirePage />} />
      <Route path="/webinar" element={<WebinarSignupPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/newsletter-action" element={<NewsletterActionPage />} />
      {/* Everything else requires login */}
      <Route path="*" element={<ProtectedApp />} />
    </Routes>
  );
}
