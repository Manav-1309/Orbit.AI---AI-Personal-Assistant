import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey } from "@/lib/insforge-admin";
import { generateAutomaticAlertsForUser } from "@/lib/alert-auto-generation";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to generate alerts with RLS enabled." },
        { status: 503 }
      );
    }

    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const result = await generateAutomaticAlertsForUser(userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    console.error("Error in POST /api/alerts/generate:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
