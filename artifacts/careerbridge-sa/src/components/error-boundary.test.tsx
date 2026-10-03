import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DefaultFallback, ErrorBoundary } from './error-boundary';

test('production fallback exposes collapsible message, component stack and copy control', () => {
  const html = renderToStaticMarkup(createElement(DefaultFallback, {
    error: new TypeError('Cannot read properties of null'),
    errorInfo: { componentStack: '\n    at JobMatches\n    at Workspace' },
    resetError: () => undefined,
  }));
  assert.match(html, /Show Technical Error Details/);
  assert.match(html, /Cannot read properties of null/);
  assert.match(html, /at JobMatches/);
  assert.match(html, /Copy Error Log/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
});

test('missing component stack is handled and exception text is escaped', () => {
  const html = renderToStaticMarkup(createElement(DefaultFallback, {
    error: new Error('<script>alert(1)</script>'), resetError: () => undefined,
  }));
  assert.match(html, /Component stack unavailable/);
  assert.doesNotMatch(html, /<script>/);
});

test('boundary normalizes non-Error exceptions and clears diagnostic state on retry', () => {
  const state = ErrorBoundary.getDerivedStateFromError('Unexpected failure');
  assert.equal(state.error?.message, 'Unexpected failure');
  assert.equal(state.errorInfo, null);
  const boundary = new ErrorBoundary({ children: null });
  let update: unknown;
  boundary.setState = ((value: unknown) => { update = value; }) as typeof boundary.setState;
  boundary.resetError();
  assert.deepEqual(update, { error: null, errorInfo: null });
});
