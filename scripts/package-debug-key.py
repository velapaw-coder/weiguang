#!/usr/bin/env python3
"""Insert the debug-only Volcano key asset and re-sign with the original debug key.

The key is read from WEIGUANG_APK_TEST_API_KEY. It is never printed, never placed on
the command line, and never written inside the git repository. Output mode is 0600.
"""

from __future__ import annotations

import argparse
import os
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ASSET = "assets/weiguang_debug_model_key"
MAX_CHARS = 512


def fail(message: str, secret: str = "") -> None:
    if secret and secret in message:
        message = message.replace(secret, "[redacted]")
    sys.stderr.write(message + "\n")
    raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Package a private debug key into a debug APK.")
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--keystore", required=True, type=Path)
    parser.add_argument("--apksigner", required=True, type=Path)
    parser.add_argument("--zipalign", required=True, type=Path)
    parser.add_argument("--java", default="java")
    return parser.parse_args()


def read_key() -> str:
    value = os.environ.get("WEIGUANG_APK_TEST_API_KEY", "")
    text = value.strip()
    if not text or len(text) > MAX_CHARS or "\n" in text or "\r" in text:
        fail("WEIGUANG_APK_TEST_API_KEY is missing or unusable")
    return text


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def assert_outside_repo(path: Path, secret: str) -> None:
    resolved = path.resolve()
    root = repo_root().resolve()
    if resolved == root or root in resolved.parents:
        fail("refusing to write inside the repository", secret)


def debuggable(apk: Path, secret: str) -> None:
    with zipfile.ZipFile(apk) as archive:
        try:
            manifest = archive.read("AndroidManifest.xml")
        except KeyError:
            fail("apk has no manifest", secret)
    if "debuggable".encode("utf-16le") not in manifest and b"debuggable" not in manifest:
        fail("refusing an apk that is not debuggable", secret)


def rewrite(src: Path, dest: Path, key: str) -> None:
    payload = key.encode("utf-8")
    with zipfile.ZipFile(src, "r") as source, zipfile.ZipFile(dest, "w") as output:
        for info in source.infolist():
            name = info.filename
            if name == ASSET:
                continue
            if name.startswith("META-INF/") and (
                name == "META-INF/MANIFEST.MF"
                or name.endswith((".SF", ".RSA", ".DSA", ".EC", ".MF"))
            ):
                continue
            output.writestr(info, source.read(name))
        entry = zipfile.ZipInfo(ASSET)
        entry.compress_type = zipfile.ZIP_DEFLATED
        output.writestr(entry, payload)


def run(cmd: list[str], env: dict[str, str], secret: str) -> str:
    completed = subprocess.run(cmd, env=env, text=True, capture_output=True)
    if completed.returncode != 0:
        fail("packaging command failed", secret)
    combined = (completed.stdout or "") + (completed.stderr or "")
    if secret in combined:
        fail("tool output contained the key", secret)
    return completed.stdout


def cert_sha256(java: str, apksigner: Path, apk: Path, env: dict[str, str], secret: str) -> str:
    text = run([java, "-jar", str(apksigner), "verify", "--print-certs", str(apk)], env, secret)
    for line in text.splitlines():
        if "SHA-256 digest" in line:
            return line.split(":", 1)[-1].strip()
    fail("signer certificate was not reported", secret)
    return ""


def main() -> None:
    args = parse_args()
    key = read_key()
    assert_outside_repo(args.out, key)
    if not args.apk.is_file() or not args.keystore.is_file() or not args.apksigner.is_file() or not args.zipalign.is_file():
        fail("a packaging input is missing", key)
    debuggable(args.apk, key)
    work = Path(tempfile.mkdtemp(prefix="wg-apk-"))
    os.chmod(work, 0o700)
    unsigned = work / "unsigned.apk"
    aligned = work / "aligned.apk"
    try:
        rewrite(args.apk, unsigned, key)
        os.chmod(unsigned, 0o600)
        zipalign = work / "zipalign"
        zipalign.write_bytes(args.zipalign.read_bytes())
        os.chmod(zipalign, 0o755)
        libdir = args.zipalign.resolve().parent / "lib64"
        child = {name: value for name, value in os.environ.items() if name != "WEIGUANG_APK_TEST_API_KEY"}
        if (libdir / "libc++.so").is_file():
            child["LD_LIBRARY_PATH"] = str(libdir) + (
                os.pathsep + child["LD_LIBRARY_PATH"] if child.get("LD_LIBRARY_PATH") else ""
            )
        child["WEIGUANG_DEBUG_STORE_PASS"] = os.environ.get("WEIGUANG_DEBUG_STORE_PASS", "android")
        child["WEIGUANG_DEBUG_KEY_PASS"] = os.environ.get("WEIGUANG_DEBUG_KEY_PASS", "android")
        run([str(zipalign), "-f", "-p", "4", str(unsigned), str(aligned)], child, key)
        os.chmod(aligned, 0o600)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        run(
            [
                args.java,
                "-jar",
                str(args.apksigner),
                "sign",
                "--ks",
                str(args.keystore),
                "--ks-key-alias",
                "androiddebugkey",
                "--ks-pass",
                "env:WEIGUANG_DEBUG_STORE_PASS",
                "--key-pass",
                "env:WEIGUANG_DEBUG_KEY_PASS",
                "--out",
                str(args.out),
                str(aligned),
            ],
            child,
            key,
        )
        os.chmod(args.out, 0o600)
        with zipfile.ZipFile(args.out) as signed:
            stored = signed.read(ASSET).decode("utf-8")
        if stored != key:
            args.out.unlink(missing_ok=True)
            fail("packaged asset did not round-trip", key)
        fingerprint = cert_sha256(args.java, args.apksigner, args.out, child, key)
        original = cert_sha256(args.java, args.apksigner, args.apk, child, key)
        if fingerprint != original:
            args.out.unlink(missing_ok=True)
            fail("signature fingerprint changed", key)
        sys.stdout.write(f"ok fingerprint={fingerprint}\n")
    finally:
        for path in (unsigned, aligned, work / "zipalign"):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        try:
            work.rmdir()
        except OSError:
            pass


if __name__ == "__main__":
    main()
