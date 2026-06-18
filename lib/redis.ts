import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export async function incrementEmailCount() {
  return await redis.incr("email_count");
}

export async function getEmailCount(): Promise<number> {
  const count = await redis.get<number>("email_count");
  return count || 0;
}

export async function incrementRoleCount(role: string) {
  return await redis.hincrby("role_counts", role, 1);
}

export async function getRoleStats(): Promise<Record<string, number>> {
  return (await redis.hgetall<Record<string, number>>("role_counts")) || {};
}

export async function saveEmail(email: string, role: string) {
  const timestamp = Date.now();
  const entry = JSON.stringify({ email, role, timestamp });
  await redis.lpush("emails", entry);
  await redis.ltrim("emails", 0, 999);
}

export async function getEmails(limit: number = 100): Promise<any[]> {
  const items = await redis.lrange("emails", 0, limit - 1);
  return items.map((item) => JSON.parse(item));
}