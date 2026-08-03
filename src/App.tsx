import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookOpen, ShieldCheck, Mail, TrendingUp } from "lucide-react";
import LeadDashboard from "./LeadDashboard";
import ComplianceReview from "./ComplianceReview";
import NewsletterAdmin from "./NewsletterAdmin";
import DealSignals from "./DealSignals";
import SubscribePage from "./SubscribePage";
import NewsletterActionPage from "./NewsletterActionPage";
import Login, { useSession } from "./Login";
import { useLeads } from "./useLeads";

const NAV_BG = "#0A0F16";
const BORDER = "#2A3644";

function AuthenticatedApp() {
  const [view, setView] = useState<"ledger" | "compliance" | "newsletter" | "deals">("ledger");
  const {
    leads, jurisdictions, loading, error,
    updateStage, updateNotes, addLead, deleteLead, addJurisdiction, bulkAddLeads, updateLeadDetails,
    recalculateAllScores,
  } = useLeads();

  const tabs = [
    { key: "ledger", label: "Ledger", icon: BookOpen },
    { key: "compliance", label: "Compliance", icon: ShieldCheck },
    { key: "newsletter", label: "Newsletter", icon: Mail },
    { key: "deals", label: "Deal Signals", icon: TrendingUp },
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
              color: view === key ? "#E7ECF2" : "#5C6879",
              borderBottom: view === key ? "2px solid #C9A227" : "2px solid transparent",
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
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
            />
          )
        )}
        {view === "compliance" && <ComplianceReview />}
        {view === "newsletter" && <NewsletterAdmin />}
        {view === "deals" && <DealSignals jurisdictions={jurisdictions} onAddLead={addLead} />}
      </div>
    </div>
  );
}

function ProtectedApp() {
  const { session, loading } = useSession();
  if (loading) return <div style={{ height: "100%", background: "#0E141C" }} />;
  if (!session) return <Login />;
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/newsletter-action" element={<NewsletterActionPage />} />
      {/* Everything else requires login */}
      <Route path="*" element={<ProtectedApp />} />
    </Routes>
  );
}
