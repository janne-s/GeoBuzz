# GeoBuzz Server Kit

This kit converts GeoBuzz from a standalone browser application to a PHP-backed server version with filesystem storage and multi-user workspace support.

The standalone app remains fully functional. To test the server version, work on a copy of the project.

All commands below assume you are in the **parent directory** that contains your GeoBuzz folder.

---

## Step 1 — Copy the project

Make a copy of the entire GeoBuzz directory. All changes below apply to the copy only.

```
cp -R GeoBuzz/ GeoBuzz-server/
```

---

## Step 2 — Drop in the replacement files

Copy everything from the kit's `src/` over the copy's `src/`. This is the only step that changes code.

```
cp -R GeoBuzz/server-kit/src/ GeoBuzz-server/src/
```

This replaces the following files:

| File | What changed |
|------|-------------|
| `src/api/Backend.js` | HTTP fetch wrapper with CSRF injection |
| `src/api/SecurityManager.js` | CSRF token management via PHP endpoint |
| `src/api/WorkspaceAPI.js` | PHP workspace CRUD endpoints |
| `src/api/FilesAPI.js` | PHP file upload/list/delete endpoints |
| `src/persistence/StorageAdapter.js` | Uses Backend HTTP calls |
| `src/persistence/WorkspaceManager.js` | Uses WorkspaceAPI, no blob URL pre-caching |
| `src/persistence/PackageExporter.js` | Fetches sounds via HTTP, gets file list from PHP |
| `src/persistence/PackageImporter.js` | Uploads sounds via PHP endpoints |
| `src/events/UIEventHandler.js` | Adds workspace URL copy and export-to-workspace handlers |
| `src/core/Application.js` | Uses server URL paths for sound files, passes updateWorkspaceUI |
| `src/core/audio/SynthRegistry.js` | Uses server URL paths for grid sampler files |
| `src/ui/menus/DialogManager.js` | Displays server-side file limits |

---

## Step 3 — Replace index.html

Copy the server version of `index.html` to the project root:

```
cp GeoBuzz/server-kit/index.html GeoBuzz-server/index.html
```

This restores the "Export to Workspace" button and the workspace URL sharing section.

---

## Step 4 — Restore the PHP backend

Copy the `api/` directory to the project root:

```
cp -R GeoBuzz/server-kit/api/ GeoBuzz-server/api/
```

---

## Step 5 — Restore workspaces directory

Copy the `workspaces/` directory to the project root. Ensure it is writable by the web server:

```
cp -R GeoBuzz/server-kit/workspaces/ GeoBuzz-server/workspaces/
chmod -R 775 GeoBuzz-server/workspaces/
```

---

## Step 6 — Serve with PHP

The server version requires PHP:

```
cd GeoBuzz-server
php -S localhost:8000
```

Or configure Apache/Nginx to serve the directory with PHP enabled.

Open `http://localhost:8000` in your browser.

---

## What the server version adds

### Storage

- Workspace data stored as JSON files on the server filesystem
- Sound files stored in workspace directories on the server
- CSRF protection for all API calls
- Server-enforced file upload limits (PHP `upload_max_filesize`)

### Multi-user

- Each workspace has a unique URL
- Multiple users can access different workspaces simultaneously
- Data persists on the server, accessible from any browser

### Export

- "Export to Workspace" deploys a playable copy to the server
- PHP-based source file listing for ZIP exports

### Removed from standalone

- `src/api/LocalBackend.js` and `src/api/SoundUrlResolver.js` are unused but harmless
