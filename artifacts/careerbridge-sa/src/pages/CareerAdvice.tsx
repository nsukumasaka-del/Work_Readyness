import { ArrowRight, BookOpen, CheckCircle2, Clock, FileCheck2, Search } from 'lucide-react';
import { Link, useParams } from 'wouter';
import {
  ADVICE_CATEGORIES,
  CAREER_ARTICLES,
  adviceCategorySlug,
  findCareerArticle,
  type CareerArticle,
} from '@/content/career-advice';
import NotFound from '@/pages/not-found';
import { AdSlot } from '@/components/AdSlot';

function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
            {index > 0 ? <span aria-hidden>/</span> : null}
            {item.href ? <Link href={item.href} className="hover:text-primary">{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ArticleCard({ article }: { article: CareerArticle }) {
  return (
    <article className="flex h-full flex-col border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        <span>{article.category}</span>
        <span className="inline-flex items-center gap-1 normal-case tracking-normal text-muted-foreground"><Clock size={12} /> {article.readingMinutes} min read</span>
      </div>
      <h2 className="mt-3 text-xl font-semibold leading-snug text-foreground">
        <Link href={`/career-advice/${article.slug}`} className="hover:text-primary">{article.title}</Link>
      </h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{article.excerpt}</p>
      <Link href={`/career-advice/${article.slug}`} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary">
        Read guide <ArrowRight size={14} />
      </Link>
    </article>
  );
}

export function CareerAdviceIndexPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Career Advice' }]} />
      <header className="mt-8 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Career Advice</p>
        <h1 className="display mt-3 text-4xl font-semibold leading-tight text-foreground md:text-5xl">Practical guidance for your next application.</h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground">Clear, South Africa-focused guidance for writing better CVs, finding credible opportunities and preparing for interviews—without inflated claims or generic filler.</p>
      </header>

      <nav aria-label="Career advice categories" className="mt-8 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ADVICE_CATEGORIES.map((category) => (
          <Link key={category} href={`/career-advice/category/${adviceCategorySlug(category)}`} className="shrink-0 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary">{category}</Link>
        ))}
      </nav>

      <section className="mt-12" aria-labelledby="latest-advice-heading">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Editorial library</p><h2 id="latest-advice-heading" className="mt-2 text-2xl font-semibold text-foreground">Start with these guides</h2></div>
          <span className="hidden text-xs text-muted-foreground sm:block">Reviewed for clarity and factual restraint</span>
        </div>
        <div className="mt-7 grid gap-x-8 gap-y-9 md:grid-cols-2">{CAREER_ARTICLES.map((article) => <ArticleCard key={article.slug} article={article} />)}</div>
      </section>

      <section className="mt-16 grid gap-6 border-y border-border py-10 md:grid-cols-[1fr_auto] md:items-center">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Put the advice into practice</p><h2 className="mt-2 text-2xl font-semibold text-foreground">Use BonList’s career tools when you are ready.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Build a structured CV, review its content and then find roles matched to your verified experience.</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/cv-builder?intake=1" className="btn-primary">Build your CV <ArrowRight size={14} /></Link><Link href="/#cv-check" className="btn-secondary">Review your CV</Link></div>
      </section>
    </div>
  );
}

export function CareerAdviceCategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const category = ADVICE_CATEGORIES.find((item) => adviceCategorySlug(item) === slug);
  if (!category) return <NotFound />;
  const articles = CAREER_ARTICLES.filter((article) => article.category === category);
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Career Advice', href: '/career-advice' }, { label: category }]} />
      <header className="mt-8 max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Career Advice</p><h1 className="display mt-3 text-4xl font-semibold text-foreground">{category}</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Practical BonList guidance for South African job seekers.</p></header>
      {articles.length ? <div className="mt-10 grid gap-x-8 gap-y-9 md:grid-cols-2">{articles.map((article) => <ArticleCard key={article.slug} article={article} />)}</div> : <div className="mt-10 rounded-2xl border border-border bg-card p-8"><Search size={22} className="text-primary" /><h2 className="mt-4 text-lg font-semibold text-foreground">No published guides in this category yet</h2><p className="mt-2 text-sm text-muted-foreground">BonList publishes focused guidance only after it is ready for readers.</p><Link href="/career-advice" className="btn-secondary mt-5">Browse published advice</Link></div>}
    </div>
  );
}

export function CareerArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = findCareerArticle(slug);
  if (!article) return <NotFound />;
  const related = article.relatedSlugs.map(findCareerArticle).filter((item): item is CareerArticle => Boolean(item));
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Career Advice', href: '/career-advice' }, { label: article.category, href: `/career-advice/category/${adviceCategorySlug(article.category)}` }, { label: article.title }]} />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <article className="min-w-0">
          <header className="border-b border-border pb-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{article.category}</p>
            <h1 className="display mt-3 text-4xl font-semibold leading-tight text-foreground md:text-5xl">{article.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">{article.excerpt}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>By BonList</span><span>Published {new Date(`${article.publishedAt}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span><span>{article.readingMinutes} min read</span></div>
          </header>

          <AdSlot placement="article-top" className="mt-8 min-h-24 w-full" />

          <div className="mt-9 space-y-10">
            {article.sections.map((section, index) => (
              <div key={section.id}>
              <section id={section.id} className="scroll-mt-24">
                <h2 className="text-2xl font-semibold text-foreground">{section.heading}</h2>
                <div className="mt-4 space-y-4">{section.paragraphs.map((paragraph) => <p key={paragraph} className="text-[15px] leading-7 text-muted-foreground">{paragraph}</p>)}</div>
                {section.bullets ? <ul className="mt-5 space-y-2.5">{section.bullets.map((bullet) => <li key={bullet} className="flex gap-2.5 text-sm leading-6 text-foreground"><CheckCircle2 size={16} className="mt-1 shrink-0 text-primary" /><span>{bullet}</span></li>)}</ul> : null}
                {section.callout ? <aside className="mt-5 border-l-4 border-primary bg-secondary/60 px-4 py-3 text-sm leading-6 text-foreground">{section.callout}</aside> : null}
              </section>
              {index === 1 ? <AdSlot placement="article-middle" className="mt-10 min-h-24 w-full" /> : null}
              </div>
            ))}
          </div>

          {article.faqs.length ? <section className="mt-12 border-t border-border pt-9" aria-labelledby="article-faq-heading"><h2 id="article-faq-heading" className="text-2xl font-semibold text-foreground">Frequently asked questions</h2><div className="mt-5 divide-y divide-border">{article.faqs.map((faq) => <details key={faq.question} className="group py-4"><summary className="cursor-pointer list-none pr-8 text-sm font-semibold text-foreground marker:hidden">{faq.question}</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p></details>)}</div></section> : null}

          <section className="mt-12 border-y border-border py-8"><div className="flex items-start gap-3"><FileCheck2 size={22} className="mt-1 shrink-0 text-primary" /><div><h2 className="text-lg font-semibold text-foreground">Check your own CV</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Apply this guide to your document, then use BonList to review the structure and wording.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/#cv-check" className="btn-primary">Review your CV</Link><Link href="/cv-builder?intake=1" className="btn-secondary">Build your CV</Link></div></div></div></section>

          {related.length ? <section className="mt-10"><h2 className="text-xl font-semibold text-foreground">Related career advice</h2><div className="mt-5 grid gap-6 sm:grid-cols-2">{related.map((item) => <ArticleCard key={item.slug} article={item} />)}</div></section> : null}
          <AdSlot placement="article-bottom" className="mt-10 min-h-24 w-full" />
        </article>

        <aside className="hidden lg:block lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
          <nav className="mt-3 border-l border-border pl-4" aria-label="Table of contents"><ul className="space-y-3">{article.sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="text-xs leading-5 text-muted-foreground hover:text-primary">{section.heading}</a></li>)}</ul></nav>
          <Link href="/career-advice" className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-primary"><BookOpen size={13} /> All career advice</Link>
        </aside>
      </div>
    </div>
  );
}
