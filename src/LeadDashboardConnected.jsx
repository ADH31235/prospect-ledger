import React from "react";
import LeadDashboard from "./LeadDashboard";
import { useLeads } from "./useLeads";

// Drop this in wherever you'd otherwise use <LeadDashboard /> in
// your real app. It's the only file that knows Supabase exists —
// LeadDashboard.jsx stays pure/presentational and easy to test
// or restyle without touching data logic.
export default function LeadDashboardConnected() {
  const { leads, jurisdictions, loading, error, updateStage, updateNotes, addLead, deleteLead, addJurisdiction, bulkAddLeads, updateLeadDetails } = useLeads();

  if (loading) {
    return (
      <div style={{ background: "#0E141C", color: "#8B98AC", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        Loading ledger…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "#0E141C", color: "#BD5A47", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        Failed to load: {error}
      </div>
    );
  }

  return (
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
    />
  );
}
