from abc import ABC, abstractmethod
import threading
import time


class OAuthStateStore(ABC):
    @abstractmethod
    def kaydet(self, state: str, payload: dict, ttl_saniye: int = 600) -> None:
        """State ve payload sakla. TTL süresince geçerli."""

    @abstractmethod
    def tuket(self, state: str) -> dict | None:
        """State'i al ve sil (atomik). Yoksa veya süresi geçmişse None."""

    @abstractmethod
    def temizle_suresi_gecenler(self) -> int:
        """Süresi geçmiş state'leri sil. Silinen kayıt sayısını döner."""


class InMemoryOAuthStateStore(OAuthStateStore):
    def __init__(self):
        self._data: dict[str, tuple[dict, float]] = {}
        self._lock = threading.Lock()

    def kaydet(self, state: str, payload: dict, ttl_saniye: int = 600) -> None:
        expires_at = time.time() + ttl_saniye
        with self._lock:
            self._data[state] = (payload, expires_at)

    def tuket(self, state: str) -> dict | None:
        with self._lock:
            entry = self._data.pop(state, None)
        if entry is None:
            return None
        payload, expires_at = entry
        if time.time() > expires_at:
            return None
        return payload

    def temizle_suresi_gecenler(self) -> int:
        now = time.time()
        with self._lock:
            expired = [s for s, (_, exp) in self._data.items() if now > exp]
            for s in expired:
                del self._data[s]
        return len(expired)


def oauth_state_store_getir() -> OAuthStateStore:
    """Factory. Şu an InMemory. Phase 5B'de env var ile Redis seçimi."""
    return _state_store_singleton


_state_store_singleton = InMemoryOAuthStateStore()
