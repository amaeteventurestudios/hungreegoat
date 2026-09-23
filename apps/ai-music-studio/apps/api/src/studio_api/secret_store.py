"""Server-only encrypted credential storage; references are opaque UUIDs."""

import os
import stat
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

from cryptography.fernet import Fernet, InvalidToken


class SecretStoreError(Exception):
    pass


class SecretStore(Protocol):
    def set_secret(self, value: str) -> str: ...
    def has_secret(self, reference: str) -> bool: ...
    def masked_secret(self, reference: str) -> str: ...
    def get_secret_for_server_use(self, reference: str) -> str: ...
    def delete_secret(self, reference: str) -> None: ...


class EncryptedFileSecretStore:
    def __init__(self, root: Path, key_file: Path):
        if not root.is_absolute() or not key_file.is_absolute():
            raise SecretStoreError("Secret storage requires absolute paths")
        try:
            for target in (root, key_file):
                if any(part.is_symlink() for part in (target, *target.parents)):
                    raise SecretStoreError("Secret paths cannot contain symlinks")
            if root.is_symlink():
                raise SecretStoreError("Secret directory cannot be a symlink")
            root.mkdir(mode=0o700, parents=True, exist_ok=True)
            if not root.is_dir() or stat.S_IMODE(root.stat().st_mode) != 0o700:
                raise SecretStoreError("Secret directory requires mode 0700")
            if key_file.resolve().is_relative_to(root.resolve()):
                raise SecretStoreError("Encryption key must be outside secret directory")
            self.root = root
            self.cipher = Fernet(self._read_private(key_file).strip())
        except (OSError, ValueError):
            raise SecretStoreError("Secret storage is not securely configured") from None

    @staticmethod
    def _read_private(path: Path) -> bytes:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as file:
            info = os.fstat(file.fileno())
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
                raise SecretStoreError("Secret files require mode 0600")
            value = file.read(32769)
            if len(value) > 32768:
                raise SecretStoreError("Secret file exceeds size limit")
            return value

    def _path(self, reference: str) -> Path:
        try:
            if str(UUID(reference)) != reference:
                raise ValueError
        except (ValueError, TypeError, AttributeError):
            raise SecretStoreError("Invalid secret reference") from None
        return self.root / reference

    def set_secret(self, value: str) -> str:
        reference = str(uuid4())
        path = self._path(reference)
        temporary = self.root / (".tmp-" + str(uuid4()))
        try:
            encrypted = self.cipher.encrypt(value.encode())
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as file:
                file.write(encrypted)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)
            directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
            return reference
        except OSError:
            raise SecretStoreError("Unable to store credential") from None
        finally:
            temporary.unlink(missing_ok=True)

    def has_secret(self, reference: str) -> bool:
        path = self._path(reference)
        return path.is_file() and not path.is_symlink()

    def masked_secret(self, reference: str) -> str:
        return "••••" + self.get_secret_for_server_use(reference)[-4:]

    def get_secret_for_server_use(self, reference: str) -> str:
        try:
            return self.cipher.decrypt(self._read_private(self._path(reference))).decode()
        except (OSError, ValueError, InvalidToken):
            raise SecretStoreError("Unable to read credential") from None

    def delete_secret(self, reference: str) -> None:
        try:
            self._path(reference).unlink(missing_ok=True)
        except OSError:
            raise SecretStoreError("Unable to remove credential") from None
