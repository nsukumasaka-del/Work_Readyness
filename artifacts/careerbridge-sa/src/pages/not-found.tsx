import { Link } from 'wouter';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-5 py-20 text-center">
      <AlertCircle className="text-primary" size={36} />
      <h1 className="display mt-5 text-3xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        We couldn’t find that page. Choose a useful place to continue with your job search.
      </p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        <Link href="/jobs/explore" className="btn-primary">Explore job guides</Link>
        <Link href="/career-advice" className="btn-secondary">Career advice</Link>
        <Link href="/cv-builder" className="btn-secondary">Build your CV</Link>
        <Link href="/#cv-check" className="btn-secondary">Review your CV</Link>
      </div>
      <Link href="/" className="mt-6 text-sm font-semibold text-primary hover:underline">
        Return to the homepage
      </Link>
    </div>
  );
}
