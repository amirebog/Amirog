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
  limiter: Ratelimit.slidingWindow(3, "1h"), // ۳ درخواست در هر ساعت برای هر IP
});

export async function POST(req: NextRequest) {
  try {
    // ۱. محدودیت نرخ درخواست
    const ip = req.headers.get("x-forwarded-for") || "anonymous";
    const { success: rateLimitSuccess } = await ratelimit.limit(ip);
    if (!rateLimitSuccess) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // ۲. دریافت داده‌ها
    const body = await req.json();
    const { email, contact, role, timestamp } = body;

    // ۳. بررسی timestamp (ضد اسپم)
    if (!timestamp || typeof timestamp !== "number") {
      return NextResponse.json(
        { error: "Invalid request: missing timestamp" },
        { status: 400 }
      );
    }
    const elapsed = Date.now() - timestamp;
    if (elapsed < 3000) {
      return NextResponse.json(
        { error: "Form submitted too quickly. Please take your time." },
        { status: 400 }
      );
    }

    // ۴. اعتبارسنجی ایمیل
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

    // ۵. اعتبارسنجی تماس (تلگرام یا شماره)
    if (!contact || typeof contact !== "string" || contact.trim().length < 3) {
      return NextResponse.json(
        { error: "Please enter a valid Telegram ID or phone number (min 3 characters)" },
        { status: 400 }
      );
    }
    const trimmedContact = contact.trim();

    // ۶. اعتبارسنجی نقش
    const validRoles = ["Founder", "Designer", "Developer", "Investor"];
    if (!role || typeof role !== "string" || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Please select a valid role" },
        { status: 400 }
      );
    }

    // ۷. ذخیره در Redis
    await Promise.all([
      saveContact(sanitizedEmail, trimmedContact, role),
      incrementEmailCount(),
      incrementRoleCount(role),
    ]);

    // ۸. ارسال پیام به تلگرام
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