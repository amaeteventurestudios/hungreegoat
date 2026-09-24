"""Validation for immutable four-stem ZIP delivery packages."""

import hashlib
import zipfile
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from uuid import UUID

from studio_api.stems import LABELS

MAX_STEM_PACKAGE_BYTES = 100 * 1024 * 1024
MAX_STEM_PACKAGE_UNCOMPRESSED_BYTES = 400 * 1024 * 1024
STEM_PACKAGE_FILENAMES = {label: f"{label}.flac" for label in LABELS}


class StemPackageValidationError(ValueError):
    """The uploaded archive is not a safe, truthful stem package."""


def _expected_source(value: Any) -> tuple[str, str]:
    """Accept an AudioAsset-like object, mapping, or ``(id, sha256)`` tuple."""
    if isinstance(value, tuple) and len(value) == 2:
        asset_id, sha256 = value
    elif isinstance(value, Mapping):
        asset_id = value.get("asset_id", value.get("id"))
        sha256 = value.get("sha256")
    else:
        asset_id = getattr(value, "asset_id", getattr(value, "id", None))
        sha256 = getattr(value, "sha256", None)
    if not isinstance(asset_id, UUID) or not isinstance(sha256, str) or len(sha256) != 64:
        raise StemPackageValidationError("Registered stem sources are invalid")
    try:
        int(sha256, 16)
    except ValueError:
        raise StemPackageValidationError("Registered stem sources are invalid") from None
    return str(asset_id), sha256.lower()


def validate_stem_package_zip(path: Path, stems: Mapping[str, Any]) -> dict[str, dict[str, str]]:
    """Validate a generated ZIP and return its durable source-lineage manifest.

    ``stems`` must map every canonical label to its immutable AudioAsset (or a
    compatible ``(asset_id, sha256)`` pair). Archive paths are deliberately
    restricted to the four root-level canonical FLAC file names.
    """
    try:
        package_size = path.stat().st_size
    except OSError as error:
        raise StemPackageValidationError("Stem package is unavailable") from error
    if not 0 < package_size <= MAX_STEM_PACKAGE_BYTES:
        raise StemPackageValidationError("Stem package exceeds 100 MiB")
    if set(stems) != set(LABELS):
        raise StemPackageValidationError("Exactly four registered stems are required")
    expected = {label: _expected_source(stems[label]) for label in LABELS}
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            names = [member.filename for member in members]
            if len(members) != len(LABELS) or set(names) != set(STEM_PACKAGE_FILENAMES.values()):
                raise StemPackageValidationError(
                    "Package must contain exactly the four canonical FLAC files"
                )
            if len(set(names)) != len(names):
                raise StemPackageValidationError("Package contains duplicate entries")
            total_uncompressed = 0
            manifest: dict[str, dict[str, str]] = {}
            for label in LABELS:
                filename = STEM_PACKAGE_FILENAMES[label]
                member = archive.getinfo(filename)
                if member.is_dir() or member.flag_bits & 0x1:
                    raise StemPackageValidationError(
                        "Package members must be regular unencrypted files"
                    )
                total_uncompressed += member.file_size
                if total_uncompressed > MAX_STEM_PACKAGE_UNCOMPRESSED_BYTES:
                    raise StemPackageValidationError("Package expands beyond 400 MiB")
                digest = hashlib.sha256()
                with archive.open(member) as source:
                    first = source.read(4)
                    if first != b"fLaC":
                        raise StemPackageValidationError(f"{filename} is not FLAC audio")
                    digest.update(first)
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
                asset_id, expected_sha256 = expected[label]
                actual_sha256 = digest.hexdigest()
                if actual_sha256 != expected_sha256:
                    raise StemPackageValidationError(
                        f"{filename} does not match its registered immutable stem"
                    )
                manifest[label] = {"asset_id": asset_id, "sha256": expected_sha256}
            return manifest
    except StemPackageValidationError:
        raise
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError) as error:
        raise StemPackageValidationError("Stem package is not a valid ZIP archive") from error
