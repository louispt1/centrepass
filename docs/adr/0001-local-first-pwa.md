# Local-first PWA with no server

The rewrite targets non-technical club volunteers coding live at courts with unreliable connectivity, and an open-source maintainer who should not have to operate infrastructure. We decided the app is a local-first Progressive Web App: all logic runs in the browser, match data lives on the device, and the app is served as a static site (GitHub Pages). There are no accounts and no backend.

Consequences: multi-device sharing works by exchanging Match Files (and later read-only URL-fragment links), not by sync; a hosted sync service remains possible later as an optional addition because the domain core is deployment-agnostic. Rejected alternatives: a hosted multi-tenant web app (ongoing cost, ops, and data custody for a side project), Tauri desktop/mobile (app-store friction defeats "non-technical users just open a link"), and a self-hostable server (contradicts the audience outright).
