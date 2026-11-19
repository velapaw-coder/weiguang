#!/usr/bin/env bash
# Parent-box probe: same DebugModelPoster + HttpsModelTransport as the APK.
# Reads VOLC_ARK_API_KEY (or WEIGUANG_APK_TEST_API_KEY) from the environment only.
# Never prints the key. Intended for the parent box, not the cloud VM.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/tmp/weiguang-debug-model-probe.jar}"
KEY_ENV="${VOLC_ARK_API_KEY:-${WEIGUANG_APK_TEST_API_KEY:-}}"
if [[ -z "$KEY_ENV" ]]; then
  echo "missing VOLC_ARK_API_KEY or WEIGUANG_APK_TEST_API_KEY" >&2
  exit 2
fi
export VOLC_ARK_API_KEY="$KEY_ENV"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/classes"
javac -encoding UTF-8 -d "$WORKDIR/classes" \
  "$ROOT/android/band-core/src/main/java/com/weiguang/energy/core/DebugModelPoster.java" \
  "$ROOT/android/band-core/src/main/java/com/weiguang/energy/core/HttpsModelTransport.java" \
  "$ROOT/android/band-core/src/main/java/com/weiguang/energy/core/DebugModelProbe.java"
jar cfe "$OUT" com.weiguang.energy.core.DebugModelProbe -C "$WORKDIR/classes" .
chmod 600 "$OUT"
echo "jar=$OUT"
# Run without echoing env. Output is only http/completed/answer/ms.
java -jar "$OUT"
