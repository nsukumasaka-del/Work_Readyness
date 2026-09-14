import { Link } from 'wouter';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-5 py-20 text-center">
      <AlertCircle className="text-primary" size={36} />
      <h1 className="display mt-5 text-3xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        That page isn’t part of BonList. Head back to overview to continue.
      </p>
      <Link href="/" className="btn-primary mt-8">
        Back to overview
      </Link>
    </div>
  );
}
