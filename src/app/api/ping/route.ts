import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";

// Keeps the serverless function and the Neon database awake while someone is using the app (see KeepWarm). Neon suspends an idle
// database after a few minutes and the next query then waits seconds for it to wake — that was the long pause on the first click.
// Signed-in users only, so it cannot be used to run up database wake-ups from outside.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await db.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true });
}
