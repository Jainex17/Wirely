import { NextResponse } from "next/server";

const deprecatedAuthHandler = () =>
  NextResponse.json(
    { error: "This endpoint is deprecated. Authentication is handled by Clerk." },
    { status: 410 },
  );

export const GET = deprecatedAuthHandler;
export const POST = deprecatedAuthHandler;
export const PUT = deprecatedAuthHandler;
export const PATCH = deprecatedAuthHandler;
export const DELETE = deprecatedAuthHandler;
