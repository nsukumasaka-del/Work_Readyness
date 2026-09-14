import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { getApiBase, installApiFetchRewrite } from '@/lib/api-base';
import { configureNativeChrome } from '@/lib/native-chrome';

import './index.css';

const apiBase = getApiBase();
if (apiBase) setBaseUrl(apiBase);
installApiFetchRewrite();
void configureNativeChrome();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
