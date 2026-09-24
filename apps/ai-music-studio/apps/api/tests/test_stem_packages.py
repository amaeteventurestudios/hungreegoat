import hashlib
import zipfile
from types import SimpleNamespace
from uuid import uuid4

import pytest

from studio_api.stem_packages import StemPackageValidationError, validate_stem_package_zip
from studio_api.stems import LABELS


def make_package(path, contents: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, value in contents.items():
            archive.writestr(filename, value)


def registered_stems(contents: dict[str, bytes]) -> dict:
    return {
        label: SimpleNamespace(
            id=uuid4(), sha256=hashlib.sha256(contents[f"{label}.flac"]).hexdigest()
        )
        for label in LABELS
    }


def test_valid_stem_package_returns_immutable_source_manifest(tmp_path):
    contents = {f"{label}.flac": b"fLaC" + label.encode() for label in LABELS}
    path = tmp_path / "stems.zip"
    make_package(path, contents)
    stems = registered_stems(contents)

    manifest = validate_stem_package_zip(path, stems)

    assert set(manifest) == set(LABELS)
    assert manifest["vocals"] == {
        "asset_id": str(stems["vocals"].id),
        "sha256": stems["vocals"].sha256,
    }


@pytest.mark.parametrize(
    "contents",
    [
        {
            "vocals.flac": b"fLaCv",
            "drums.flac": b"fLaCd",
            "bass.flac": b"fLaCb",
            "../other.flac": b"fLaCo",
        },
        {"vocals.flac": b"fLaCv", "drums.flac": b"fLaCd", "bass.flac": b"fLaCb"},
    ],
)
def test_stem_package_rejects_noncanonical_members(tmp_path, contents):
    path = tmp_path / "bad.zip"
    make_package(path, contents)
    full = {f"{label}.flac": b"fLaC" + label.encode() for label in LABELS}

    with pytest.raises(StemPackageValidationError):
        validate_stem_package_zip(path, registered_stems(full))


def test_stem_package_rejects_stem_bytes_that_do_not_match_registered_asset(tmp_path):
    contents = {f"{label}.flac": b"fLaC" + label.encode() for label in LABELS}
    path = tmp_path / "mismatch.zip"
    make_package(path, contents)
    stems = registered_stems(contents)
    stems["bass"].sha256 = "0" * 64

    with pytest.raises(StemPackageValidationError, match="registered immutable stem"):
        validate_stem_package_zip(path, stems)
