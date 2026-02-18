import type { StateStorage } from "zustand/middleware";
import { logger } from "@/lib/logger";

const isQuotaExceededError = (error: unknown) => {
  if (!(error instanceof DOMException)) return false;
  return (
    error.code === 22 ||
    error.code === 1014 ||
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
};

export const createSafeLocalStorage = (persistKey: string): StateStorage => {
  const memoryFallback = new Map<string, string>();

  const getBrowserStorage = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  };

  return {
    getItem: (name) => {
      const storage = getBrowserStorage();
      if (!storage) return memoryFallback.get(name) ?? null;

      try {
        return storage.getItem(name);
      } catch (error) {
        logger.warn("local_storage_read_failed", { name, error });
        return memoryFallback.get(name) ?? null;
      }
    },
    setItem: (name, value) => {
      memoryFallback.set(name, value);

      const storage = getBrowserStorage();
      if (!storage) return;

      try {
        storage.setItem(name, value);
        return;
      } catch (error) {
        if (isQuotaExceededError(error) && name === persistKey) {
          try {
            storage.removeItem(persistKey);
            storage.setItem(name, value);
            return;
          } catch (retryError) {
            logger.warn("local_storage_quota_retry_failed", {
              name,
              retryError,
            });
            return;
          }
        }

        logger.warn("local_storage_write_failed", { name, error });
      }
    },
    removeItem: (name) => {
      memoryFallback.delete(name);

      const storage = getBrowserStorage();
      if (!storage) return;

      try {
        storage.removeItem(name);
      } catch (error) {
        logger.warn("local_storage_remove_failed", { name, error });
      }
    },
  };
};

