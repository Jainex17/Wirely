import { ImageResponse } from "next/og";

// The link preview image for every public URL. Colors are the dark theme's
// --background, --foreground, and --muted-foreground, and the mark is the
// same shapes as components/icons/WirelyMark.tsx.
export const alt = "Wirely, the design canvas for your coding agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#08090d",
          color: "#e9ecf5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 600 }}>
          <svg width="64" height="64" viewBox="0 0 200 200">
            <path d="M100 0A100 100 0 0 0 0 100h100z" fill="#e9ecf5" />
            <circle cx="150" cy="50" r="46" fill="#2f6699" />
            <path d="M0 100l100 100H0z" fill="#6c9bd2" />
            <path d="M100 100h100A100 100 0 0 1 100 200z" fill="#a3c0dd" />
          </svg>
          Wirely
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
            The design canvas for your coding agent.
          </div>
          <div style={{ fontSize: 28, color: "#8d94a3" }}>
            Claude Code, Cursor, Codex, and any MCP client. Free and open source.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
