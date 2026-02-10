"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, MoonIcon, SunIcon, Download } from "lucide-react";
import { useState } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { exportProject } from "../lib/exportProject";

export default function CanvasTopToolbar() {
  const [theme, setTheme] = useState(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });
  const { pages } = useEditorStore();

  const handleChnageTheme = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    setTheme(isDark ? "dark" : "light");
  };

  const handleExport = async () => {
    try {
      await exportProject(pages);
    } catch (error) {
      console.error("Failed to export project:", error);
      alert("Failed to export project. Please try again.");
    }
  };

  return (
    <div className="fixed top-4 right-4 flex items-center gap-2 z-50">
      <Button
        variant={"ghost"}
        className="bg-secondary text-secondary-foreground cursor-pointer"
        onClick={handleChnageTheme}
      >
        {theme === "light" ? <SunIcon /> : <MoonIcon />}
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={"ghost"}
            className="bg-secondary text-secondary-foreground cursor-pointer"
          >
            <span>Export</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          className="bg-primary-foreground text-secondary-foreground border-none"
        >
          <DropdownMenuItem onClick={handleExport} className="cursor-pointer">
            <Download className="w-4 h-4 mr-2" />
            <span>Export All Pages</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
