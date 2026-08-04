// Trivara brand palette — forest green, sage, ivory — replacing
// the old gold accent. Key names kept identical to what every
// screen already used (bg, surface, gold, etc.) specifically so
// each file only needs its local TOKENS block swapped for this
// import, not every individual TOKENS.xxx reference rewritten.
export const TOKENS = {
  bg: "#0E141C",
  surface: "#161E29",
  surfaceRaised: "#1C2733",
  border: "#2A3644",
  borderFaint: "#212B37",
  textPrimary: "#E7ECF2",
  textMuted: "#8B98AC",
  textFaint: "#5C6879",
  // "gold" name kept for compatibility with existing call sites —
  // value is now Trivara's sage green, the primary brand accent.
  gold: "#5B9179",
  // Trivara's deeper forest green — used where a darker accent
  // reads better (hover states, filled badges).
  accentDeep: "#1B3B2F",
  // Trivara's ivory — sparing use, mainly on light surfaces.
  ivory: "#F5F0E1",
  riskLow: "#4C9E76",
  riskReview: "#D9A441",
  riskBlocked: "#BD5A47",
};

export const NAV_BG = "#0A0F16";
export const BORDER = "#2A3644";
