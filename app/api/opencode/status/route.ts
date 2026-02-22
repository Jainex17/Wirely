import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENCODE_SERVER_URL =
  process.env.OPENCODE_SERVER_URL?.trim() || "http://127.0.0.1:4096";
const OPENCODE_DIRECTORY =
  process.env.OPENCODE_DIRECTORY?.trim() || process.cwd();
const OPENCODE_INACTIVE_MESSAGE =
  "OpenCode is inactive. Run `opencode serve` in your terminal and retry.";

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const createBasicAuthHeader = () => {
  const username = process.env.OPENCODE_SERVER_USERNAME?.trim();
  const password = process.env.OPENCODE_SERVER_PASSWORD?.trim();

  if (!password) return null;
  const normalizedUsername = username || "opencode";
  return `Basic ${Buffer.from(`${normalizedUsername}:${password}`).toString(
    "base64",
  )}`;
};

const openCodeHeaders = () => {
  const authHeader = createBasicAuthHeader();
  return {
    ...(authHeader ? { Authorization: authHeader } : {}),
    "x-opencode-directory": OPENCODE_DIRECTORY,
  };
};

const isStatusActive = (payload: unknown): boolean | null => {
  if (typeof payload === "boolean") return payload;

  if (typeof payload === "string") {
    const normalized = payload.trim().toLowerCase();
    if (
      [
        "inactive",
        "stopped",
        "offline",
        "disconnected",
        "down",
        "unhealthy",
        "error",
        "fail",
        "failed",
      ].includes(normalized)
    ) {
      return false;
    }
    if (
      [
        "active",
        "running",
        "ready",
        "connected",
        "up",
        "ok",
        "healthy",
        "pass",
        "success",
      ].includes(normalized)
    ) {
      return true;
    }
    return null;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidateRecords: Record<string, unknown>[] = [record];
  if (
    record.session &&
    typeof record.session === "object" &&
    !Array.isArray(record.session)
  ) {
    candidateRecords.push(record.session as Record<string, unknown>);
  }
  if (
    record.server &&
    typeof record.server === "object" &&
    !Array.isArray(record.server)
  ) {
    candidateRecords.push(record.server as Record<string, unknown>);
  }

  const directBooleanFields = [
    "active",
    "isActive",
    "connected",
    "isConnected",
    "running",
    "ready",
    "ok",
    "healthy",
    "success",
  ] as const;

  for (const candidate of candidateRecords) {
    for (const field of directBooleanFields) {
      if (typeof candidate[field] === "boolean") {
        return candidate[field] as boolean;
      }
    }

    const statusField = candidate.status;
    if (typeof statusField === "string") {
      const normalized = statusField.trim().toLowerCase();
      if (
        [
          "inactive",
          "stopped",
          "offline",
          "disconnected",
          "down",
          "unhealthy",
          "error",
          "fail",
          "failed",
        ].includes(normalized)
      ) {
        return false;
      }
      if (
        [
          "active",
          "running",
          "ready",
          "connected",
          "up",
          "ok",
          "healthy",
          "pass",
          "success",
        ].includes(normalized)
      ) {
        return true;
      }
    }
  }

  return null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const statusJsonResponse = ({
  status = 200,
  active,
  message,
}: {
  status?: number;
  active?: boolean;
  message?: string;
}) => {
  const body =
    active === undefined && message === undefined
      ? ({ error: "Unauthenticated" } as const)
      : ({ active, message } as const);
  return NextResponse.json(body, { status, headers: noStoreHeaders });
};

export async function GET() {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return statusJsonResponse({ status: 401 });
  }

  const statusUrl = `${stripTrailingSlash(OPENCODE_SERVER_URL)}/global/health`;

  try {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: openCodeHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return statusJsonResponse({
        active: false,
        message: OPENCODE_INACTIVE_MESSAGE,
      });
    }

    const raw = await response.text();
    let payload: unknown = null;
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        payload = raw.trim();
      }
    }

    const active = payload === null ? true : (isStatusActive(payload) ?? true);
    return statusJsonResponse({
      active,
      message: active ? "OpenCode is active." : OPENCODE_INACTIVE_MESSAGE,
    });
  } catch {
    return statusJsonResponse({
      active: false,
      message: OPENCODE_INACTIVE_MESSAGE,
    });
  }
}
