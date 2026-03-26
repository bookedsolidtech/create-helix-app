---
'create-helix': minor
---

Migrate Remix template from @remix-run v2 to React Router v7

- Replace all @remix-run/_ packages with react-router and @react-router/_ equivalents
- Add app/routes.ts with file-based routing via @react-router/fs-routes
- Add react-router.config.ts for SSR configuration
- Fix tilde alias imports for server build compatibility
- Remix template now builds correctly out of the box without workarounds
