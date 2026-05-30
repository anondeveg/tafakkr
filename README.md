# Tafakkr

> **Tafakkr** (تفكّر) – a modern, desktop‐first Quranic Tafsir and Tadabbur application built with **Wails** (Go + React).  It provides an Obsidian‑style note‑taking experience tightly integrated with the Quran, allowing you to attach personal reflections, scholarly notes, and verse mappings directly to the text.

---

## 📖 About

Tafakkr combines a lightweight Go backend that stores notes, book metadata, and cached exegesis pages in an SQLite database (stored under `~/.tafakkr/`).  The frontend is a responsive React app bundled with Vite, offering:

* **Rich note‑taking** – create, edit, and delete notes linked to specific Surah/Ayah pairs.
* **Verse mapping** – each note can be bound to multiple Quran verses.
* **Offline exegesis** – the app fetches and caches Tafsir pages from a Python bridge (`bridge.py`).
* **Dark‑mode UI** – modern glass‑morphism styling with smooth micro‑animations.
* **Cross‑platform desktop** – packaged via Wails for Windows, macOS, and Linux.

---

## ✨ Features

- **Fast live development** – `wails dev` runs a Vite dev server with hot‑reload.
- **One‑click production build** – `wails build -tags webkit2_41` creates a native binary.
- **Automatic backups** – optional GDrive sync (configurable via settings).
- **Extensible architecture** – Go services (`backend/*`) expose a clean RPC API to the React UI.
- **Comprehensive SEO** – built‑in meta tags and semantic HTML for accessibility.

---

## 🛠 Prerequisites

| Tool | Minimum version |
|------|-----------------|
| **Go** | 1.25 |
| **Node.js** | 20.x |
| **npm** | 10.x |
| **Wails CLI** | 2.12 |
| **Python** | 3.11 (required for the bridge script) |

> The helper script `run.sh` validates all dependencies before building.

---

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/anondeveg/tafakkr.git
   cd tafakkr
   ```
2. **Install Go dependencies** (handled automatically by `go mod tidy`).
3. **Install Node dependencies**
   ```bash
   cd frontend && npm install
   ```
4. **Install Wails CLI** (if not already present)
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
5. **Make the build script executable**
   ```bash
   chmod +x run.sh
   ```

---

## 🚀 Development

Start live development with hot‑reload:
```bash
./run.sh   # runs the build script which in turn calls `wails dev`
```
The command will:
- Verify Go, Node, and Wails are installed.
- Launch a Vite dev server.
- Open the desktop window pointing to `http://localhost:34115`.

You can edit the React components under `frontend/src/` and Go services under `backend/`.  Changes are reflected instantly.

---

## 📦 Build (Production)

To create a distributable binary:
```bash
./run.sh   # after the dev step, the script automatically runs `wails build`
```
The compiled executable is placed at `build/bin/tafakkr`.  You can launch it directly or create a desktop entry (`tafakkr.desktop`).

---

## 🏛 Architecture Overview

```
project-root/
├─ backend/          # Go services (DB, Exegesis bridge, backup, etc.)
├─ frontend/         # React + Vite UI
│   ├─ src/          # UI components
│   └─ dist/         # Production assets (embedded via //go:embed)
├─ wails.json        # Wails configuration (window size, assets, etc.)
├─ main.go           # Entry point – creates the Wails app
└─ run.sh            # Build & dev helper script
```

- **Database** – `backend/db.go` manages SQLite schema and CRUD operations for notes, verse mappings, and cached metadata.
- **Exegesis Service** – `backend/exegesis.go` wraps a Python bridge (`bridge.py`) that fetches Tafsir pages and metadata.
- **Backup Service** – optional sync to Google Drive, configurable via settings.

---

## 🤝 Contributing

Contributions are welcome!  Please follow these steps:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Ensure the code builds (`./run.sh`).
4. Write tests for new Go functions (see `backend/*_test.go`).
5. Submit a Pull Request with a clear description.

All contributions must adhere to the project's **coding style** (gofmt for Go, Prettier for JS/TS) and include appropriate documentation.

---

## 📄 License

Tafakkr is released under the **MIT License** – see the `LICENSE` file for details.

---

## 📬 Contact

- **Author**: Anondeveg – <anondeveg@gmail.com>
- **GitHub**: https://github.com/anondeveg/tafakkr
- **Issues**: Report bugs or feature requests via the GitHub Issues tab.

---

*Happy coding and may your reflections be as deep as the verses you explore!*
