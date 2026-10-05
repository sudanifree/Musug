#!/usr/bin/env python3
"""Build installable CRX3 and XPI packages for the browser extension."""

import hashlib
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
KEY_PATH = DIST / "extension-signing-key.pem"
PACKAGE_FILES = (
    "manifest.json",
    "content.js",
    "popup.html",
    "popup.css",
    "popup.js",
)


def encode_varint(value):
    encoded = bytearray()
    while value > 0x7F:
        encoded.append((value & 0x7F) | 0x80)
        value >>= 7
    encoded.append(value)
    return bytes(encoded)


def protobuf_bytes(field_number, value):
    return encode_varint((field_number << 3) | 2) + encode_varint(len(value)) + value


def make_archive():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("manifest_version") != 3:
        raise ValueError("Only Manifest V3 extensions are supported.")

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
        for relative_path in PACKAGE_FILES:
            path = ROOT / relative_path
            if not path.is_file():
                raise FileNotFoundError(f"Required extension file is missing: {path}")
            package.write(path, relative_path)
    return archive.getvalue()


def ensure_signing_key(openssl):
    DIST.mkdir(parents=True, exist_ok=True)
    if not KEY_PATH.exists():
        subprocess.run(
            [
                openssl,
                "genpkey",
                "-algorithm",
                "RSA",
                "-pkeyopt",
                "rsa_keygen_bits:2048",
                "-out",
                str(KEY_PATH),
            ],
            check=True,
        )
    os.chmod(KEY_PATH, 0o600)


def make_crx(archive, openssl):
    public_key = subprocess.run(
        [openssl, "pkey", "-in", str(KEY_PATH), "-pubout", "-outform", "DER"],
        check=True,
        capture_output=True,
    ).stdout
    crx_id = hashlib.sha256(public_key).digest()[:16]
    signed_header_data = protobuf_bytes(1, crx_id)
    signature_input = (
        b"CRX3 SignedData\x00"
        + struct.pack("<I", len(signed_header_data))
        + signed_header_data
        + archive
    )
    signature = subprocess.run(
        [openssl, "dgst", "-sha256", "-sign", str(KEY_PATH)],
        input=signature_input,
        check=True,
        capture_output=True,
    ).stdout

    proof = protobuf_bytes(1, public_key) + protobuf_bytes(2, signature)
    header = protobuf_bytes(2, proof) + protobuf_bytes(10000, signed_header_data)
    return b"Cr24" + struct.pack("<II", 3, len(header)) + header + archive


def main():
    openssl = shutil.which("openssl")
    if not openssl:
        raise RuntimeError("OpenSSL is required to create the signed CRX package.")

    archive = make_archive()
    ensure_signing_key(openssl)
    xpi_path = DIST / "musug-extension.xpi"
    crx_path = DIST / "musug-extension.crx"
    xpi_path.write_bytes(archive)
    crx_path.write_bytes(make_crx(archive, openssl))
    print(f"Created {xpi_path}")
    print(f"Created {crx_path}")
    print(f"Signing key: {KEY_PATH} (keep private for future updates)")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Extension packaging failed: {error}", file=sys.stderr)
        sys.exit(1)
