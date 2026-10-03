import { authFetch } from "@/lib/auth-session";
import { normalizeAccess, objectData, objectList, stringList } from './safe-data';

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
  const data = objectData(await response.json());
  if (data.success === false || typeof data.error === 'string') throw new Error('Could not load template ownership and credits.');
  return {
    ...EMPTY_MONETIZATION, ...normalizeAccess(data),
    credits: typeof data.credits === 'number' && Number.isFinite(data.credits) ? Math.max(0, data.credits) : 0,
    freeTemplateIds: stringList(data.freeTemplateIds),
    premiumTemplates: objectList(data.premiumTemplates).filter(item => typeof item.templateId === 'string').map(item => ({ templateId: item.templateId as string, priceZar: 50, ownership: 'lifetime' })),
    features: objectList(data.features).filter(item => typeof item.id === 'string').map(item => ({ id: item.id as string, name: typeof item.name === 'string' ? item.name : '', description: typeof item.description === 'string' ? item.description : '', creditCost: typeof item.creditCost === 'number' ? item.creditCost : 0 })),
    recentTransactions: objectList(data.recentTransactions),
  };
}

export function templateAccess(status: MonetizationStatus, templateId: string) {
  const owned = status.adminBypass || status.ownedTemplateIds.includes(templateId);
  const premium = status.premiumTemplates.find((item) => item.templateId === templateId);
  return { free: false, owned: owned || Boolean(status.megaAccessActive), premium: premium || { templateId, priceZar: 50, ownership: 'lifetime' }, canExport: owned || Boolean(status.megaAccessActive) };
}
