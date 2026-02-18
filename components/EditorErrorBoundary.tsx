"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { useEditorStore } from "@/store/useEditorStore";

interface EditorErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface EditorErrorBoundaryState {
  hasError: boolean;
}

export default class EditorErrorBoundary extends Component<
  EditorErrorBoundaryProps,
  EditorErrorBoundaryState
> {
  state: EditorErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("editor_boundary_caught_error", {
      title: this.props.title,
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    useEditorStore.getState().resetProject();
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-full w-full items-center justify-center p-6 bg-card">
        <div className="max-w-md rounded-lg border border-border bg-background p-5 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {this.props.title ?? "Editor panel crashed"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error occurred in this area. You can retry render,
            refresh the page, or reset local editor state.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={this.handleRetry}>
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={this.handleReload}>
              Refresh
            </Button>
            <Button type="button" variant="destructive" onClick={this.handleResetState}>
              Reset State
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

