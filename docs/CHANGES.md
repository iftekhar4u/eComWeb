# Exact update / copy-paste guide

Baseline: your uploaded `InternProject(2).zip`. Destination below means your existing `C:\Users\qadir\OneDrive\Desktop\InternProject` folder. Compare only against this upload; later changes on your laptop may need merging.

## Apply in this order

1. Stop the running frontend/backend with Ctrl+C. Make a copy of your current project folder before overwriting source files.
2. Extract `AURELIA-Clean-Local.zip` to a separate folder. Its top-level folder is `InternProject`.
3. For each replacement below, copy the file from extracted `InternProject/<path>` onto existing `InternProject/<path>`. Replace that file only. New files go to the same relative path; create the docs folder if needed.
4. Delete only the obsolete source files in the deletion table. Copying a ZIP over a folder does not remove obsolete files automatically.
5. Keep your existing `backend/.env`, `.git`, dependencies and MongoDB data. The cleaned ZIP intentionally excludes real `.env` credentials, node_modules and generated builds. Their absence is NOT an instruction to delete them.
6. Your backend/frontend dependency manifests and lockfiles are unchanged, so an already installed project does not need another installation. Root `concurrently` dependency is removed; the launcher now needs only Node. Run `npm run dev` from the project root.
7. Open `http://localhost:5173/admin`. Existing MFA still applies. If needed, follow the exact error now displayed; do not reset secrets or reseed the database.

For a completely fresh extracted folder, first run `npm run install:all`, then copy your existing `backend/.env` into its backend folder. Do not run both project copies at once. Existing local MongoDB rs0/27017 remains the data source; no Docker startup is required.

## Replace these files

Both columns are relative to the corresponding project root. The source is the cleaned ZIP; the destination is your existing project.

| Copy from cleaned ZIP | Replace in existing project |
| --- | --- |
| `.env.example` | `.env.example` |
| `.gitignore` | `.gitignore` |
| `ADMIN_READY_README.md` | `ADMIN_READY_README.md` |
| `ADMIN_READY_VALIDATION.md` | `ADMIN_READY_VALIDATION.md` |
| `README.md` | `README.md` |
| `admin-tools/install.mjs` | `admin-tools/install.mjs` |
| `admin-tools/start.mjs` | `admin-tools/start.mjs` |
| `backend/.env.example` | `backend/.env.example` |
| `backend/admin-ready/database.js` | `backend/admin-ready/database.js` |
| `backend/app.js` | `backend/app.js` |
| `backend/server.js` | `backend/server.js` |
| `docs/TESTING.md` | `docs/TESTING.md` |
| `frontend/README.md` | `frontend/README.md` |
| `frontend/src/App.jsx` | `frontend/src/App.jsx` |
| `frontend/src/admin-ready/studioApi.js` | `frontend/src/admin-ready/studioApi.js` |
| `frontend/vite.admin.config.mjs` | `frontend/vite.admin.config.mjs` |
| `frontend/vite.config.js` | `frontend/vite.config.js` |
| `package-lock.json` | `package-lock.json` |
| `package.json` | `package.json` |

## Add these new files

| Copy from cleaned ZIP | New path in existing project |
| --- | --- |
| `docs/ARCHITECTURE.md` | `docs/ARCHITECTURE.md` |
| `docs/CHANGES.md` | `docs/CHANGES.md` |
| `docs/CONTEXT_README.md` | `docs/CONTEXT_README.md` |

## Delete these obsolete source files

| Existing path to delete | Reason |
| --- | --- |
| `admin-tools/original-source-sha256.json` | Old integration reference/hash verification no longer describes the cleaned project |
| `admin-tools/reference-admin-ui.png` | Old integration reference/hash verification no longer describes the cleaned project |
| `admin-tools/verify-source.mjs` | Old integration reference/hash verification no longer describes the cleaned project |
| `compose.yaml` | Local Windows MongoDB is used; Docker is no longer required |
| `docs/CHANGED_FILES.md` | Superseded integration instructions |
| `docs/GITHUB_UPDATE.md` | Superseded integration instructions |
| `docs/README_BEFORE_INTEGRATION.md` | Superseded integration instructions |
| `docs/SET_HINGLISH.md` | Superseded integration instructions |
| `docs/commit-each-file.sh` | Superseded integration instructions |
| `frontend/src/admin-studio/AdminStudio.jsx` | Unused duplicate admin UI; current admin-ready UI remains |
| `frontend/src/admin-studio/ExistingEditors.jsx` | Unused duplicate admin UI; current admin-ready UI remains |
| `frontend/src/admin-studio/studio.css` | Unused duplicate admin UI; current admin-ready UI remains |
| `frontend/src/admin-studio/studioApi.js` | Unused duplicate admin UI; current admin-ready UI remains |
| `frontend/src/assets/react.svg` | Unused starter logo |
| `frontend/src/assets/vite.svg` | Unused starter logo |
| `frontend/src/pages/Admin.jsx` | Unused duplicate admin UI; current admin-ready UI remains |

## What changed functionally

- Normal backend and frontend entry points now load the same Admin Ready implementation as the admin launcher.
- Root `npm run dev` starts both processes; the backend watches source changes.
- One Vite configuration owns proxy settings and the `dist-admin` build directory.
- Admin API errors retain the server's explanation instead of labeling every 401 as an expired session.
- Local example URIs use port 27017 and rs0. Your actual `.env` is not overwritten.
- Installer uses a fixed Windows command without Node's `shell: true` argument construction.
- Existing backend security, payments, shared administration routes and active editors remain.
- No storefront redesign, revenue graph, new sample data, credential reset, MFA removal or production deployment is included.

## Unchanged files

Every source file not listed above is byte-identical to the baseline upload. In particular, `frontend/src/admin-ready/ExistingEditors.jsx`, UI styles, backend/frontend dependency manifests and their lockfiles are retained. The archive excludes dependencies/build output and real environment secrets instead of treating them as source deletions.

Your `.env` and local database are separate: preserve both. Do not delete MongoDB's data directory or an old Docker volume as part of these instructions. The existing database startup logic does not automatically seed sample content. Testing limits are documented in TESTING.md.
