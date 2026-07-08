#!/usr/bin/env bash
# 在 CI/macOS 等 externally-managed Python 环境中创建并激活虚拟环境。
set -euo pipefail

VENV_DIR="${CI_PYTHON_VENV:-.ci-python-venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install --quiet --upgrade pip
