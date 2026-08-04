// Trivara brand palette, v2 — forest green page background, white
// cards, sage accent. Confirmed direction: option A (full light/green)
// from the in-chat mockup comparison.
//
// IMPORTANT — this flips what textPrimary/textMuted/textFaint mean:
// almost all actual content (stat values, table rows, form fields)
// sits on WHITE cards now, not on the raw green background, so
// these are tuned for dark-text-on-white. The few things that sit
// directly on the green page background (page titles, subtitles)
// use TOKENS.ivory instead — see the pattern in each file's header.
export const TOKENS = {
  bg: "#1B3B2F",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  border: "rgba(27, 59, 47, 0.14)",
  borderFaint: "rgba(27, 59, 47, 0.08)",
  textPrimary: "#1B3B2F",
  textMuted: "#4C6357",
  textFaint: "#7A8F84",
  gold: "#5B9179",
  accentDeep: "#1B3B2F",
  // Text color for content sitting directly on the green page
  // background (titles, subtitles) — NOT for content inside white
  // cards, which uses textPrimary/textMuted/textFaint above.
  ivory: "#F5F0E1",
  ivoryMuted: "#A9C9B8",
  riskLow: "#4C9E76",
  riskReview: "#D9A441",
  riskBlocked: "#BD5A47",
};

export const NAV_BG = "#FFFFFF";
export const BORDER = "rgba(27, 59, 47, 0.14)";

