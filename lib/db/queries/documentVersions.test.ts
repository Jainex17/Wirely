import { describe, expect, it } from "bun:test";
import {
  DOCUMENT_HISTORY_MAX_BYTES,
  DOCUMENT_VERSIONS_KEPT,
  documentVersionsToPrune,
} from "@/lib/db/queries/documentVersions";

const versions = (sizes: number[]) => sizes.map((byteSize, index) => ({ id: `v${index}`, byteSize }));

describe("documentVersionsToPrune", () => {
  it("keeps the newest snapshots up to the count", () => {
    const pruned = documentVersionsToPrune(versions(Array(DOCUMENT_VERSIONS_KEPT + 2).fill(50_000)));
    expect(pruned).toEqual([`v${DOCUMENT_VERSIONS_KEPT}`, `v${DOCUMENT_VERSIONS_KEPT + 1}`]);
  });

  it("drops older snapshots once the history passes its byte budget", () => {
    const size = DOCUMENT_HISTORY_MAX_BYTES / 4;
    expect(documentVersionsToPrune(versions([size, size, size, size, size, size]))).toEqual(["v4", "v5"]);
  });

  it("keeps the newest snapshot even when it alone is over the budget", () => {
    const pruned = documentVersionsToPrune(versions([DOCUMENT_HISTORY_MAX_BYTES * 2, 1_000]));
    expect(pruned).toEqual(["v1"]);
  });

  it("prunes nothing from a short history", () => {
    expect(documentVersionsToPrune(versions([80_000, 90_000]))).toEqual([]);
  });
});
