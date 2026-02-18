import { afterEach, describe, expect, it } from "bun:test";
import { createSafeLocalStorage } from "@/lib/storage/safeLocalStorage";

const originalWindow = (globalThis as { window?: Window }).window;

const restoreWindow = () => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: Window }).window;
    return;
  }
  (globalThis as { window?: Window }).window = originalWindow;
};

afterEach(() => {
  restoreWindow();
});

describe("createSafeLocalStorage", () => {
  it("falls back to in-memory storage when window is unavailable", () => {
    delete (globalThis as { window?: Window }).window;
    const storage = createSafeLocalStorage("wirely-editor-storage");

    storage.setItem("wirely-editor-storage", '{"zoom":100}');
    expect(storage.getItem("wirely-editor-storage")).toBe('{"zoom":100}');
  });

  it("retries after quota errors by pruning the persisted key", () => {
    let setItemCalls = 0;
    let removedKey: string | null = null;
    let persistedValue: string | null = null;

    const localStorageMock = {
      getItem: (name: string) => {
        void name;
        return persistedValue;
      },
      setItem: (name: string, value: string) => {
        void name;
        setItemCalls += 1;
        if (setItemCalls === 1) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        persistedValue = value;
      },
      removeItem: (name: string) => {
        removedKey = name;
        persistedValue = null;
      },
    };

    (globalThis as { window?: Window }).window = {
      localStorage: localStorageMock,
    } as unknown as Window;

    const storage = createSafeLocalStorage("wirely-editor-storage");
    storage.setItem("wirely-editor-storage", '{"zoom":120}');

    expect(setItemCalls).toBe(2);
    expect(String(removedKey)).toBe("wirely-editor-storage");
    expect(storage.getItem("wirely-editor-storage")).toBe('{"zoom":120}');
  });
});
