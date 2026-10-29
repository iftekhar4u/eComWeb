# AURELIA frontend

React storefront and Admin Ready UI. Run `npm run dev` here for frontend-only development, with the backend running separately. Prefer `npm run dev` from the project root to start both.

`src/App.jsx` routes `/admin/*` to `src/admin-ready/ReadyAdmin.jsx`. Both Vite configuration entry points use `vite.config.js`; builds go to `dist-admin`. API requests use the configured proxy and session cookies.

See `../README.md`, `../docs/ARCHITECTURE.md` and `../docs/CHANGES.md` for setup, architecture and exact changes.
