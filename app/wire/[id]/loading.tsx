// Shown while the server reads the project. It mirrors the editor's layout and
// colors so opening a project swaps in the real editor instead of flashing a
// blank dark screen first.
export default function WireLoading() {
  return (
    <main className="editor-theme flex h-screen w-full flex-col overflow-hidden bg-background">
      <div className="h-9 shrink-0 border-b border-sidebar-border bg-sidebar" />
      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar" />
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 canvas-dots" />
        </div>
        <div className="w-72 shrink-0 border-l border-sidebar-border bg-sidebar">
          <div className="h-12 border-b border-sidebar-border" />
        </div>
      </div>
    </main>
  );
}
