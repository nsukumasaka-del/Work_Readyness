/** Template defaults, independent of the application light/dark theme. */
export const TEMPLATE_PALETTES: Record<string, { theme: string; background: string; text: string }> = {
  serif_classic: { theme: "charcoal", background: "#ffffff", text: "#18181b" },
  corporate_blue: { theme: "sky", background: "#ffffff", text: "#334155" },
  editorial_gold: { theme: "burgundy", background: "#fffdf8", text: "#3f2930" },
  analyst_clean: { theme: "charcoal", background: "#ffffff", text: "#18181b" },
  double_column: { theme: "navy", background: "#ffffff", text: "#334155" },
  ivy_league: { theme: "navy", background: "#ffffff", text: "#334155" },
  elegant: { theme: "burgundy", background: "#fffdf8", text: "#3f2930" },
  contemporary: { theme: "teal", background: "#ffffff", text: "#334155" },
  modern: { theme: "navy", background: "#ffffff", text: "#334155" },
  timeline: { theme: "sky", background: "#ffffff", text: "#334155" },
  creative: { theme: "teal", background: "#faf9f6", text: "#44403c" },
  stylish: { theme: "emerald", background: "#ffffff", text: "#334155" },
  single_column: { theme: "charcoal", background: "#ffffff", text: "#18181b" },
  compact: { theme: "charcoal", background: "#fafafa", text: "#18181b" },
  polished: { theme: "navy", background: "#ffffff", text: "#334155" },
  multicolumn: { theme: "navy", background: "#ffffff", text: "#334155" },
  classic: { theme: "charcoal", background: "#ffffff", text: "#18181b" },
  high_performer: { theme: "emerald", background: "#ffffff", text: "#334155" },
  minimal: { theme: "charcoal", background: "#fafafa", text: "#18181b" },
};
export function getTemplatePalette(templateId: string) {
  return TEMPLATE_PALETTES[templateId] || TEMPLATE_PALETTES.modern!;
}
