import { Bot } from "grammy";
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { redis, incrementEmailCount, incrementRoleCount, saveEmail } from "@/lib/redis";
import { validateEmail, sanitizeEmail } from "@/lib/validators";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

// Rate limiter
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(3, "1h"),
});

// Verify Turnstile
async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY!,
          response: token,
        }),
      }
    );
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting
    const ip = req.headers.get("x-forwarded-for") || "anonymous";
    const { success: rateLimitSuccess } = await ratelimit.limit(ip);
    if (!rateLimitSuccess) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // 2. Parse body
    const body = await req.json();
    const { email, role, turnstileToken } = body;

    // 3. Validate Turnstile
    if (!turnstileToken) {
      return NextResponse.json(
        { error: "Verification required" },
        { status: 400 }
      );
    }

    const isValidTurnstile = await verifyTurnstile(turnstileToken);
    if (!isValidTurnstile) {
      return NextResponse.json(
        { error: "Verification failed. Please try again." },
        { status: 400 }
      );
    }

    // 4. Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const sanitizedEmail = sanitizeEmail(email);
    if (!validateEmail(sanitizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // 5. Validate role
    const validRoles = ["Founder", "Designer", "Developer", "Investor"];
    if (!role || typeof role !== "string" || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Please select a valid role" },
        { status: 400 }
      );
    }

    // 6. Save to Redis
    await Promise.all([
      saveEmail(sanitizedEmail, role),
      incrementEmailCount(),
      incrementRoleCount(role),
    ]);

    // 7. Send Telegram message
    const message = `
📩 *New email collected from site*

👤 *Role:* ${role}
📧 *Email:* ${sanitizedEmail}

🕒 *Time:* ${new Date().toLocaleString("en-US", { timeZone: "UTC" })}
    `;

    await bot.api.sendMessage(CHAT_ID, message, {
      parse_mode: "Markdown",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}