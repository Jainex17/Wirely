import type { SVGProps } from "react";

// The navy quadrant follows the text color so the mark reads on both themes.
// The three blues are --primary, --chart-2, and --chart-3 from the light theme.
// app/icon.svg draws the same shapes for the favicon; keep the two in step.
export default function WirelyMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M100 0A100 100 0 0 0 0 100h100z" fill="currentColor" />
      <circle cx="150" cy="50" r="46" fill="#2f6699" />
      <path d="M0 100l100 100H0z" fill="#6c9bd2" />
      <path d="M100 100h100A100 100 0 0 1 100 200z" fill="#a3c0dd" />
    </svg>
  );
}
