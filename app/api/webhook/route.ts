// app/api/webhook/route.ts
import { Bot, webhookCallback } from "grammy";
import { redis } from "@/lib/redis";



const BOT_TOKEN = process.env.BOT_TOKEN2!;
const ADMIN_ID = parseInt(process.env.ADMIN_ID!);

const bot = new Bot(BOT_TOKEN);


const SESSION_KEY = (userId: number) => `bot:session:${userId}`;
const TICKET_KEY = (userId: number) => `bot:ticket:${userId}`;
const TICKET_HISTORY_KEY = (userId: number) => `bot:ticket_history:${userId}`;



interface Session {
  waitingForAdmin: boolean;
  ticketId?: string;
}

async function getSession(userId: number): Promise<Session> {
  const data = await redis.get<Session>(SESSION_KEY(userId));
  return data || { waitingForAdmin: false };
}

async function setSession(userId: number, session: Session) {
  await redis.set(SESSION_KEY(userId), session);
  await redis.expire(SESSION_KEY(userId), 7 * 24 * 60 * 60);
}

async function clearSession(userId: number) {
  await redis.del(SESSION_KEY(userId));
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
  await redis.set(TICKET_KEY(userId), ticketData);
  await redis.expire(TICKET_KEY(userId), 7 * 24 * 60 * 60);
  return ticketId;
}

async function getTicket(userId: number) {
  return await redis.get(TICKET_KEY(userId));
}

async function closeTicket(userId: number) {
  const ticket = await redis.get(TICKET_KEY(userId));
  if (ticket) {
    await redis.lpush(TICKET_HISTORY_KEY(userId), JSON.stringify(ticket));
    await redis.ltrim(TICKET_HISTORY_KEY(userId), 0, 99);
  }
  await redis.del(TICKET_KEY(userId));
}

async function saveMessage(userId: number, text: string, isFromAdmin: boolean = false) {
  const key = `bot:messages:${userId}`;
  const entry = JSON.stringify({
    text,
    isFromAdmin,
    timestamp: new Date().toISOString(),
  });
  await redis.lpush(key, entry);
  await redis.ltrim(key, 0, 199);
  await redis.expire(key, 7 * 24 * 60 * 60);
}


// --- /start ---
bot.command("start", async (ctx) => {
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
});

// --- /support ---
bot.command("support", async (ctx) => {
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
});

// --- /status ---
bot.command("status", async (ctx) => {
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
});

// --- /close (کاربر) ---
bot.command("close", async (ctx) => {
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
});

// --- دریافت پیام‌های متنی ---
bot.on("message:text", async (ctx) => {
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
});

bot.command("reply", async (ctx) => {
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

  try {
    await bot.api.sendMessage(
      targetUserId,
      `📨 پاسخ پشتیبان:\n━━━━━━━━━━━━━━━━\n${replyText}\n━━━━━━━━━━━━━━━━\n\n` +
      `برای پاسخ بیشتر، پیام خود را ارسال کنید.`
    );

    await saveMessage(targetUserId, replyText, true);
    await ctx.reply(`✅ پاسخ به کاربر ${targetUserId} ارسال شد.`);
  } catch (error) {
    console.error("Error sending reply:", error);
    await ctx.reply(
      `❌ ارسال پیام به کاربر ${targetUserId} ناموفق بود.\n` +
      `مطمئن شوید که کاربر ربات را استارت کرده باشد.`
    );
  }
});

bot.command("tickets", async (ctx) => {
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
});

bot.command("close", async (ctx) => {
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
  }
});

bot.command("admin", async (ctx) => {
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
});


export const POST = webhookCallback(bot, "std/http");


export async function GET() {
  return new Response("🤖 ربات پشتیبانی فعال است!", { status: 200 });
}