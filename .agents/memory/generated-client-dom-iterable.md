---
name: Generated client DOM iterable requirement
description: TypeScript configuration needed by the generated API client
---

The generated React API client relies on `Headers.entries()`, so the client library TypeScript configuration must include both DOM and DOM.Iterable libs.

**Why:** Orval output typechecks against the web Fetch API and fails when iterable DOM types are omitted.

**How to apply:** Preserve DOM.Iterable when changing shared or api-client-react compiler options.