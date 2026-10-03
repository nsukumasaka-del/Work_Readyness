import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

import { DefaultFallback, ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { getApiBase, installApiFetchRewrite } from "@/lib/api-base";
import { configureNativeChrome } from "@/lib/native-chrome";
import { getSessionToken } from "@/lib/auth-session";
import { ThemeProvider } from "@/components/theme-provider";

import "./index.css";

// Load the app graph after the recovery boundary is available. A failed chunk
// or module evaluation must not leave the server's SEO fallback on screen.
const App = lazy(() => import("./App"));
function StartupFallback(props: ErrorFallbackProps) {
  return <DefaultFallback {...props} resetError={() => window.location.reload()} />;
}
function MountedApp({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.bonlistMounted = "true";
  }, []);
  return children;
}

const container = document.getElementById("root");
if (!container) throw new Error("BonList could not find its app container.");
try {
  const apiBase = getApiBase();
  if (apiBase) setBaseUrl(apiBase);
  setAuthTokenGetter(getSessionToken);
  installApiFetchRewrite();
  void configureNativeChrome().catch(error => console.warn("[bonlist] Native chrome unavailable", error));
  createRoot(container, {
    // Keeps caught errors off reportError(), which would raise the dev overlay.
    onCaughtError: (error, errorInfo) => {
      console.error(error, errorInfo.componentStack);
    },
  }).render(
    <MountedApp>
      <ErrorBoundary FallbackComponent={StartupFallback}>
        <ThemeProvider>
          <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center p-6">Loading BonList…</div>}>
            <App />
          </Suspense>
        </ThemeProvider>
      </ErrorBoundary>
    </MountedApp>,
  );
} catch (error) {
  console.error("[bonlist] App startup failed", error);
  createRoot(container).render(<StartupFallback error={error instanceof Error ? error : new Error("App startup failed")} resetError={() => window.location.reload()} />);
}
