import { authFetch } from "@/lib/auth-session";

export type MonetizationStatus = {
  adminBypass: boolean;
  megaAccessActive?: boolean;
  megaAccessUntil?: string | null;
  unlockedJobIds?: string[];
  credits: number;
  creditPack: { priceZar: number; credits: number };
  ownedTemplateIds: string[];
  freeTemplateIds: string[];
  premiumTemplates: Array<{ templateId: string; priceZar: number; ownership: "lifetime" }>;
  features: Array<{ id: string; name: string; description: string; creditCost: number }>;
  recentTransactions: Array<Record<string, unknown>>;
};

export const EMPTY_MONETIZATION: MonetizationStatus = {
  adminBypass: false,
  credits: 0,
  creditPack: { priceZar: 50, credits: 5 },
  ownedTemplateIds: [],
  freeTemplateIds: [],
  premiumTemplates: ["editorial_gold", "creative", "stylish", "polished", "high_performer"]
    .map((templateId) => ({ templateId, priceZar: 50, ownership: "lifetime" as const })),
  features: [],
  recentTransactions: [],
};

export async function fetchMonetizationStatus(): Promise<MonetizationStatus> {
  const response = await authFetch("/api/career/monetization", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load template ownership and credits.");
  return await response.json() as MonetizationStatus;
}

export function templateAccess(status: MonetizationStatus, templateId: string) {
  const owned = status.adminBypass || status.ownedTemplateIds.includes(templateId);
  const premium = status.premiumTemplates.find((item) => item.templateId === templateId);
  return { free: false, owned: owned || Boolean(status.megaAccessActive), premium: premium || { templateId, priceZar: 50, ownership: 'lifetime' }, canExport: owned || Boolean(status.megaAccessActive) };
}
