import { NextResponse } from "next/server";
import { getBuildInfo } from "@/lib/build-info";

/** GET /api/build-info — PWA release identity (V4.1 Task 9.9). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getBuildInfo());
}
