/**
 * Portal signing theme — the same calm teal/blue brand the portal-home polish
 * (PR #42) uses, replicated locally so this branch (stacked on #43) has no
 * cross-PR import dependency. Text on a colored tint uses the dark shade of that
 * same ramp; AA-verified pairs. Two text weights (400/500).
 */
export const PORTAL_PALETTE = {
  tealCore: "#1D9E75",
  tealDeep: "#0F6E56", // text on teal wash (5.48:1)
  tealWash: "#E1F5EE",
  tealSoft: "#9FE1CB",
  blue: "#185FA5", // 6.5:1 on white
  amberDeep: "#8A560F", // warnings text (AA on amber wash + white)
  amberWash: "#FBF1E3",
  dangerDeep: "#9F3A2F", // declined (AA on danger wash + white)
  dangerWash: "#FBEAE7",
  ink: "#0F3D30", // strongest teal-ink headline on wash
  slate: "#475569", // body text on white (~7:1)
  slateSoft: "#64748B", // muted label on white (~4.8:1)
  border: "#E2E8F0",
  white: "#FFFFFF",
} as const;
