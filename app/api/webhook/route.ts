// app/api/webhook/route.ts
import { NextRequest } from "next/server";
import { Bot } from "grammy";
import { redis } from "@/lib/redis";

// ============================================
//  مقداردهی اولیه با لاگ
// ============================================
console.log("🚀 ربات در حال بارگذاری...");

const BOT_TOKEN = process.env.BOT_TOKEN2;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN2 در محیط تعریف نشده!");
  throw new Error("BOT_TOKEN2 is required");
}

const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0");
if (!ADMIN_ID) {
  console.error("❌ ADMIN_ID در محیط تعریف نشده!");
  throw new Error("ADMIN_ID is required");
}

console.log("✅ توکن (BOT_TOKEN2) و ادمین تنظیم شدند");

const bot = new Bot(BOT_TOKEN);

// ============================================
//  کلیدهای Redis
// ============================================
const SESSION_KEY = (userId: number) => `bot:session:${userId}`;
const TICKET_KEY = (userId: number) => `bot:ticket:${userId}`;
const TICKET_HISTORY_KEY = (userId: number) => `bot:ticket_history:${userId}`;

// ============================================
//  توابع کمکی با مدیریت خطا
// ============================================
interface Session {
  waitingForAdmin: boolean;
  ticketId?: string;
}

async function getSession(userId: number): Promise<Session> {
  try {
    const data = await redis.get<Session>(SESSION_KEY(userId));
    return data || { waitingForAdmin: false };
  } catch (error) {
    console.error("❌ خطا در getSession:", error);
    return { waitingForAdmin: false };
  }
}

async function setSession(userId: number, session: Session) {
  try {
    await redis.set(SESSION_KEY(userId), session);
    await redis.expire(SESSION_KEY(userId), 7 * 24 * 60 * 60);
  } catch (error) {
    console.error("❌ خطا در setSession:", error);
  }
}

async function clearSession(userId: number) {
  try {
    await redis.del(SESSION_KEY(userId));
  } catch (error) {
    console.error("❌ خطا در clearSession:", error);
  }
}

async function createTicket(userId: number, username?: string): Promise<string> {
  const ticketId = `ticket_${Date.now()}_${userId}`;
  const ticketData = {
    ticketId,
    userId,
    username: username || "unknown",
    status: "open",
    createdAt: new Date().toISOString(),
  };
  try {
    await redis.set(TICKET_KEY(userId), ticketData);
    await redis.expire(TICKET_KEY(userId), 7 * 24 * 60 * 60);
  } catch (error) {
    console.error("❌ خطا در createTicket:", error);
  }
  return ticketId;
}

async function getTicket(userId: number) {
  try {
    return await redis.get(TICKET_KEY(userId));
  } catch (error) {
    console.error("❌ خطا در getTicket:", error);
    return null;
  }
}

async function closeTicket(userId: number) {
  try {
    const ticket = await redis.get(TICKET_KEY(userId));
    if (ticket) {
      await redis.lpush(TICKET_HISTORY_KEY(userId), JSON.stringify(ticket));
      await redis.ltrim(TICKET_HISTORY_KEY(userId), 0, 99);
    }
    await redis.del(TICKET_KEY(userId));
  } catch (error) {
    console.error("❌ خطا در closeTicket:", error);
  }
}

async function saveMessage(userId: number, text: string, isFromAdmin: boolean = false) {
  const key = `bot:messages:${userId}`;
  const entry = JSON.stringify({
    text,
    isFromAdmin,
    timestamp: new Date().toISOString(),
  });
  try {
    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, 199);
    await redis.expire(key, 7 * 24 * 60 * 60);
  } catch (error) {
    console.error("❌ خطا در saveMessage:", error);
  }
}

// ============================================
//  هندلر خطا و میدلور
// ============================================
bot.catch((error) => {
  console.error("❌ خطای سراسری ربات:", error);
});

bot.use(async (ctx, next) => {
  console.log(`📩 درخواست از ${ctx.from?.id}:`, ctx.message?.text || "غیرمتنی");
  await next();
});

// ============================================
//  دستورات
// ============================================

bot.command("start", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    await setSession(userId, { waitingForAdmin: false });
    await ctx.reply(
      "👋 به ربات پشتیبانی خوش اومدی!\n\n" +
      "📌 دستورات:\n" +
      "/support - ارتباط با پشتیبان\n" +
      "/status - وضعیت تیکت خود را ببین\n" +
      "/close - بستن تیکت (فقط کاربر)"
    );
    console.log(`✅ /start از ${userId}`);
  } catch (error) {
    console.error("❌ خطا در /start:", error);
  }
});

bot.command("support", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    if (!userId) return;

    const existingTicket = await getTicket(userId);
    if (existingTicket) {
      await ctx.reply("⏳ شما قبلاً یک تیکت باز دارید. لطفاً منتظر پاسخ باشید.");
      return;
    }

    await createTicket(userId, username);
    await setSession(userId, { waitingForAdmin: true });

    await ctx.reply(
      "✅ درخواست شما ثبت شد.\n" +
      "لطفاً پیام خود را ارسال کنید تا به پشتیبان منتقل شود.\n\n" +
      "برای بستن تیکت از /close استفاده کنید."
    );

    const userDisplay = username ? `@${username}` : `User ID: ${userId}`;
    await bot.api.sendMessage(
      ADMIN_ID,
      `🆕 درخواست پشتیبانی جدید از ${userDisplay}\n` +
      `User ID: ${userId}\n` +
      `برای پاسخ از دستور /reply ${userId} [متن] استفاده کنید.`
    );
    console.log(`✅ /support از ${userId}`);
  } catch (error) {
    console.error("❌ خطا در /support:", error);
  }
});

bot.command("status", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const ticket = await getTicket(userId);
    if (ticket) {
      await ctx.reply(
        `📋 وضعیت تیکت شما:\n` +
        `✅ باز (در انتظار پاسخ)\n` +
        `🆔 شناسه: ${(ticket as any).ticketId}`
      );
    } else {
      const history = await redis.lrange(TICKET_HISTORY_KEY(userId), 0, 4);
      if (history.length > 0) {
        await ctx.reply(
          `📋 شما ${history.length} تیکت بسته شده دارید.\n` +
          `برای شروع یک تیکت جدید از /support استفاده کنید.`
        );
      } else {
        await ctx.reply("📭 شما هیچ تیکت فعالی ندارید. از /support برای شروع استفاده کنید.");
      }
    }
  } catch (error) {
    console.error("❌ خطا در /status:", error);
  }
});

bot.command("close", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const ticket = await getTicket(userId);
    if (!ticket) {
      await ctx.reply("❌ شما هیچ تیکت فعالی ندارید.");
      return;
    }

    await closeTicket(userId);
    await clearSession(userId);
    await ctx.reply("✅ تیکت شما با موفقیت بسته شد.\nاز /support برای باز کردن تیکت جدید استفاده کنید.");
  } catch (error) {
    console.error("❌ خطا در /close (کاربر):", error);
  }
});

bot.on("message:text", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    await saveMessage(userId, ctx.message.text, false);

    const session = await getSession(userId);
    if (session.waitingForAdmin) {
      const ticket = await getTicket(userId);
      if (!ticket) {
        await ctx.reply("❌ تیکت شما وجود ندارد. لطفاً با /support شروع کنید.");
        return;
      }

      await bot.api.sendMessage(
        ADMIN_ID,
        `📩 پیام از کاربر ${userId}:\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `${ctx.message.text}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `برای پاسخ: /reply ${userId} [متن]`
      );

      await ctx.reply("✅ پیام شما به پشتیبان ارسال شد.");
    } else {
      await ctx.reply(
        "📌 برای شروع پشتیبانی، دستور /support رو ارسال کن.\n" +
        "وضعیت تیکت: /status"
      );
    }
  } catch (error) {
    console.error("❌ خطا در message handler:", error);
  }
});

bot.command("reply", async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) {
      await ctx.reply("⛔ شما دسترسی به این دستور ندارید.");
      return;
    }

    const parts = ctx.message?.text?.split(" ");
    if (!parts || parts.length < 3) {
      await ctx.reply(
        "⚠️ فرمت صحیح:\n" +
        `/reply [userId] [متن پاسخ]\n\n` +
        `مثال: /reply 123456789 سلام چطور میتونم کمک کنم؟`
      );
      return;
    }

    const targetUserId = parseInt(parts[1]);
    if (isNaN(targetUserId)) {
      await ctx.reply("❌ User ID باید یک عدد باشد.");
      return;
    }

    const replyText = parts.slice(2).join(" ");
    if (!replyText.trim()) {
      await ctx.reply("❌ متن پاسخ نمی‌تواند خالی باشد.");
      return;
    }

    await bot.api.sendMessage(
      targetUserId,
      `📨 پاسخ پشتیبان:\n━━━━━━━━━━━━━━━━\n${replyText}\n━━━━━━━━━━━━━━━━\n\n` +
      `برای پاسخ بیشتر، پیام خود را ارسال کنید.`
    );

    await saveMessage(targetUserId, replyText, true);
    await ctx.reply(`✅ پاسخ به کاربر ${targetUserId} ارسال شد.`);
  } catch (error) {
    console.error("❌ خطا در /reply:", error);
    await ctx.reply("❌ خطا در ارسال پاسخ.");
  }
});

bot.command("tickets", async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) {
      await ctx.reply("⛔ شما دسترسی ندارید.");
      return;
    }

    const tickets = await redis.keys("bot:ticket:*");
    if (tickets.length === 0) {
      await ctx.reply("📭 هیچ تیکت باز وجود ندارد.");
      return;
    }

    let message = `📋 لیست تیکت‌های باز (${tickets.length}):\n━━━━━━━━━━━━━━━━\n`;
    for (const key of tickets) {
      const ticket = await redis.get(key);
      if (ticket) {
        const data = ticket as any;
        message += `🆔 User: ${data.userId} (${data.username || "unknown"})\n`;
        message += `   📅 ${data.createdAt}\n`;
      }
    }
    message += `━━━━━━━━━━━━━━━━\nبرای پاسخ: /reply [userId] [متن]`;

    await ctx.reply(message);
  } catch (error) {
    console.error("❌ خطا در /tickets:", error);
  }
});

bot.command("close", async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) {
      await ctx.reply("⛔ شما دسترسی ندارید.");
      return;
    }

    const parts = ctx.message?.text?.split(" ");
    if (!parts || parts.length < 2) {
      await ctx.reply("⚠️ از دستور /close [userId] استفاده کنید.");
      return;
    }

    const userId = parseInt(parts[1]);
    if (isNaN(userId)) {
      await ctx.reply("❌ User ID باید یک عدد باشد.");
      return;
    }

    const ticket = await getTicket(userId);
    if (!ticket) {
      await ctx.reply(`❌ کاربر ${userId} تیکت فعالی ندارد.`);
      return;
    }

    await closeTicket(userId);
    await clearSession(userId);
    await ctx.reply(`✅ تیکت کاربر ${userId} بسته شد.`);

    try {
      await bot.api.sendMessage(
        userId,
        "🔒 تیکت شما توسط پشتیبان بسته شد.\n" +
        "برای شروع مجدد از /support استفاده کنید."
      );
    } catch (error) {
      console.log(`⚠️ ارسال پیام به ${userId} ناموفق بود`);
    }
  } catch (error) {
    console.error("❌ خطا در /close (ادمین):", error);
  }
});

bot.command("admin", async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) {
      await ctx.reply("⛔ شما دسترسی ندارید.");
      return;
    }

    await ctx.reply(
      "👨‍💼 **راهنمای ادمین**\n\n" +
      "📌 دستورات:\n" +
      "/reply [userId] [متن] - پاسخ به کاربر\n" +
      "/close [userId] - بستن تیکت کاربر\n" +
      "/tickets - لیست تیکت‌های باز\n" +
      "/admin - این پیام راهنما"
    );
  } catch (error) {
    console.error("❌ خطا در /admin:", error);
  }
});

// ============================================
//  هندلر POST با handleUpdate (به جای webhookCallback)
// ============================================
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log("📥 درخواست POST جدید دریافت شد");

  try {
    const body = await req.json();
    console.log(`📦 update_id: ${body.update_id}`);

    await bot.handleUpdate(body);

    const duration = Date.now() - startTime;
    console.log(`✅ پردازش موفق در ${duration}ms`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ خطا بعد از ${duration}ms:`, error);
    return new Response(
      JSON.stringify({
        error: String(error),
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ============================================
//  هندلر GET برای تست
// ============================================
export async function GET() {
  console.log("📡 درخواست GET برای تست");
  return new Response(
    `🤖 ربات پشتیبانی فعال است!\n\n` +
    `✅ BOT_TOKEN2: ${process.env.BOT_TOKEN2 ? "تنظیم شده" : "تنظیم نشده"}\n` +
    `✅ ADMIN_ID: ${ADMIN_ID ? "تنظیم شده" : "تنظیم نشده"}\n` +
    `✅ Redis: ${redis ? "اتصال برقرار" : "اتصال برقرار نشده"}`,
    { status: 200 }
  );
}