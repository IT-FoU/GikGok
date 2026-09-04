"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { recordClientHealthHint } from "@/lib/observability/logger";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  message: string;
};

/**
 * User-safe error boundary — never surfaces stack traces or secrets.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(_error: Error): State {
    return {
      hasError: true,
      message: "Something went wrong. You can keep using the app.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    recordClientHealthHint("client.error_boundary", error.name);
    console.error(
      JSON.stringify({
        level: "error",
        message: "client_error_boundary",
        name: error.name,
        digest: info.componentStack?.slice(0, 120),
      }),
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-10 text-center"
        >
          <h2 className="font-display text-xl font-semibold">
            {this.props.fallbackTitle ?? "Temporary glitch"}
          </h2>
          <p className="text-sm text-[var(--brand-muted)]">{this.state.message}</p>
          <Button
            type="button"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
