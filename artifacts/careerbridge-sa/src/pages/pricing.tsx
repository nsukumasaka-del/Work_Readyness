import { Link } from "wouter";
import { Check } from "lucide-react";
import { requestPayment, usePaidAccess } from "@/lib/yoco";

export default function PricingPage() {
  const access = usePaidAccess();
  const offers = [
    { name: "Template download", price: 50, note: "Once per template · lifetime unlock", features: ["Preview and edit every template for free", "Download your unlocked template again anytime"], href: "/cv-builder/templates", action: "Browse templates" },
    { name: "Job match unlock", price: 20, note: "Once per high-score match", features: ["Reveal matches scoring 50% or higher", "Matches below 50% remain free"], href: "/jobs", action: "View job matches" },
    { name: "Mega Access Promotion", price: 80, note: "Once-off · 7 days", features: ["Unlimited CV template downloads", "Unlimited high-score job match reveals", "Full AI CV diagnostic and cover letter access"], action: "Get Mega Access" },
  ];
  return <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-6">
    <p className="text-xs font-semibold uppercase text-primary">Pricing</p>
    <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Build free. Unlock what you need.</h1>
    <p className="mt-4 text-sm text-muted-foreground">Once-off payments. No new monthly subscription required.</p>
    <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold">PROMOTION — 1 WEEK MEGA ACCESS · R80</div>
    {access.adminBypass ? <p className="mt-4 text-sm">Administrator access: all features unlocked.</p> : access.megaAccessActive ? <p className="mt-4 text-sm">Mega Access active until {new Date(access.megaAccessUntil!).toLocaleString()}.</p> : null}
    <section className="mt-6 grid min-w-0 gap-5 md:grid-cols-3">
      {offers.map(offer => <article key={offer.name} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{offer.name}</h2>
        <p className="mt-4 text-4xl font-bold">R{offer.price}</p>
        <p className="mt-2 text-sm text-muted-foreground">{offer.note}</p>
        <ul className="my-6 flex-1 space-y-3">{offer.features.map(feature => <li key={feature} className="flex gap-2 text-sm"><Check size={16} className="shrink-0 text-primary" /><span className="min-w-0 break-words">{feature}</span></li>)}</ul>
        {offer.href ? <Link href={offer.href} className="btn-primary w-full">{offer.action}</Link> : <button className="btn-primary w-full" disabled={access.adminBypass || access.megaAccessActive} onClick={() => requestPayment({ itemType: "MEGA_ACCESS" })}>{access.adminBypass || access.megaAccessActive ? "Already unlocked" : offer.action}</button>}
      </article>)}
    </section>
    <p className="mt-6 text-xs text-muted-foreground">Existing customer records are preserved. Paid access activates after secure payment verification.</p>
  </main>;
}
