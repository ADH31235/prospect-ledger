import React, { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  ChevronUp,
  ChevronDown,
  Search,
  X,
  Circle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  Plus,
  Trash2,
  FileUp,
  SlidersHorizontal,
  Linkedin,
  RefreshCw,
} from "lucide-react";

// ============================================================
// DESIGN TOKENS
// A private-banking ledger, not a SaaS dashboard: dense rows,
// tabular figures, a restrained navy/ink palette, and a single
// signature element — the compliance seal — carrying the one
// piece of real visual weight in the page.
// ============================================================
const TOKENS = {
  bg: "#0E141C",
  surface: "#161E29",
  surfaceRaised: "#1C2733",
  border: "#2A3644",
  borderFaint: "#212B37",
  textPrimary: "#E7ECF2",
  textMuted: "#8B98AC",
  textFaint: "#5C6879",
  gold: "#C9A227",
  goldFaint: "#8A7433",
  riskLow: "#4C9E76",
  riskReview: "#D9A441",
  riskBlocked: "#BD5A47",
};

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
`;

// ============================================================
// MOCK DATA — shaped to match the leads/jurisdictions schema
// ============================================================
const JURISDICTIONS = {
  portugal: { country: "Portugal", region: "Europe", risk: "review_required", license: "MM Private · EU" },
  uae: { country: "UAE", region: "Middle East", risk: "review_required", license: null },
  switzerland: { country: "Switzerland", region: "Europe", risk: "review_required", license: null },
  singapore: { country: "Singapore", region: "Asia", risk: "review_required", license: null },
  hongkong: { country: "Hong Kong", region: "Asia", risk: "do_not_contact", license: null },
  spain: { country: "Spain", region: "Europe", risk: "low", license: "MM Private · EU" },
};

const initialLeads = [
  {
    id: "1", name: "Henrique Salazar Costa", title: "Founder & CEO", company: "Vindima Biotech",
    jurisdiction: "portugal", stage: "qualified", score: 82,
    netWorth: "exited_founder", assets: 3200000, liquidityEvent: "exit", liquidityDate: "2025-11-02",
    source: "referral", existingAdvisor: false, lastContact: "2026-07-22",
    notes: "Sold majority stake in Vindima last autumn. Warm intro via Nelson's network.",
  },
  {
    id: "2", name: "Amira Al Farsi", title: "Managing Director", company: "Falcon Ridge Holdings",
    jurisdiction: "uae", stage: "contacted", score: 68,
    netWorth: "senior_exec", assets: 1800000, liquidityEvent: "none", liquidityDate: null,
    source: "linkedin", existingAdvisor: true, lastContact: "2026-07-18",
    notes: "Has an existing advisor at a local bank — worth probing on service gaps.",
  },
  {
    id: "3", name: "Lukas Brenner", title: "Partner", company: "Brenner & Voss Legal",
    jurisdiction: "switzerland", stage: "enriched", score: 41,
    netWorth: "unknown", assets: null, liquidityEvent: "none", liquidityDate: null,
    source: "apollo", existingAdvisor: null, lastContact: null,
    notes: "Awaiting compliance review before first contact — Swiss cross-border rules unconfirmed.",
  },
  {
    id: "4", name: "Wei Cheng Tan", title: "Retired", company: "—",
    jurisdiction: "hongkong", stage: "disqualified", score: 0,
    netWorth: "inherited_wealth", assets: 5100000, liquidityEvent: "inheritance", liquidityDate: "2026-02-14",
    source: "event", existingAdvisor: false, lastContact: null,
    notes: "Strong fit on paper. Blocked — SFC solicitation review not yet cleared for this profile.",
  },
  {
    id: "5", name: "Marta Jiménez Roca", title: "VP Strategy", company: "Aurea Capital",
    jurisdiction: "spain", stage: "qualified", score: 74,
    netWorth: "senior_exec", assets: 1450000, liquidityEvent: "none", liquidityDate: null,
    source: "referral", existingAdvisor: false, lastContact: "2026-07-25",
    notes: "Referred by Henrique. No existing advisor relationship — good fit for onboarding.",
  },
  {
    id: "6", name: "Omar Al Mazrouei", title: "Founder", company: "Zenith Logistics FZE",
    jurisdiction: "uae", stage: "engaged", score: 79,
    netWorth: "exited_founder", assets: 4600000, liquidityEvent: "exit", liquidityDate: "2026-04-01",
    source: "linkedin", existingAdvisor: false, lastContact: "2026-07-29",
    notes: "Recent exit, actively looking. Second call scheduled for next week.",
  },
  {
    id: "7", name: "Ines Park", title: "Managing Partner", company: "Parkview Ventures",
    jurisdiction: "singapore", stage: "new", score: 22,
    netWorth: "unknown", assets: null, liquidityEvent: "none", liquidityDate: null,
    source: "apollo", existingAdvisor: null, lastContact: null,
    notes: "",
  },
  {
    id: "8", name: "Duarte Vilela Nunes", title: "Managing Director", company: "Vilela Imobiliária",
    jurisdiction: "portugal", stage: "client", score: 91,
    netWorth: "senior_exec", assets: 2700000, liquidityEvent: "none", liquidityDate: null,
    source: "referral", existingAdvisor: false, lastContact: "2026-07-14",
    notes: "Onboarded in June. First allocation review scheduled for September.",
  },
];

const STAGE_LABELS = {
  new: "New", enriched: "Enriched", contacted: "Contacted", engaged: "Engaged",
  qualified: "Qualified", client: "Client", disqualified: "Disqualified", do_not_contact: "Do not contact",
};

const RISK_META = {
  low: { label: "Cleared", icon: ShieldCheck, color: TOKENS.riskLow },
  review_required: { label: "Review required", icon: ShieldAlert, color: TOKENS.riskReview },
  do_not_contact: { label: "Blocked", icon: ShieldX, color: TOKENS.riskBlocked },
};

// A lead can legitimately have no jurisdiction set yet (e.g. just
// added manually, not enriched). Route every lookup through this
// so a missing jurisdiction shows as "review required" rather than
// crashing the page.
const UNSET_JURISDICTION = { country: "Not set", region: "—", risk: "review_required", license: null };
function getJurisdiction(jurisdictions, key) {
  return jurisdictions[key] ?? UNSET_JURISDICTION;
}

function formatMoney(n) {
  if (n == null) return "—";
  return "£" + (n / 1_000_000).toFixed(1) + "M";
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Seal({ risk, size = 30 }) {
  const meta = RISK_META[risk];
  const Icon = meta.icon;
  return (
    <div
      title={meta.label}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${meta.color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${meta.color}14`,
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.52} color={meta.color} strokeWidth={2} />
    </div>
  );
}

function ScoreBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 56, height: 5, background: TOKENS.borderFaint, borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: score >= 70 ? TOKENS.gold : score >= 40 ? TOKENS.textMuted : TOKENS.textFaint,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TOKENS.textPrimary, fontVariantNumeric: "tabular-nums" }}
      >
        {String(score).padStart(2, "0")}
      </span>
    </div>
  );
}

// ============================================================
// Presentational component. Works standalone with mock data
// (as before) but also accepts live data + mutation callbacks
// so it can be dropped into a Supabase-connected wrapper without
// changing anything below — see LeadDashboardConnected.jsx.
// ============================================================
export default function LeadDashboard({
  leads: leadsProp,
  jurisdictions = JURISDICTIONS, // default keeps standalone preview working unchanged
  onUpdateStage,
  onUpdateNotes,
  onAddLead,
  onDeleteLead,
  onAddJurisdiction,
  onImportLeads,
  onUpdateDetails,
  onRecalculateScores,
  onBulkAssignJurisdiction,
  onBulkDeleteLeads,
  sequences,
  onEnrollLead,
  onGetEnrollments,
  onStopEnrollment,
} = {}) {
  const [localLeads, setLocalLeads] = useState(initialLeads);
  const leads = leadsProp ?? localLeads;

  function handleStageChange(id, stage) {
    if (onUpdateStage) onUpdateStage(id, stage);
    else setLocalLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
  }

  const [showAddLead, setShowAddLead] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState(() => new Set());
  const [bulkJurisdictionId, setBulkJurisdictionId] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [netWorthFilter, setNetWorthFilter] = useState("all");
  const [existingAdvisorFilter, setExistingAdvisorFilter] = useState("all");
  const [minAssets, setMinAssets] = useState("");
  const [maxAssets, setMaxAssets] = useState("");
  const [minScore, setMinScore] = useState("");
  const [linkedinFilter, setLinkedinFilter] = useState("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedId, setSelectedId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState({});
  const [detailsNewCountry, setDetailsNewCountry] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  function startEditingDetails() {
    setDetailsDraft({
      email: selected.email || "",
      phone: selected.phone || "",
      linkedin_url: selected.linkedinUrl || "",
      company: selected.company === "—" ? "" : selected.company,
      job_title: selected.title === "—" ? "" : selected.title,
      jurisdiction_id: selected.jurisdiction || "",
      net_worth_signal: selected.netWorth || "unknown",
      estimated_investable_assets: selected.assets ?? "",
      liquidity_event: selected.liquidityEvent || "none",
      liquidity_event_date: selected.liquidityDate || "",
      existing_advisor: selected.existingAdvisor == null ? "" : (selected.existingAdvisor ? "yes" : "no"),
      current_investment_products: selected.currentInvestmentProducts || "",
      current_provider: selected.currentProvider || "",
      risk_profile: selected.riskProfile || "",
      preferred_contact_method: selected.preferredContactMethod || "",
      next_follow_up_date: selected.nextFollowUpDate || "",
      date_of_birth: selected.dateOfBirth || "",
      referred_by: selected.referredBy || "",
    });
    setDetailsNewCountry("");
    setEditingDetails(true);
  }

  async function handleSaveDetails() {
    if (!selected) return;
    setSavingDetails(true);
    try {
      let jurisdictionId = detailsDraft.jurisdiction_id;
      if (jurisdictionId === "__other__") {
        if (!detailsNewCountry.trim()) {
          alert("Enter the country name, or pick an existing jurisdiction.");
          setSavingDetails(false);
          return;
        }
        if (!onAddJurisdiction) throw new Error("Adding a new jurisdiction isn't available here.");
        const created = await onAddJurisdiction(detailsNewCountry.trim());
        jurisdictionId = created.id;
      }
      const payload = {
        ...detailsDraft,
        estimated_investable_assets: detailsDraft.estimated_investable_assets === "" ? null : Number(detailsDraft.estimated_investable_assets),
        existing_advisor: detailsDraft.existing_advisor === "" ? null : detailsDraft.existing_advisor === "yes",
        jurisdiction_id: jurisdictionId || null,
        liquidity_event_date: detailsDraft.liquidity_event_date || null,
        next_follow_up_date: detailsDraft.next_follow_up_date || null,
        date_of_birth: detailsDraft.date_of_birth || null,
      };
      if (onUpdateDetails) await onUpdateDetails(selected.id, payload);
      setEditingDetails(false);
    } finally {
      setSavingDetails(false);
    }
  }

  const distinctSources = useMemo(() => {
    const set = new Set(leads.map((l) => l.source).filter(Boolean));
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    let rows = leads.filter((l) => {
      const j = getJurisdiction(jurisdictions, l.jurisdiction);
      const matchesQuery =
        query.trim() === "" ||
        l.name.toLowerCase().includes(query.toLowerCase()) ||
        l.company.toLowerCase().includes(query.toLowerCase());
      const matchesStage = stageFilter === "all" || l.stage === stageFilter;
      const matchesRisk = riskFilter === "all" || j.risk === riskFilter;
      const matchesJurisdiction = jurisdictionFilter === "all" || l.jurisdiction === jurisdictionFilter;
      const matchesSource = sourceFilter === "all" || l.source === sourceFilter;
      const matchesNetWorth = netWorthFilter === "all" || l.netWorth === netWorthFilter;
      const matchesExistingAdvisor =
        existingAdvisorFilter === "all" ||
        (existingAdvisorFilter === "yes" && l.existingAdvisor === true) ||
        (existingAdvisorFilter === "no" && l.existingAdvisor === false) ||
        (existingAdvisorFilter === "unknown" && l.existingAdvisor == null);
      const matchesMinAssets = minAssets === "" || (l.assets ?? 0) >= Number(minAssets);
      const matchesMaxAssets = maxAssets === "" || (l.assets ?? 0) <= Number(maxAssets);
      const matchesMinScore = minScore === "" || l.score >= Number(minScore);
      const matchesLinkedin =
        linkedinFilter === "all" ||
        (linkedinFilter === "has" && !!l.linkedinUrl) ||
        (linkedinFilter === "missing" && !l.linkedinUrl);
      return (
        matchesQuery && matchesStage && matchesRisk && matchesJurisdiction &&
        matchesSource && matchesNetWorth && matchesExistingAdvisor &&
        matchesMinAssets && matchesMaxAssets && matchesMinScore && matchesLinkedin
      );
    });

    rows.sort((a, b) => {
      let av, bv;
      if (sortKey === "score") { av = a.score; bv = b.score; }
      else if (sortKey === "assets") { av = a.assets ?? -1; bv = b.assets ?? -1; }
      else if (sortKey === "name") { av = a.name; bv = b.name; }
      else { av = a.score; bv = b.score; }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [
    leads, query, stageFilter, riskFilter, jurisdictionFilter, sourceFilter,
    netWorthFilter, existingAdvisorFilter, minAssets, maxAssets, minScore, linkedinFilter,
    sortKey, sortDir,
  ]);

  const activeFilterCount = [
    stageFilter !== "all", riskFilter !== "all", jurisdictionFilter !== "all",
    sourceFilter !== "all", netWorthFilter !== "all", existingAdvisorFilter !== "all",
    minAssets !== "", maxAssets !== "", minScore !== "", linkedinFilter !== "all",
  ].filter(Boolean).length;

  function clearAllFilters() {
    setStageFilter("all"); setRiskFilter("all"); setJurisdictionFilter("all");
    setSourceFilter("all"); setNetWorthFilter("all"); setExistingAdvisorFilter("all");
    setMinAssets(""); setMaxAssets(""); setMinScore(""); setLinkedinFilter("all");
  }

  const stats = useMemo(() => {
    const total = leads.length;
    const qualifiedOrClient = leads.filter((l) => l.stage === "qualified" || l.stage === "client").length;
    const blocked = leads.filter((l) => getJurisdiction(jurisdictions, l.jurisdiction).risk === "do_not_contact").length;
    const pipelineAssets = leads
      .filter((l) => l.stage !== "disqualified")
      .reduce((sum, l) => sum + (l.assets ?? 0), 0);
    return { total, qualifiedOrClient, blocked, pipelineAssets };
  }, [leads]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const [enrollments, setEnrollments] = useState([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    setNoteDraft(selected?.notes ?? "");
    setEditingDetails(false);
    setSelectedSequenceId("");
    setEnrollments([]);
    if (selectedId && onGetEnrollments) {
      onGetEnrollments(selectedId).then(setEnrollments).catch(() => setEnrollments([]));
    }
  }, [selectedId]);

  async function handleSaveNotes() {
    if (!selected) return;
    setSavingNotes(true);
    try {
      if (onUpdateNotes) await onUpdateNotes(selected.id, noteDraft);
      else setLocalLeads((prev) => prev.map((l) => (l.id === selected.id ? { ...l, notes: noteDraft } : l)));
    } finally {
      setSavingNotes(false);
    }
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortHeader({ label, sortK, align = "left" }) {
    const active = sortKey === sortK;
    return (
      <button
        onClick={() => toggleSort(sortK)}
        className="flex items-center gap-1 select-none"
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          justifyContent: align === "right" ? "flex-end" : "flex-start",
          width: "100%",
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: active ? TOKENS.textPrimary : TOKENS.textFaint,
        }}
      >
        {label}
        {active && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    );
  }

  return (
    <div style={{ background: TOKENS.bg, minHeight: "100%", color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Masthead */}
        <div className="flex items-baseline justify-between border-b pb-5 mb-6" style={{ borderColor: TOKENS.border }}>
          <div>
            <h1 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, letterSpacing: "-0.01em" }}>
              Prospect Ledger
            </h1>
            <p style={{ color: TOKENS.textMuted, fontSize: 13, marginTop: 2 }}>
              Personal book
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TOKENS.textFaint, textAlign: "right" }}>
              as of {formatDate("2026-07-31")}
            </div>
            <button
              onClick={async () => {
                if (!onRecalculateScores) return;
                setRecalculating(true);
                try {
                  const result = await onRecalculateScores();
                  alert(`Rescored ${result.succeeded} of ${result.total} prospects.`);
                } finally {
                  setRecalculating(false);
                }
              }}
              disabled={recalculating}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: TOKENS.surfaceRaised, color: TOKENS.textPrimary, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: recalculating ? "default" : "pointer",
                opacity: recalculating ? 0.6 : 1,
              }}
            >
              <RefreshCw size={14} /> {recalculating ? "Scoring…" : "Recalculate scores"}
            </button>
            <button
              onClick={() => setShowImport(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: TOKENS.surfaceRaised, color: TOKENS.textPrimary, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <FileUp size={14} /> Import Excel
            </button>
            <button
              onClick={() => setShowAddLead(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} /> Add lead
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-4 gap-px mb-7" style={{ background: TOKENS.border }}>
          {[
            { label: "Total prospects", value: stats.total },
            { label: "Qualified or client", value: stats.qualifiedOrClient },
            { label: "Blocked — compliance", value: stats.blocked, warn: stats.blocked > 0 },
            { label: "Pipeline assets (est.)", value: formatMoney(stats.pipelineAssets) },
          ].map((s) => (
            <div key={s.label} style={{ background: TOKENS.surface, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: TOKENS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 22,
                  color: s.warn ? TOKENS.riskBlocked : TOKENS.textPrimary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div
            className="flex items-center gap-2 px-3"
            style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 34, flex: "1 1 220px" }}
          >
            <Search size={14} color={TOKENS.textFaint} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or company"
              style={{ background: "none", border: "none", outline: "none", color: TOKENS.textPrimary, fontSize: 13, width: "100%" }}
            />
          </div>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{
              background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
              height: 34, padding: "0 10px", color: TOKENS.textPrimary, fontSize: 13,
            }}
          >
            <option value="all">All stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={jurisdictionFilter}
            onChange={(e) => setJurisdictionFilter(e.target.value)}
            style={{
              background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
              height: 34, padding: "0 10px", color: TOKENS.textPrimary, fontSize: 13, maxWidth: 180,
            }}
          >
            <option value="all">All countries</option>
            {Object.entries(jurisdictions).sort((a, b) => a[1].country.localeCompare(b[1].country)).map(([id, j]) => (
              <option key={id} value={id}>{j.country}</option>
            ))}
          </select>

          <button
            onClick={() => setShowMoreFilters((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: showMoreFilters ? TOKENS.surfaceRaised : TOKENS.surface,
              border: `1px solid ${activeFilterCount > 0 ? TOKENS.gold : TOKENS.border}`, borderRadius: 6,
              height: 34, padding: "0 12px", color: TOKENS.textPrimary, fontSize: 13, cursor: "pointer",
            }}
          >
            <SlidersHorizontal size={13} />
            More filters
            {activeFilterCount > 0 && (
              <span style={{
                background: TOKENS.gold, color: TOKENS.bg, borderRadius: 999, fontSize: 11,
                fontWeight: 700, padding: "1px 6px", minWidth: 16, textAlign: "center",
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              style={{ background: "none", border: "none", color: TOKENS.textFaint, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
            >
              Clear filters
            </button>
          )}
        </div>

        {showMoreFilters && (
          <div
            className="grid grid-cols-4 gap-3 mb-4 p-4"
            style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 8 }}
          >
            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Compliance status
              </label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              >
                <option value="all">Any</option>
                <option value="low">Cleared</option>
                <option value="review_required">Review required</option>
                <option value="do_not_contact">Blocked</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              >
                <option value="all">Any</option>
                {distinctSources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Net worth signal
              </label>
              <select
                value={netWorthFilter}
                onChange={(e) => setNetWorthFilter(e.target.value)}
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              >
                <option value="all">Any</option>
                <option value="unknown">Unknown</option>
                <option value="exited_founder">Exited founder</option>
                <option value="senior_exec">Senior exec</option>
                <option value="inherited_wealth">Inherited wealth</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Existing advisor
              </label>
              <select
                value={existingAdvisorFilter}
                onChange={(e) => setExistingAdvisorFilter(e.target.value)}
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              >
                <option value="all">Any</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Min assets (£)
              </label>
              <input
                type="number" value={minAssets} onChange={(e) => setMinAssets(e.target.value)} placeholder="0"
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Max assets (£)
              </label>
              <input
                type="number" value={maxAssets} onChange={(e) => setMaxAssets(e.target.value)} placeholder="No limit"
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                Min score
              </label>
              <input
                type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="0" min={0} max={100}
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 5, display: "block" }}>
                LinkedIn
              </label>
              <select
                value={linkedinFilter}
                onChange={(e) => setLinkedinFilter(e.target.value)}
                style={{ width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6, height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5 }}
              >
                <option value="all">Any</option>
                <option value="has">Has profile</option>
                <option value="missing">Missing</option>
              </select>
            </div>
          </div>
        )}

        {/* Result count */}
        <div style={{ fontSize: 12.5, color: TOKENS.textFaint, marginBottom: 10 }}>
          Showing <span style={{ color: TOKENS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</span> of{" "}
          <span style={{ color: TOKENS.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{leads.length}</span> prospects
          {activeFilterCount > 0 || query.trim() !== "" ? " (filtered)" : ""}
        </div>

        {/* Bulk action bar — only shown when something's selected */}
        {selectedForBulk.size > 0 && (
          <div
            className="flex items-center gap-3 mb-3 px-4"
            style={{ background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.gold}55`, borderRadius: 8, height: 44 }}
          >
            <span style={{ fontSize: 13, color: TOKENS.textPrimary }}>
              {selectedForBulk.size} selected
            </span>
            <select
              value={bulkJurisdictionId}
              onChange={(e) => setBulkJurisdictionId(e.target.value)}
              style={{
                background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                height: 30, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5,
              }}
            >
              <option value="">Assign jurisdiction…</option>
              {Object.entries(jurisdictions).sort((a, b) => a[1].country.localeCompare(b[1].country)).map(([id, j]) => (
                <option key={id} value={id}>{j.country}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!bulkJurisdictionId || !onBulkAssignJurisdiction) return;
                setBulkWorking(true);
                try {
                  await onBulkAssignJurisdiction(Array.from(selectedForBulk), bulkJurisdictionId);
                  setSelectedForBulk(new Set());
                  setBulkJurisdictionId("");
                } finally {
                  setBulkWorking(false);
                }
              }}
              disabled={!bulkJurisdictionId || bulkWorking}
              style={{
                background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                opacity: !bulkJurisdictionId || bulkWorking ? 0.5 : 1,
              }}
            >
              {bulkWorking ? "Applying…" : "Apply"}
            </button>
            <button
              onClick={async () => {
                if (!onBulkDeleteLeads) return;
                if (!window.confirm(`Delete ${selectedForBulk.size} prospects? This cannot be undone.`)) return;
                setBulkWorking(true);
                try {
                  await onBulkDeleteLeads(Array.from(selectedForBulk));
                  setSelectedForBulk(new Set());
                } finally {
                  setBulkWorking(false);
                }
              }}
              disabled={bulkWorking}
              style={{
                background: "none", color: TOKENS.riskBlocked, border: `1px solid ${TOKENS.riskBlocked}55`, borderRadius: 6,
                padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
              }}
            >
              Delete selected
            </button>
            <button
              onClick={() => setSelectedForBulk(new Set())}
              style={{ background: "none", border: "none", color: TOKENS.textFaint, fontSize: 12.5, cursor: "pointer", marginLeft: "auto" }}
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div
            className="grid items-center px-4 py-2.5"
            style={{
              gridTemplateColumns: "24px 28px 2fr 1.3fr 1fr 1fr 1fr 0.9fr",
              gap: 12,
              background: TOKENS.surfaceRaised,
              borderBottom: `1px solid ${TOKENS.border}`,
            }}
          >
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((l) => selectedForBulk.has(l.id))}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedForBulk(new Set(filtered.map((l) => l.id)));
                } else {
                  setSelectedForBulk(new Set());
                }
              }}
              style={{ cursor: "pointer" }}
            />
            <div />
            <SortHeader label="Prospect" sortK="name" />
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TOKENS.textFaint }}>Jurisdiction</div>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TOKENS.textFaint }}>Stage</div>
            <SortHeader label="Est. assets" sortK="assets" />
            <SortHeader label="Score" sortK="score" />
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TOKENS.textFaint }}>Last contact</div>
          </div>

          {filtered.map((lead, i) => {
            const j = getJurisdiction(jurisdictions, lead.jurisdiction);
            const blocked = j.risk === "do_not_contact";
            return (
              <div
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                className="grid items-center px-4 cursor-pointer"
                style={{
                  gridTemplateColumns: "24px 28px 2fr 1.3fr 1fr 1fr 1fr 0.9fr",
                  gap: 12,
                  padding: "12px 16px",
                  background: i % 2 === 0 ? TOKENS.surface : "transparent",
                  borderBottom: i < filtered.length - 1 ? `1px solid ${TOKENS.borderFaint}` : "none",
                  opacity: blocked ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedForBulk.has(lead.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    setSelectedForBulk((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(lead.id);
                      else next.delete(lead.id);
                      return next;
                    });
                  }}
                  style={{ cursor: "pointer" }}
                />
                <Seal risk={j.risk} size={26} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: 14, color: TOKENS.textPrimary }}>{lead.name}</span>
                    {lead.linkedinUrl && (
                      <a
                        href={lead.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Open LinkedIn profile"
                        style={{ display: "inline-flex", color: "#4C8FDB", flexShrink: 0 }}
                      >
                        <Linkedin size={13} />
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textFaint }}>{lead.title} · {lead.company}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13 }}>{j.country}</div>
                  <div style={{ fontSize: 11, color: TOKENS.textFaint }}>{j.license ?? "unlicensed market"}</div>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 11.5, padding: "2px 8px", borderRadius: 999,
                      background: TOKENS.surfaceRaised, color: TOKENS.textMuted, border: `1px solid ${TOKENS.border}`,
                    }}
                  >
                    {STAGE_LABELS[lead.stage]}
                  </span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(lead.assets)}
                </div>
                <ScoreBar score={lead.score} />
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={12} color={TOKENS.textFaint} />
                  {formatDate(lead.lastContact)}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: TOKENS.textFaint, fontSize: 13 }}>
              No prospects match these filters.
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div
          onClick={() => setSelectedId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,9,13,0.6)", display: "flex", justifyContent: "flex-end", zIndex: 40 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 400, maxWidth: "90vw", height: "100%", background: TOKENS.surface,
              borderLeft: `1px solid ${TOKENS.border}`, padding: "24px 22px", overflowY: "auto",
            }}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <Seal risk={getJurisdiction(jurisdictions, selected.jurisdiction).risk} size={36} />
                <div>
                  <div style={{ fontFamily: "'Newsreader', serif", fontSize: 19 }}>{selected.name}</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textFaint }}>{selected.title} · {selected.company}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${selected.name}? This cannot be undone.`)) {
                      if (onDeleteLead) onDeleteLead(selected.id);
                      else setLocalLeads((prev) => prev.filter((l) => l.id !== selected.id));
                      setSelectedId(null);
                    }
                  }}
                  title="Delete prospect"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <Trash2 size={17} color={TOKENS.riskBlocked} />
                </button>
                <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={18} color={TOKENS.textFaint} />
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 6, marginBottom: 18,
                background: `${RISK_META[getJurisdiction(jurisdictions, selected.jurisdiction).risk].color}14`,
                border: `1px solid ${RISK_META[getJurisdiction(jurisdictions, selected.jurisdiction).risk].color}55`,
              }}
            >
              <Circle size={7} fill={RISK_META[getJurisdiction(jurisdictions, selected.jurisdiction).risk].color} color={RISK_META[getJurisdiction(jurisdictions, selected.jurisdiction).risk].color} />
              <span style={{ fontSize: 12.5, color: TOKENS.textPrimary }}>
                {getJurisdiction(jurisdictions, selected.jurisdiction).country} — {RISK_META[getJurisdiction(jurisdictions, selected.jurisdiction).risk].label}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: TOKENS.textFaint }}>
                {getJurisdiction(jurisdictions, selected.jurisdiction).license ?? "no license mapped"}
              </span>
            </div>

            <div className="mb-5">
              <dt style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 5 }}>
                Stage
              </dt>
              <select
                value={selected.stage}
                onChange={(e) => handleStageChange(selected.id, e.target.value)}
                style={{
                  background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                  height: 32, padding: "0 10px", color: TOKENS.textPrimary, fontSize: 13, width: "100%",
                }}
              >
                {Object.entries(STAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between mb-3">
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint }}>
                Details
              </div>
              {!editingDetails && (
                <button
                  onClick={startEditingDetails}
                  style={{ background: "none", border: "none", color: TOKENS.gold, fontSize: 12, cursor: "pointer" }}
                >
                  Edit
                </button>
              )}
            </div>

            {!editingDetails ? (
              <dl className="grid grid-cols-2 gap-y-4 gap-x-3 mb-6">
                {[
                  ["Score", selected.score],
                  ["Est. assets", formatMoney(selected.assets)],
                  ["Email", selected.email || "—"],
                  ["Phone", selected.phone || "—"],
                  ["LinkedIn", selected.linkedinUrl || "—"],
                  ["Net worth signal", selected.netWorth ?? "unknown"],
                  ["Source", selected.source],
                  ["Referred by", selected.referredBy || "—"],
                  ["Liquidity event", selected.liquidityEvent === "none" ? "—" : selected.liquidityEvent],
                  ["Event date", formatDate(selected.liquidityDate)],
                  ["Existing advisor", selected.existingAdvisor == null ? "Unknown" : selected.existingAdvisor ? "Yes" : "No"],
                  ["Current provider", selected.currentProvider || "—"],
                  ["Risk profile", selected.riskProfile || "—"],
                  ["Preferred contact", selected.preferredContactMethod || "—"],
                  ["Next follow-up", formatDate(selected.nextFollowUpDate)],
                  ["Date of birth", formatDate(selected.dateOfBirth)],
                  ["Last contact", formatDate(selected.lastContact)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 3 }}>
                      {label}
                    </dt>
                    <dd style={{ fontSize: 13.5, color: TOKENS.textPrimary, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-word" }}>{value}</dd>
                  </div>
                ))}
                <div className="col-span-2">
                  <dt style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 3 }}>
                    Current investment products
                  </dt>
                  <dd style={{ fontSize: 13.5, color: TOKENS.textPrimary, lineHeight: 1.5 }}>
                    {selected.currentInvestmentProducts || "—"}
                  </dd>
                </div>
                {selected.adTracking && (
                  <div className="col-span-2" style={{ background: TOKENS.surfaceRaised, borderRadius: 6, padding: 10, marginTop: 4 }}>
                    <dt style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 6 }}>
                      Ad attribution
                    </dt>
                    <dd style={{ fontSize: 12, color: TOKENS.textMuted, lineHeight: 1.7 }}>
                      {selected.adTracking.campaign_name && <div>Campaign: {selected.adTracking.campaign_name}</div>}
                      {selected.adTracking.adset_name && <div>Ad set: {selected.adTracking.adset_name}</div>}
                      {selected.adTracking.ad_name && <div>Ad: {selected.adTracking.ad_name}</div>}
                      {selected.adTracking.placement && <div>Placement: {selected.adTracking.placement}</div>}
                      {selected.adTracking.utm_source && <div>Source: {selected.adTracking.utm_source}</div>}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="mb-6">
                {(() => {
                  const inputStyle = {
                    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                    padding: "7px 9px", fontSize: 12.5, color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif",
                  };
                  const labelStyle = {
                    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 4, display: "block",
                  };
                  const dset = (field, value) => setDetailsDraft((d) => ({ ...d, [field]: value }));
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div><label style={labelStyle}>Email</label><input style={inputStyle} value={detailsDraft.email} onChange={(e) => dset("email", e.target.value)} /></div>
                      <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={detailsDraft.phone} onChange={(e) => dset("phone", e.target.value)} /></div>
                      <div className="col-span-2"><label style={labelStyle}>LinkedIn URL</label><input style={inputStyle} value={detailsDraft.linkedin_url} onChange={(e) => dset("linkedin_url", e.target.value)} /></div>
                      <div><label style={labelStyle}>Company</label><input style={inputStyle} value={detailsDraft.company} onChange={(e) => dset("company", e.target.value)} /></div>
                      <div><label style={labelStyle}>Job title</label><input style={inputStyle} value={detailsDraft.job_title} onChange={(e) => dset("job_title", e.target.value)} /></div>
                      <div className="col-span-2">
                        <label style={labelStyle}>Jurisdiction</label>
                        <select style={inputStyle} value={detailsDraft.jurisdiction_id} onChange={(e) => dset("jurisdiction_id", e.target.value)}>
                          <option value="">Not set</option>
                          {Object.entries(jurisdictions).sort((a, b) => a[1].country.localeCompare(b[1].country)).map(([id, j]) => (
                            <option key={id} value={id}>{j.country}</option>
                          ))}
                          <option value="__other__">Other — add new…</option>
                        </select>
                        {detailsDraft.jurisdiction_id === "__other__" && (
                          <input
                            style={{ ...inputStyle, marginTop: 8 }}
                            value={detailsNewCountry}
                            onChange={(e) => setDetailsNewCountry(e.target.value)}
                            placeholder="Country name"
                            autoFocus
                          />
                        )}
                      </div>
                      <div>
                        <label style={labelStyle}>Date of birth</label>
                        <input type="date" style={inputStyle} value={detailsDraft.date_of_birth} onChange={(e) => dset("date_of_birth", e.target.value)} />
                      </div>
                      <div>
                        <label style={labelStyle}>Net worth signal</label>
                        <select style={inputStyle} value={detailsDraft.net_worth_signal} onChange={(e) => dset("net_worth_signal", e.target.value)}>
                          <option value="unknown">Unknown</option>
                          <option value="exited_founder">Exited founder</option>
                          <option value="senior_exec">Senior exec</option>
                          <option value="inherited_wealth">Inherited wealth</option>
                        </select>
                      </div>
                      <div><label style={labelStyle}>Est. assets (£)</label><input type="number" style={inputStyle} value={detailsDraft.estimated_investable_assets} onChange={(e) => dset("estimated_investable_assets", e.target.value)} /></div>
                      <div>
                        <label style={labelStyle}>Liquidity event</label>
                        <select style={inputStyle} value={detailsDraft.liquidity_event} onChange={(e) => dset("liquidity_event", e.target.value)}>
                          <option value="none">None</option>
                          <option value="exit">Exit</option>
                          <option value="ipo">IPO</option>
                          <option value="inheritance">Inheritance</option>
                          <option value="retirement">Retirement</option>
                        </select>
                      </div>
                      <div><label style={labelStyle}>Event date</label><input type="date" style={inputStyle} value={detailsDraft.liquidity_event_date} onChange={(e) => dset("liquidity_event_date", e.target.value)} /></div>
                      <div>
                        <label style={labelStyle}>Existing advisor?</label>
                        <select style={inputStyle} value={detailsDraft.existing_advisor} onChange={(e) => dset("existing_advisor", e.target.value)}>
                          <option value="">Unknown</option>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      <div><label style={labelStyle}>Current provider</label><input style={inputStyle} value={detailsDraft.current_provider} onChange={(e) => dset("current_provider", e.target.value)} placeholder="e.g. their current bank" /></div>
                      <div className="col-span-2">
                        <label style={labelStyle}>Current investment products</label>
                        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={detailsDraft.current_investment_products} onChange={(e) => dset("current_investment_products", e.target.value)} placeholder="Funds, direct equities, real estate, etc." />
                      </div>
                      <div>
                        <label style={labelStyle}>Risk profile</label>
                        <select style={inputStyle} value={detailsDraft.risk_profile} onChange={(e) => dset("risk_profile", e.target.value)}>
                          <option value="">Unknown</option>
                          <option value="conservative">Conservative</option>
                          <option value="balanced">Balanced</option>
                          <option value="growth">Growth</option>
                          <option value="aggressive">Aggressive</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Preferred contact</label>
                        <select style={inputStyle} value={detailsDraft.preferred_contact_method} onChange={(e) => dset("preferred_contact_method", e.target.value)}>
                          <option value="">Unknown</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="linkedin">LinkedIn</option>
                        </select>
                      </div>
                      <div><label style={labelStyle}>Next follow-up</label><input type="date" style={inputStyle} value={detailsDraft.next_follow_up_date} onChange={(e) => dset("next_follow_up_date", e.target.value)} /></div>
                      <div><label style={labelStyle}>Referred by</label><input style={inputStyle} value={detailsDraft.referred_by} onChange={(e) => dset("referred_by", e.target.value)} /></div>
                    </div>
                  );
                })()}
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setEditingDetails(false)}
                    style={{ flex: 1, background: TOKENS.surfaceRaised, color: TOKENS.textMuted, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "8px 0", fontSize: 12.5, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDetails}
                    disabled={savingDetails}
                    style={{ flex: 1, background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "8px 0", fontSize: 12.5, fontWeight: 600, cursor: savingDetails ? "default" : "pointer" }}
                  >
                    {savingDetails ? "Saving…" : "Save details"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 6 }}>
              Notes
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="No notes yet — start typing…"
              rows={4}
              style={{
                width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                padding: "10px 12px", fontSize: 13.5, lineHeight: 1.55, color: TOKENS.textPrimary, marginBottom: 10,
                resize: "vertical", fontFamily: "'Inter', sans-serif",
              }}
            />
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || noteDraft === (selected.notes ?? "")}
              style={{
                background: noteDraft === (selected.notes ?? "") ? TOKENS.surfaceRaised : TOKENS.gold,
                color: noteDraft === (selected.notes ?? "") ? TOKENS.textFaint : TOKENS.bg,
                border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "7px 14px",
                fontSize: 12.5, fontWeight: 600, cursor: savingNotes ? "default" : "pointer", marginBottom: 20,
              }}
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>

            <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 10 }}>
                Sequences
              </div>

              {enrollments.length > 0 && (
                <div className="mb-3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {enrollments.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between"
                      style={{
                        background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                        padding: "8px 10px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12.5, color: TOKENS.textPrimary }}>{e.sequences?.name ?? "Unknown sequence"}</div>
                        <div style={{ fontSize: 11, color: TOKENS.textFaint, marginTop: 1 }}>
                          {e.status} · step {e.current_step ?? 0} · enrolled {formatDate(e.enrolled_at)}
                        </div>
                      </div>
                      {e.status === "active" && (
                        <button
                          onClick={async () => {
                            if (!onStopEnrollment) return;
                            if (!window.confirm("Stop this sequence? Any pending sends for it will be cancelled.")) return;
                            await onStopEnrollment(e.id);
                            if (onGetEnrollments) setEnrollments(await onGetEnrollments(selected.id));
                          }}
                          style={{
                            fontSize: 11.5, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                            background: `${TOKENS.riskBlocked}18`, color: TOKENS.riskBlocked, border: `1px solid ${TOKENS.riskBlocked}55`,
                          }}
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <select
                  value={selectedSequenceId}
                  onChange={(e) => setSelectedSequenceId(e.target.value)}
                  style={{
                    flex: 1, background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
                    height: 32, padding: "0 8px", color: TOKENS.textPrimary, fontSize: 12.5,
                  }}
                >
                  <option value="">Select sequence…</option>
                  {(sequences ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (!selectedSequenceId || !onEnrollLead) return;
                    setEnrolling(true);
                    try {
                      await onEnrollLead(selected.id, selectedSequenceId);
                      setSelectedSequenceId("");
                      if (onGetEnrollments) setEnrollments(await onGetEnrollments(selected.id));
                    } catch (err) {
                      alert(`Couldn't enroll: ${err?.message ?? err}`);
                    } finally {
                      setEnrolling(false);
                    }
                  }}
                  disabled={!selectedSequenceId || enrolling}
                  style={{
                    background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                    padding: "0 14px", fontSize: 12.5, fontWeight: 600, cursor: enrolling ? "default" : "pointer",
                    opacity: !selectedSequenceId || enrolling ? 0.6 : 1,
                  }}
                >
                  {enrolling ? "Enrolling…" : "Enroll"}
                </button>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 16, marginBottom: 16 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontSize: 13, color: TOKENS.textPrimary }}>
                    {selected.optedOut ? "Opted out" : "Contact permitted"}
                  </div>
                  <div style={{ fontSize: 11.5, color: TOKENS.textFaint, marginTop: 2 }}>
                    {selected.optedOut
                      ? `Opted out${selected.optedOutAt ? " on " + formatDate(selected.optedOutAt) : ""} — all sequences stopped, no further contact.`
                      : "Mark opted out if they ask not to be contacted again."}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!onUpdateDetails) return;
                    const next = !selected.optedOut;
                    if (next && !window.confirm(`Mark ${selected.name} as opted out? This stops all active sequences immediately and cannot be reversed lightly.`)) {
                      return;
                    }
                    await onUpdateDetails(selected.id, {
                      opted_out: next,
                      opted_out_at: next ? new Date().toISOString() : null,
                    });
                  }}
                  style={{
                    fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
                    background: selected.optedOut ? `${TOKENS.riskLow}18` : `${TOKENS.riskBlocked}18`,
                    color: selected.optedOut ? TOKENS.riskLow : TOKENS.riskBlocked,
                    border: `1px solid ${selected.optedOut ? TOKENS.riskLow : TOKENS.riskBlocked}55`,
                  }}
                >
                  {selected.optedOut ? "Restore contact" : "Mark opted out"}
                </button>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 16 }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 8 }}>
                Compliance note
              </div>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: TOKENS.textFaint }}>
                {selected.optedOut
                  ? "This person has opted out. No further contact of any kind should be made."
                  : getJurisdiction(jurisdictions, selected.jurisdiction).risk === "do_not_contact"
                  ? "This jurisdiction is flagged do-not-contact. Do not initiate outreach until a compliance review clears it."
                  : getJurisdiction(jurisdictions, selected.jurisdiction).risk === "review_required"
                  ? "Solicitation rules for this market haven't been confirmed yet. Log a review before first contact."
                  : "Jurisdiction cleared for outreach under the mapped license."}
              </p>
            </div>
          </div>
        </div>
      )}

      {showAddLead && (
        <AddLeadModal
          jurisdictions={jurisdictions}
          onAddJurisdiction={onAddJurisdiction}
          onClose={() => setShowAddLead(false)}
          onSubmit={async (data) => {
            if (onAddLead) {
              await onAddLead(data);
            } else {
              setLocalLeads((prev) => [
                { ...data, id: String(Date.now()), stage: "new", score: 0 },
                ...prev,
              ]);
            }
            setShowAddLead(false);
          }}
        />
      )}

      {showImport && (
        <ImportModal
          jurisdictions={jurisdictions}
          onClose={() => setShowImport(false)}
          onImport={async (rows) => {
            if (onImportLeads) return onImportLeads(rows);
            setLocalLeads((prev) => [
              ...rows.map((r) => ({ ...r, id: String(Date.now()) + Math.random(), stage: "new", score: 0 })),
              ...prev,
            ]);
            return { inserted: rows.length, failed: 0 };
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// ADD LEAD MODAL
// Manual entry point — the same 'new' stage entry point the
// enrichment pipeline uses, so a manually-added lead flows
// through the same enrich -> score -> review -> sequence path.
// ============================================================
function AddLeadModal({ jurisdictions, onAddJurisdiction, onClose, onSubmit }) {
  const [form, setForm] = useState({
    full_name: "", email: "", company: "", job_title: "",
    jurisdiction_id: "", net_worth_signal: "unknown",
    estimated_investable_assets: "", liquidity_event: "none",
    liquidity_event_date: "", existing_advisor: "",
    source: "manual", referred_by: "", notes: "", date_of_birth: "",
  });
  const [newCountry, setNewCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError("Name is required.");
      return;
    }
    if (form.jurisdiction_id === "__other__" && !newCountry.trim()) {
      setError("Enter the country name, or pick an existing jurisdiction.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let jurisdictionId = form.jurisdiction_id;
      if (jurisdictionId === "__other__") {
        if (!onAddJurisdiction) {
          throw new Error("Adding a new jurisdiction isn't available in this view.");
        }
        const created = await onAddJurisdiction(newCountry.trim());
        jurisdictionId = created.id;
      }
      await onSubmit({
        full_name: form.full_name,
        email: form.email || undefined,
        company: form.company || undefined,
        job_title: form.job_title || undefined,
        jurisdiction_id: jurisdictionId || null,
        net_worth_signal: form.net_worth_signal,
        estimated_investable_assets: form.estimated_investable_assets
          ? Number(form.estimated_investable_assets)
          : null,
        liquidity_event: form.liquidity_event,
        liquidity_event_date: form.liquidity_event_date || null,
        existing_advisor: form.existing_advisor === "" ? null : form.existing_advisor === "yes",
        date_of_birth: form.date_of_birth || null,
        source: form.source,
        referred_by: form.referred_by || undefined,
        notes: form.notes || undefined,
      });
    } catch (err) {
      setError(err?.message ?? "Failed to add lead.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
    padding: "8px 10px", fontSize: 13, color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif",
  };
  const labelStyle = {
    fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textFaint, marginBottom: 5, display: "block",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(6,9,13,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
          padding: 26, width: 480, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 20 }}>Add prospect</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color={TOKENS.textFaint} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2">
            <label style={labelStyle}>Full name *</label>
            <input style={inputStyle} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@company.com" />
          </div>
          <div>
            <label style={labelStyle}>Job title</label>
            <input style={inputStyle} value={form.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Founder & CEO" />
          </div>
          <div className="col-span-2">
            <label style={labelStyle}>Company</label>
            <input style={inputStyle} value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" />
          </div>

          <div className="col-span-2">
            <label style={labelStyle}>Jurisdiction</label>
            <select style={inputStyle} value={form.jurisdiction_id} onChange={(e) => set("jurisdiction_id", e.target.value)}>
              <option value="">Select jurisdiction…</option>
              {Object.entries(jurisdictions)
                .sort((a, b) => a[1].country.localeCompare(b[1].country))
                .map(([id, j]) => (
                  <option key={id} value={id}>{j.country}</option>
                ))}
              <option value="__other__">Other — add new…</option>
            </select>
            {form.jurisdiction_id === "__other__" && (
              <input
                style={{ ...inputStyle, marginTop: 8 }}
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                placeholder="Country name"
                autoFocus
              />
            )}
          </div>

          <div>
            <label style={labelStyle}>Net worth signal</label>
            <select style={inputStyle} value={form.net_worth_signal} onChange={(e) => set("net_worth_signal", e.target.value)}>
              <option value="unknown">Unknown</option>
              <option value="exited_founder">Exited founder</option>
              <option value="senior_exec">Senior exec</option>
              <option value="inherited_wealth">Inherited wealth</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Est. assets (£)</label>
            <input type="number" style={inputStyle} value={form.estimated_investable_assets} onChange={(e) => set("estimated_investable_assets", e.target.value)} placeholder="1000000" />
          </div>

          <div>
            <label style={labelStyle}>Liquidity event</label>
            <select style={inputStyle} value={form.liquidity_event} onChange={(e) => set("liquidity_event", e.target.value)}>
              <option value="none">None</option>
              <option value="exit">Exit</option>
              <option value="ipo">IPO</option>
              <option value="inheritance">Inheritance</option>
              <option value="retirement">Retirement</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Event date</label>
            <input type="date" style={inputStyle} value={form.liquidity_event_date} onChange={(e) => set("liquidity_event_date", e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Existing advisor?</label>
            <select style={inputStyle} value={form.existing_advisor} onChange={(e) => set("existing_advisor", e.target.value)}>
              <option value="">Unknown</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of birth</label>
            <input type="date" style={inputStyle} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <select style={inputStyle} value={form.source} onChange={(e) => set("source", e.target.value)}>
              <option value="manual">Manual entry</option>
              <option value="referral">Referral</option>
              <option value="linkedin">LinkedIn</option>
              <option value="event">Event</option>
            </select>
          </div>

          {form.source === "referral" && (
            <div className="col-span-2">
              <label style={labelStyle}>Referred by</label>
              <input style={inputStyle} value={form.referred_by} onChange={(e) => set("referred_by", e.target.value)} placeholder="Who referred them" />
            </div>
          )}

          <div className="col-span-2">
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        {error && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
            padding: "10px 0", fontSize: 13.5, fontWeight: 600, cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1, marginTop: 4,
          }}
        >
          {saving ? "Adding…" : "Add prospect"}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// IMPORT MODAL — Excel/CSV bulk lead import
// Column matching is deliberately loose (case-insensitive,
// partial match on common header variants) since real-world
// spreadsheets rarely use exact field names. Preview before
// committing, so a bad column mapping is caught before 200 rows
// land in the database.
// ============================================================
const COLUMN_ALIASES = {
  full_name: ["full name", "name", "full_name", "prospect", "contact name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "mobile phone"],
  linkedin_url: ["linkedin url", "linkedin", "person linkedin url", "linkedin_url", "profile url"],
  company: ["company", "organisation", "organization", "employer"],
  job_title: ["title", "job title", "job_title", "position", "role"],
  jurisdiction: ["jurisdiction", "country", "market", "location"],
  net_worth_signal: ["net worth signal", "net worth", "wealth signal"],
  estimated_investable_assets: ["assets", "estimated assets", "aum", "investable assets", "net worth (gbp)", "estimated_investable_assets"],
  liquidity_event: ["liquidity event", "liquidity_event", "event type"],
  source: ["source", "lead source"],
  referred_by: ["referred by", "referred_by", "referrer"],
  notes: ["notes", "comments", "remarks"],
};

function detectColumn(headers, field) {
  const aliases = COLUMN_ALIASES[field] || [];
  const lowerHeaders = headers.map((h) => String(h).toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lowerHeaders.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  // fallback: partial match
  for (const alias of aliases) {
    const idx = lowerHeaders.findIndex((h) => h.includes(alias));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function ImportModal({ jurisdictions, onClose, onImport }) {
  const [fileName, setFileName] = useState(null);
  const [rawRows, setRawRows] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!json.length) {
          setError("No rows found in that file.");
          return;
        }
        const headers = Object.keys(json[0]);
        const autoMapping = {};
        for (const field of Object.keys(COLUMN_ALIASES)) {
          autoMapping[field] = detectColumn(headers, field) || "";
        }
        setMapping(autoMapping);
        setRawRows(json);
      } catch (err) {
        setError("Couldn't read that file. Make sure it's a .xlsx, .xls, or .csv.");
      }
    };
    reader.readAsBinaryString(file);
  }

  function resolveJurisdiction(value) {
    if (!value) return null;
    const norm = String(value).trim().toLowerCase();
    for (const [id, j] of Object.entries(jurisdictions)) {
      if (j.country.toLowerCase() === norm) return id;
    }
    return null; // unmatched — lands as "Not set", not blocked
  }

  async function handleConfirm() {
    if (!rawRows) return;
    setImporting(true);
    setError(null);
    try {
      const prepared = rawRows.map((row) => {
        const rawCountry = mapping.jurisdiction ? row[mapping.jurisdiction] : "";
        const resolvedJurisdiction = rawCountry ? resolveJurisdiction(rawCountry) : null;
        const existingNotes = mapping.notes ? row[mapping.notes] : "";
        // If we couldn't match the country to a known jurisdiction,
        // keep the original text in notes rather than silently
        // losing it — otherwise there's no way to fix it later
        // without re-importing the source file.
        const unmatchedNote = rawCountry && !resolvedJurisdiction ? `Unmatched country from import: "${rawCountry}"` : "";
        const combinedNotes = [existingNotes, unmatchedNote].filter(Boolean).join(" — ");

        return {
          full_name: mapping.full_name ? row[mapping.full_name] : "",
          email: mapping.email ? row[mapping.email] : "",
          phone: mapping.phone ? row[mapping.phone] : "",
          linkedin_url: mapping.linkedin_url ? row[mapping.linkedin_url] : "",
          company: mapping.company ? row[mapping.company] : "",
          job_title: mapping.job_title ? row[mapping.job_title] : "",
          jurisdiction_id: resolvedJurisdiction,
          net_worth_signal: mapping.net_worth_signal ? row[mapping.net_worth_signal] || "unknown" : "unknown",
          estimated_investable_assets: mapping.estimated_investable_assets ? row[mapping.estimated_investable_assets] : null,
          liquidity_event: mapping.liquidity_event ? row[mapping.liquidity_event] || "none" : "none",
          source: mapping.source ? row[mapping.source] || "import" : "import",
          referred_by: mapping.referred_by ? row[mapping.referred_by] : "",
          notes: combinedNotes,
        };
      });
      const res = await onImport(prepared);
      setResult(res);
    } catch (err) {
      setError(err?.message ?? "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const inputStyle = {
    width: "100%", background: TOKENS.surfaceRaised, border: `1px solid ${TOKENS.border}`, borderRadius: 6,
    padding: "7px 9px", fontSize: 12.5, color: TOKENS.textPrimary, fontFamily: "'Inter', sans-serif",
  };
  const labelStyle = {
    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textFaint, marginBottom: 4, display: "block",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(6,9,13,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
          padding: 26, width: 560, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 20 }}>Import prospects</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color={TOKENS.textFaint} />
          </button>
        </div>

        {!rawRows && !result && (
          <div>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
              Upload an Excel (.xlsx) or CSV file. Columns are matched automatically where possible — you'll get a chance to review the mapping before anything is imported.
            </p>
            <label
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: `1.5px dashed ${TOKENS.border}`, borderRadius: 8, padding: "28px 0",
                cursor: "pointer", color: TOKENS.textMuted, fontSize: 13,
              }}
            >
              <FileUp size={16} />
              Click to choose a file
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
            {error && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5, marginTop: 12 }}>{error}</div>}
          </div>
        )}

        {rawRows && !result && (
          <div>
            <p style={{ fontSize: 12.5, color: TOKENS.textFaint, marginBottom: 14 }}>
              {fileName} — {rawRows.length} row{rawRows.length === 1 ? "" : "s"} found. Confirm the column mapping below.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {Object.keys(COLUMN_ALIASES).map((field) => (
                <div key={field}>
                  <label style={labelStyle}>{field.replace(/_/g, " ")}</label>
                  <select
                    style={inputStyle}
                    value={mapping[field] || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— not mapped —</option>
                    {Object.keys(rawRows[0]).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {!mapping.full_name && (
              <div style={{ color: TOKENS.riskReview, fontSize: 12.5, marginBottom: 12 }}>
                Map a "full name" column to continue — every prospect needs a name.
              </div>
            )}
            {error && <div style={{ color: TOKENS.riskBlocked, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setRawRows(null); setFileName(null); }}
                style={{ flex: 1, background: TOKENS.surfaceRaised, color: TOKENS.textMuted, border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "9px 0", fontSize: 13, cursor: "pointer" }}
              >
                Choose different file
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!mapping.full_name || importing}
                style={{
                  flex: 1, background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6,
                  padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: importing ? "default" : "pointer",
                  opacity: !mapping.full_name || importing ? 0.6 : 1,
                }}
              >
                {importing ? "Importing…" : `Import ${rawRows.length} prospects`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div>
            <p style={{ fontSize: 14, color: TOKENS.textPrimary, marginBottom: 6 }}>
              {result.inserted} prospect{result.inserted === 1 ? "" : "s"} imported.
            </p>
            {result.failed > 0 && (
              <p style={{ fontSize: 12.5, color: TOKENS.riskBlocked, marginBottom: 14 }}>
                {result.failed} row{result.failed === 1 ? "" : "s"} failed{result.error ? ` — ${result.error}` : " (likely missing a name)"}.
              </p>
            )}
            <p style={{ fontSize: 12.5, color: TOKENS.textFaint, marginBottom: 18 }}>
              Imported prospects land at "New" stage, same as any other source — unmapped or unmatched jurisdictions show as "Not set" and can be filled in individually.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{ width: "100%", background: TOKENS.gold, color: TOKENS.bg, border: "none", borderRadius: 6, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
