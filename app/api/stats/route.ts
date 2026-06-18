import { NextResponse } from "next/server";
import { getStats, getTodayEmails } from "@/lib/redis";

export async function GET() {
  try {
    const [stats, todayEmails] = await Promise.all([
      getStats(),
      getTodayEmails(),
    ]);

    return NextResponse.json({
      ...stats,
      todayEmails,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statss" },
      { status: 500 }
    );
  }
}