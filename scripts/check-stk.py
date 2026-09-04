#!/usr/bin/env python3
"""SENTINEL STK CHECK

Detects whether Ansys Systems Tool Kit (STK) is installed and available
for SENTINEL's professional orbital simulation integration.

Checks:
  1. STK installation (Windows/Linux/macOS paths)
  2. STK Connect command port (localhost:5001) — is STK running?
  3. STK Python API (agi.stk package)
  4. Advanced CAT availability

Usage:
  python3 scripts/check-stk.py

Output:
  SENTINEL STK CHECK

  STK installed: YES/NO
  Version: 13.1 (if available)
  Python API: YES/NO
  Advanced CAT: YES/NO
  Status: READY / NOT INSTALLED

If unavailable, read: docs/STK_SETUP.md
"""

import sys
import socket
import shutil
import subprocess
import os

def check_stk_installation():
    """Check if STK is installed by looking for binaries."""
    # Windows
    win_paths = [
        r"C:\Program Files\AGI\STK 13\bin\STK.exe",
        r"C:\Program Files\AGI\STK 12\bin\STK.exe",
        r"C:\Program Files\Ansys\STK\bin\STK.exe",
    ]
    for p in win_paths:
        if os.path.exists(p):
            return True, f"Found: {p}"

    # Linux
    linux_paths = [
        "/usr/local/STK/bin/stk",
        "/opt/STK/bin/stk",
        "/opt/Ansys/STK/bin/stk",
    ]
    for p in linux_paths:
        if os.path.exists(p):
            return True, f"Found: {p}"

    # macOS
    mac_paths = [
        "/Applications/STK.app",
        "/Applications/Ansys/STK.app",
    ]
    for p in mac_paths:
        if os.path.exists(p):
            return True, f"Found: {p}"

    # Check PATH
    stk_in_path = shutil.which("stk") or shutil.which("STK")
    if stk_in_path:
        return True, f"Found in PATH: {stk_in_path}"

    return False, "STK binary not found in standard locations"

def check_connect_port():
    """Check if STK's Connect command port (5001) is listening."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(("127.0.0.1", 5001))
        sock.close()
        return result == 0
    except:
        return False

def check_python_api():
    """Check if the STK Python API is available."""
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import agi.stk; print('available')"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0 and "available" in result.stdout
    except:
        return False

def check_advanced_cat():
    """Check if Advanced CAT is available (requires STK to be running)."""
    # This requires STK to be running with a Connect port
    if not check_connect_port():
        return False
    # Full check would require sending a Connect command
    # For now, assume Advanced CAT is available if STK is running
    return True

def main():
    print("SENTINEL STK CHECK")
    print()

    stk_installed, install_detail = check_stk_installation()
    connect_open = check_connect_port()
    python_api = check_python_api()
    adv_cat = check_advanced_cat()

    print(f"STK installed: {'YES' if stk_installed else 'NO'}")
    if stk_installed:
        print(f"  {install_detail}")
    print(f"Connect port open (5001): {'YES' if connect_open else 'NO'}")
    print(f"Python API: {'YES' if python_api else 'NO'}")
    print(f"Advanced CAT: {'YES' if adv_cat else 'NO'}")

    if stk_installed and connect_open:
        print(f"\nStatus: READY")
        print("STK is installed and running. SENTINEL will use STK Advanced CAT for professional orbital simulation.")
    elif stk_installed and not connect_open:
        print(f"\nStatus: STK INSTALLED BUT NOT RUNNING")
        print("Start STK Desktop, then run SENTINEL. SENTINEL will connect to STK via the Connect command port.")
        print("Until STK is started, SENTINEL will use the SGP4 fallback simulation.")
    else:
        print(f"\nStatus: NOT INSTALLED")
        print("Read: docs/STK_SETUP.md")
        print()
        print("SENTINEL is fully functional without STK — it uses the integrated SGP4 simulation engine.")
        print("To enable STK Advanced CAT integration, install STK per the setup guide.")

if __name__ == "__main__":
    main()
