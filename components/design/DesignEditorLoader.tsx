"use client";

import dynamic from "next/dynamic";
import { type ComponentProps, Component, type ReactNode, useCallback, useState } from "react";
import type DesignEditor from "./DesignEditor";

// The design editor runs only in the browser: it draws with WebGL and loads
// the renderer's wasm, neither of which exists during server rendering.
const LoadedEditor = dynamic(() => import("@/components/design/DesignEditor"), {
  ssr: false,
  loading: () => null,
});

/** The canvas shown while the editor module cannot render, with the way back to HTML. */
function ModuleFallback({ viewTabs }: { viewTabs: ReactNode }) {
  return (
    <div className="relative h-dvh w-full bg-[#1e1e1e]">
      <div className="absolute right-3 top-3 z-20">{viewTabs}</div>
    </div>
  );
}

/**
 * Keeps a failed editor from taking the fallback with it. It renders nothing
 * of its own: the fallback outside it stays up, and onCatch brings that back
 * if the editor had already mounted.
 */
class ModuleBoundary extends Component<{ onCatch?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onCatch?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The tab switch has to outlive the editor module, the one part of the
 * project that loads apart from the page. While the module loads — or fails
 * to — the fallback keeps the switch up, and DesignEditor takes over showing
 * it once it can render.
 */
export default function DesignEditorLoader(props: ComponentProps<typeof DesignEditor>) {
  const [moduleReady, setModuleReady] = useState(false);
  const handleReady = useCallback(() => setModuleReady(true), []);
  const handleCatch = useCallback(() => setModuleReady(false), []);
  return (
    <>
      {moduleReady ? null : <ModuleFallback viewTabs={props.viewTabs} />}
      <ModuleBoundary onCatch={handleCatch}>
        <LoadedEditor {...props} onModuleReady={handleReady} />
      </ModuleBoundary>
    </>
  );
}
