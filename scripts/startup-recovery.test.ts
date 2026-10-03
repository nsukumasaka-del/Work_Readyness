import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { renderRouteHtml } from '../workers/public-html';

const source = await readFile(resolve(import.meta.dirname, '../artifacts/careerbridge-sa/index.html'), 'utf8');
const recoveryScript = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(match => match[1].includes('data-startup-recovery'))?.[1];

test('edge SEO rendering preserves the entry module and startup recovery', () => {
  for (const path of ['/', '/cv-builder', '/login']) {
    const rendered = renderRouteHtml(source, path).html;
    assert.match(rendered, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
    assert.match(rendered, /data-startup-recovery/);
    assert.match(rendered, /<div id="root">/);
  }
});

test('failed entry module replaces static fallback with a working retry button', () => {
  let listener: (event: unknown) => void = () => {};
  let reloads = 0;
  let panel: any;
  const root = { querySelector: () => panel, replaceChildren: (value: unknown) => { panel = value; } };
  const document = {
    documentElement: { dataset: {} as Record<string, string> },
    getElementById: () => root,
    createElement: (tag: string) => ({ tag, style: {}, children: [] as any[], attrs: {} as Record<string, string>,
      setAttribute(key: string, value: string) { this.attrs[key] = value; },
      append(...nodes: any[]) { this.children.push(...nodes); },
      addEventListener(_type: string, handler: () => void) { (this as any).click = handler; },
    }),
  };
  assert.ok(recoveryScript);
  runInNewContext(recoveryScript, { document, ErrorEvent: class ErrorEvent {}, window: {
    addEventListener: (_type: string, handler: typeof listener) => { listener = handler; },
    location: { reload: () => { reloads++; } },
  } });
  listener({ target: { tagName: 'SCRIPT', type: 'module', src: 'https://www.bonlist.site/assets/index-broken.js' } });
  assert.equal(panel.attrs.role, 'alert');
  assert.equal(panel.children[0].textContent, 'BonList could not start');
  panel.children[2].click();
  assert.equal(reloads, 1);
  const initialPanel = panel;
  listener({ target: { tagName: 'SCRIPT', type: 'module', src: '/assets/index-broken.js' } });
  assert.equal(panel, initialPanel, 'recovery is not repeatedly mounted');
  panel = undefined;
  document.documentElement.dataset.bonlistMounted = 'true';
  listener({ target: { tagName: 'SCRIPT', type: 'module', src: '/assets/index-broken.js' } });
  assert.equal(panel, undefined, 'later resource errors never replace a running app');
});
