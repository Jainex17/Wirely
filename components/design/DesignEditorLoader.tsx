"use client";

import dynamic from "next/dynamic";

/**
 * The design editor runs only in the browser: it draws with WebGL and loads
 * the renderer's wasm, neither of which exists during server rendering.
 */
const DesignEditor = dynamic(() => import("@/components/design/DesignEditor"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#1e1e1e]" />,
});

export default DesignEditor;
