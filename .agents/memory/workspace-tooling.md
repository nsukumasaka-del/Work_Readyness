---
name: Workspace tooling constraints
description: Environment-specific constraints affecting monorepo commands and Android packaging
---

Nested pnpm invocations must explicitly disable automatic package-manager version management in this workspace. Web-to-Android asset syncing works without the Android SDK, but producing a new installable APK requires both Java and an Android SDK.

**Why:** The configured pnpm version repeatedly attempted a resource-heavy self-install when child commands omitted the opt-out, and Gradle cannot assemble the APK when the SDK is absent.

**How to apply:** Keep the opt-out flag on child pnpm commands in scripts and package scripts. Treat a successful Capacitor asset sync and a freshly assembled APK as separate validation steps.