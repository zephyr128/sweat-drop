#!/usr/bin/env python3
"""
Patch apps/mobile-app/android/app/build.gradle to sign release builds with the
upload keystore defined in apps/mobile-app/android/keystore.properties.

`expo prebuild` regenerates build.gradle every run with a template that signs
release using debug.keystore, which Google Play rejects with a wrong-key error.
This script rewrites the signingConfigs/buildTypes blocks idempotently so the
release AAB is signed with the real upload key.

Usage:
  python3 patch-android-signing.py <path/to/android/app/build.gradle>
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

LOADER_BLOCK = """def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

"""

RELEASE_SIGNING_CONFIG = """        release {
            if (keystoreProperties['storeFile']) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
"""


def patch(src: str) -> str:
    # 1) Prepend keystore.properties loader before `android {` if not already present.
    if "keystorePropertiesFile" not in src:
        idx = src.find("android {")
        if idx == -1:
            raise SystemExit("Could not find 'android {' block in build.gradle")
        src = src[:idx] + LOADER_BLOCK + src[idx:]

    # 2) Add a `release` signingConfig next to `debug` inside signingConfigs { ... }.
    #    Idempotent: only appear inside the release signingConfig block we inject,
    #    so checking for `keystoreProperties['storeFile']` is a reliable marker.
    if "keystoreProperties['storeFile']" not in src:
        pattern = re.compile(
            r"(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*)(\})",
            re.DOTALL,
        )
        replacement = r"\1" + RELEASE_SIGNING_CONFIG + r"    \2"
        new_src, n = pattern.subn(replacement, src, count=1)
        if n != 1:
            raise SystemExit(
                "Could not locate signingConfigs { debug { ... } } block to patch"
            )
        src = new_src

    # 3) Point the release buildType to signingConfigs.release instead of debug.
    #    expo template contains exactly:
    #        release {
    #            // Caution! In production, you need to generate your own keystore file.
    #            // see https://reactnative.dev/docs/signed-apk-android.
    #            signingConfig signingConfigs.debug
    release_buildtype_pattern = re.compile(
        r"(release\s*\{\s*(?://[^\n]*\n\s*)*)signingConfig\s+signingConfigs\.debug",
    )
    src, n = release_buildtype_pattern.subn(
        r"\1signingConfig signingConfigs.release", src, count=1
    )
    if n == 0 and "signingConfig signingConfigs.release" not in src:
        raise SystemExit(
            "Could not locate `release { ... signingConfig signingConfigs.debug }` to rewrite"
        )

    return src


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: patch-android-signing.py <build.gradle>")

    gradle_path = Path(sys.argv[1])
    if not gradle_path.is_file():
        raise SystemExit(f"File not found: {gradle_path}")

    original = gradle_path.read_text()
    patched = patch(original)

    if patched == original:
        print(f"[patch-android-signing] {gradle_path} already patched — no changes")
        return

    gradle_path.write_text(patched)
    print(f"[patch-android-signing] Patched {gradle_path}")


if __name__ == "__main__":
    main()
