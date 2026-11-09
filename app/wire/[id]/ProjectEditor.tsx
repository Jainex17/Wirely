"use client";

import { type ComponentProps, useMemo, useState } from "react";
import HoverTips from "@/components/HoverTips";
import { ProjectChromeContext } from "@/components/ProjectChrome";
import WireEditor from "./WireEditor";

interface ProjectEditorProps {
  projectTitle: string;
  wire: ComponentProps<typeof WireEditor>;
}

/** One project's canvas, with the project title and id the panels read. */
export default function ProjectEditor({ projectTitle: initialTitle, wire }: ProjectEditorProps) {
  // Held here so a rename in the header shows at once without a reload.
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const chrome = useMemo(
    () => ({ projectId: wire.wireId, projectTitle, setProjectTitle }),
    [wire.wireId, projectTitle],
  );
  return (
    <ProjectChromeContext value={chrome}>
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        <WireEditor {...wire} />
        <HoverTips />
      </div>
    </ProjectChromeContext>
  );
}
