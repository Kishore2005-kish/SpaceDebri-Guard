# STK Setup Guide

> **Step-by-step instructions for installing Ansys STK and connecting it to
> SENTINEL.** Follow this guide if you want SENTINEL's "RUN ORBITAL
> SIMULATION" button to drive a real STK Advanced CAT analysis instead of the
> integrated SGP4 fallback.

---

## ⚠ Proprietary Software Disclaimer

**STK (Ansys Systems Tool Kit) is proprietary commercial software. STK is
not free, not open source, and not bundled with SENTINEL.** A valid
commercial STK license from Ansys is required for every step below that
involves the STK application itself. **SENTINEL does NOT bundle, ship, or
install STK.** SENTINEL ships only the *adapter code* (`src/lib/stk/`) that
knows how to talk to STK over its documented Connect command protocol.

> **STK requires a commercial license from Ansys. SENTINEL does NOT bundle or
> install STK.**

If you do not have an STK license, SENTINEL is still fully functional: the
"RUN ORBITAL SIMULATION" button automatically uses the SGP4 fallback engine
(labeled "SENTINEL SGP4 (fallback)") and the result is still valid orbital
mechanics — just not an STK professional analysis.

Official Ansys resources:
- STK product page / licensing — https://www.ansys.com/products/missions/stk
- Start a CAT (operator tutorial) — https://help.agi.com/stk/Content/training/StartCAT.htm
- Advanced CAT reference — https://help.agi.com/stk/Content/cat/Cat03.htm
- STK Connect command reference — https://help.agi.com/stk/Subsystems/connect/Content/start.htm
- STK Python API introduction — https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm

---

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Operating system | Windows 10/11, RHEL 8/9, or Ubuntu 20.04+ | STK is a desktop application; Linux/macOS support is more limited than Windows. |
| RAM | 16 GB (32 GB recommended for large catalogs) | Advanced CAT over thousands of secondaries is memory-heavy. |
| Disk | 20 GB free for STK + scenarios | |
| Ansys licensing | Active STK license (node-locked or floating) | See step 2. |
| Python | 3.8+ | Required for the STK Python API and the SENTINEL health check. |
| Node.js / Bun | per `package.json` | Required to run SENTINEL itself. |

---

## Step 1 — Install STK

Download the STK installer from the Ansys Customer Portal
(https://www.ansys.com/customer-portal) using the credentials supplied by
your Ansys account manager. Run the installer and select at least:

- **STK (core)** — the desktop application.
- **STK Engine for Python** (a.k.a. the STK Python API / `agi.stk`) — used by
  the SENTINEL health check and by any future Python-side automation.
- **Advanced CAT (Conjunction Analysis Tools)** — the close-approach engine.

Verify on the command line:

```bash
# Windows
"C:\Program Files\AGI\STK 13\bin\STK.exe" --version

# Linux
/usr/local/STK/bin/stk --version
```

If you see a version banner, STK is installed.

---

## Step 2 — Licensing

STK uses Ansys Licensing (the same FlexNet-based service used by all Ansys
products). Two modes are supported:

- **Node-locked** — the license is tied to a single host. Simplest for a
  single-operator workstation.
- **Floating** — the license is served from an Ansys License Manager on the
  network; any client with network access can check a seat out. Best when
  multiple operators share a license pool.

Install the Ansys License Manager if you are the license server, then point
STK at it via the `ANSYSLMD_LICENSE_FILE` environment variable:

```bash
# Floating license example (port@host):
export ANSYSLMD_LICENSE_FILE=1055@license.my-org.local

# Node-locked example (path to an installed license file):
export ANSYSLMD_LICENSE_FILE=/opt/ansys/shared_files/licensing/ansyslmd.ini
```

Launch STK Desktop once interactively to confirm the license is accepted and
the **Advanced CAT** feature shows as licensed under *File → Help → License
Information*. Advanced CAT is the feature SENTINEL depends on; without it,
the Connect commands in step 8 will error and SENTINEL will fall back.

---

## Step 3 — Install Python 3.8+

STK's Python API and the SENTINEL health check (`scripts/check-stk.py`) both
require Python 3.8 or newer. Download from https://www.python.org/downloads/
or your OS package manager:

```bash
# Ubuntu / Debian
sudo apt-get install -y python3 python3-pip

# macOS (Homebrew)
brew install python@3.11

# Verify
python3 --version   # → Python 3.11.x (or newer)
```

---

## Step 4 — Install the STK Python API

Two options, both documented at
https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm:

**Option A — via the STK installer (recommended).** The installer step "STK
Engine for Python" places `agi.stk` (and the Windows `comtypes` bridge) in
the STK installation tree. No `pip install` is required.

**Option B — via pip.** Ansys publishes the `agi.stk` package on PyPI for
some STK versions:

```bash
python3 -m pip install --upgrade agi.stk
```

Verify the import succeeds:

```bash
python3 -c "import agi.stk; print('agi.stk import OK')"
```

On Windows, the STK Python API uses COM (via `comtypes`); on Linux it uses the
`STKEngine` shared library. See the STK Python API introduction
(https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm) for the
platform-specific load path.

---

## Step 5 — Configure the Environment

Set the following environment variables before running SENTINEL so the
adapter can find STK and so the Connect command socket is reachable:

```bash
# Path to the STK binaries (so 'stk' / 'STK.exe' is on PATH)
export PATH="/usr/local/STK/bin:$PATH"             # Linux
# set "PATH=C:\Program Files\AGI\STK 13\bin;%PATH%" # Windows (cmd)

# Python path to the STK API (if installed via Option A)
export PYTHONPATH="/usr/local/STK/STKEngine/Python:$PYTHONPATH"

# Connect command socket (default 127.0.0.1:5001)
export STK_CONNECT_HOST=127.0.0.1
export STK_CONNECT_PORT=5001

# Ansys licensing (from step 2)
export ANSYSLMD_LICENSE_FILE=1055@license.my-org.local
```

**Start STK Desktop.** In STK, ensure the Connect command socket is enabled
(*File → Preferences → Connect → Enable Connect socket*). Confirm the port
is `5001` (the default). Without this, SENTINEL cannot send commands.

---

## Step 6 — Test the Connection

SENTINEL ships a health-check script that mirrors exactly what the adapter
does at runtime:

```bash
python3 scripts/check-stk.py
```

Expected output when everything is configured:

```
SENTINEL STK CHECK

STK installed: YES
  Found: /usr/local/STK/bin/stk
Connect port open (5001): YES
Python API: YES
Advanced CAT: YES

Status: READY
STK is installed and running. SENTINEL will use STK Advanced CAT for
professional orbital simulation.
```

If `Status: NOT INSTALLED` or `STK INSTALLED BUT NOT RUNNING`, re-check
steps 1–5. The script's messages point you back to the relevant step.

You can also ping the Connect port directly:

```bash
# Quick TCP probe (POSIX)
python3 -c "import socket; s=socket.socket(); s.settimeout(2); \
print('OPEN' if s.connect_ex(('127.0.0.1',5001))==0 else 'CLOSED')"
```

---

## Step 7 — Run SENTINEL

From the project root:

```bash
bun install           # first time only
bun run db:push       # ensure the SimulationRun table exists
bun run dev           # start Next.js on :3000
```

Open the SENTINEL UI in your browser (the dev server prints the local URL;
in the cloud sandbox use the Preview Panel). Navigate to a conjunction's
detail page — the "RUN ORBITAL SIMULATION" button will be available.

You can confirm from the UI that STK is detected by checking the
`GET /api/simulation/stk/status` route:

```bash
curl 'http://localhost:3000/api/simulation/stk/status'
# → { "available": true, "connectPortOpen": true, "pythonApiAvailable": true, ... }
```

---

## Step 8 — Execute a Simulation

1. Open any conjunction detail page in SENTINEL.
2. Click **"RUN ORBITAL SIMULATION"**.
3. The browser issues `POST /api/simulation/stk/run`, which creates a
   `SimulationRun` row (status `QUEUED`) and returns a `simulationId`
   immediately — the long-running STK work happens in the background.
4. The SimulationView opens and polls `GET /api/simulation/stk/[id]` until
   `status === 'COMPLETE'`. While STK runs you will see the status advance
   through `STARTING_STK → LOADING_DATA → RUNNING_CAT → EXTRACTING_RESULTS`.
5. On completion, the view renders:
   - 3D canvas with both orbit tracks, the closest-approach line, and a
     distance label.
   - Time display (`SIM TIME` / `TCA` / `COUNTDOWN`) with
     play / pause / Jump-to-TCA controls.
   - Separation-vs-time chart.
   - **ENGINE COMPARISON** table — SENTINEL vs STK vs SOCRATES.
   - **COLLISION PROBABILITY** panel — shows `UNAVAILABLE` if no covariance
     was supplied (the honest answer — see `docs/PREDICTION_VALIDATION.md`).
   - **PROVE THIS PREDICTION** panel — the green check next to
     "STK Advanced CAT executed" confirms a real STK run.

If STK is not running, the same button still works — the orchestrator falls
back to SGP4, the badge reads **"SENTINEL SGP4 (fallback)"**, and the PROVE
THIS PREDICTION panel shows the amber "STK unavailable (SGP4 fallback used)"
item instead. That is by design and documented in
`docs/SIMULATION_ENGINE.md`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Status: NOT INSTALLED` | STK binary not on PATH / not in standard location | Re-run installer; set `PATH` per step 5 |
| `Connect port open (5001): NO` | STK not launched, or Connect socket disabled in prefs | Launch STK; enable Connect in *Preferences → Connect* |
| `Python API: NO` | `agi.stk` not installed / `PYTHONPATH` wrong | Re-do step 4; verify `python3 -c "import agi.stk"` |
| `Advanced CAT: NO` | License does not include the CAT feature | Confirm with Ansys that your license includes Advanced CAT |
| Simulation status `STK_UNAVAILABLE` | Port check failed mid-run (STK was quit) | Restart STK and re-run |
| Simulation status `FAILED` with a Connect command error | Bad satellite name, malformed TLE, or scenario already exists | Check `SimulationRun.error`; names must match `[A-Za-z0-9_]` |

For the official operator walkthrough of the Advanced CAT workflow, follow
the "Start a CAT" tutorial at
https://help.agi.com/stk/Content/training/StartCAT.htm.
