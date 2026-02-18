import { describe, expect, it } from "bun:test";
import { parseWireOutput } from "@/lib/wireOutput";

describe("parseWireOutput", () => {
  it("extracts details from content before HTML marker when DETAILS marker is missing", () => {
    const raw = `The Nexus Admin Console presents a technical-grid aesthetic with deep slate and electric sky-blue accents.

HTML:
<!doctype html><html><body><main>Dashboard</main></body></html>`;

    const parsed = parseWireOutput(raw);
    expect(parsed.details).toContain("Nexus Admin Console");
    expect(parsed.html).toContain("<!doctype html>");
  });

  it("extracts details between DETAILS and HTML markers", () => {
    const raw = `DETAILS:
Summary text.
HTML:
<!doctype html><html><body><main>Page</main></body></html>`;

    const parsed = parseWireOutput(raw);
    expect(parsed.details).toBe("Summary text.");
    expect(parsed.html).toContain("<main>Page</main>");
  });
});
