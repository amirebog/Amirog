import { Bot } from "grammy";
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import {
  redis,
  incrementEmailCount,
  incrementRoleCount,
  saveContact,
} from "@/lib/redis";
import { validateEmail, sanitizeEmail } from "@/lib/validators";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(3, "1h"),
});

async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch(
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
    const data = await res.json();
    return data.success === true;
  } catch {
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
    const { email, contact, role, turnstileToken } = body;

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

    // 4. Validate Email
    if (!email || typeof email !== "string" || email.trim() === "") {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }
    const sanitizedEmail = sanitizeEmail(email.trim());
    if (!sanitizedEmail || !validateEmail(sanitizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // 5. Validate Contact (Telegram ID or Phone)
    if (!contact || typeof contact !== "string" || contact.trim().length < 3) {
      return NextResponse.json(
        { error: "Please enter a valid Telegram ID or phone number (min 3 characters)" },
        { status: 400 }
      );
    }
    const trimmedContact = contact.trim();

    // 6. Validate Role
    const validRoles = ["Founder", "Designer", "Developer", "Investor"];
    if (!role || typeof role !== "string" || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Please select a valid role" },
        { status: 400 }
      );
    }

    // 7. Save to Redis
    await Promise.all([
      saveContact(sanitizedEmail, trimmedContact, role), // ذخیره هر دو
      incrementEmailCount(),
      incrementRoleCount(role),
    ]);

    // 8. Send Telegram message with both fields
    const message = `
📩 *New contact collected from site*

👤 *Role:* ${role}
📧 *Email:* ${sanitizedEmail}
📱 *Telegram ID / Phone:* ${trimmedContact}

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