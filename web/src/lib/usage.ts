import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getSupabaseAdmin } from "./supabase";

/**
 * Per-person AI spend tracking (PROJECT.md §5 item 30).
 *
 * Every AI call in the app uses the owner's one Anthropic key and one Gemini key, so neither
 * provider can say who a call was for. Instead each call writes one row to `ai_usage` — who it
 * was for, what kind of call, how big it was, and an ESTIMATED cost — and the Invite page adds
 * the rows up per person.
 *
 * Who it was for travels in an AsyncLocalStorage "tag" set at the start of each Server Action
 * (`trackUsageFor`) so the AI functions don't each need a user id passed in. Work that outlives
 * the request (the after() tasks following an upload) re-applies the tag with `withUsageUser`.
 * An AI call with no tag is still recorded, just with no person attached, so spend is never
 * silently lost.
 *
 * Recording is best-effort: a logging failure must never fail an upload or an outfit.
 */

// ── Estimated prices, US dollars per million tokens ─────────────────────────────────────
// These are ESTIMATES from list prices, so the totals will not match the provider invoices
// exactly. Compare the Invite page's total with the real Anthropic and Google bills now and
// then, and adjust these numbers if they drift apart.
export const PRICES = {
  claude: { inputPerM: 3, outputPerM: 15 },
  gemini: {
    inputPerM: 0.3, // image + text going in
    imageOutputPerM: 30, // generated image tokens
    textOutputPerM: 2.5, // plain text answers (people detection)
  },
} as const;

export type UsageProvider = "claude" | "gemini";
export type UsageAction =
  | "read-photo"
  | "find-people"
  | "background-removal"
  | "duplicate-check"
  | "correction"
  | "correction-retag"
  | "outfits";

export interface UsageRow {
  userId: string | null;
  provider: UsageProvider;
  model: string;
  action: UsageAction;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Estimated dollars for one Claude call. Pure, so it can be tested. */
export function claudeCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICES.claude.inputPerM + outputTokens * PRICES.claude.outputPerM) / 1_000_000;
}

/** Estimated dollars for one Gemini call. `producedImage` picks the (much higher) image-output rate. */
export function geminiCost(inputTokens: number, outputTokens: number, producedImage: boolean): number {
  const out = producedImage ? PRICES.gemini.imageOutputPerM : PRICES.gemini.textOutputPerM;
  return (inputTokens * PRICES.gemini.inputPerM + outputTokens * out) / 1_000_000;
}

// ── who is this call for? ───────────────────────────────────────────────────────────────
const store = new AsyncLocalStorage<{ userId: string }>();

/** Call right after `await requireUser()` in a Server Action: everything this action does from here on is attributed to them.
 * It must come after that first await: called before any await, it would also tag whoever called the function. */
export function trackUsageFor(userId: string): void {
  store.enterWith({ userId });
}

/** Run `fn` with calls attributed to `userId` (used for background work that outlives the request). */
export function withUsageUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ userId }, fn);
}

export function currentUsageUser(): string | null {
  return store.getStore()?.userId ?? null;
}

// ── recording ───────────────────────────────────────────────────────────────────────────
export async function recordUsage(row: Omit<UsageRow, "userId"> & { userId?: string | null }): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    const { error } = await admin.from("ai_usage").insert({
      user_id: row.userId === undefined ? currentUsageUser() : row.userId,
      provider: row.provider,
      model: row.model,
      action: row.action,
      input_tokens: Math.max(0, Math.round(row.inputTokens)),
      output_tokens: Math.max(0, Math.round(row.outputTokens)),
      cost_usd: Number(row.costUsd.toFixed(6)),
    });
    if (error) console.error("[usage] couldn't record:", error.message);
  } catch (e) {
    console.error("[usage] couldn't record:", e);
  }
}

/** For any Anthropic `messages.create` reply. */
export function recordClaude(action: UsageAction, model: string, usage: { input_tokens: number; output_tokens: number }) {
  return recordUsage({
    provider: "claude",
    model,
    action,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUsd: claudeCost(usage.input_tokens, usage.output_tokens),
  });
}

/** For any Gemini `generateContent` reply. */
export function recordGemini(
  action: UsageAction,
  model: string,
  response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | null; candidates?: { content?: { parts?: { inlineData?: unknown }[] } }[] | null }
) {
  const input = response.usageMetadata?.promptTokenCount ?? 0;
  const output = response.usageMetadata?.candidatesTokenCount ?? 0;
  const producedImage = (response.candidates?.[0]?.content?.parts ?? []).some((p) => !!p.inlineData);
  return recordUsage({
    provider: "gemini",
    model,
    action,
    inputTokens: input,
    outputTokens: output,
    costUsd: geminiCost(input, output, producedImage),
  });
}

// ── reading it back (the Invite page) ───────────────────────────────────────────────────
export interface SpendRow {
  userId: string | null;
  monthUsd: number;
  totalUsd: number;
  monthCalls: number;
}

/** Spend per person: this calendar month (UTC, which is when the providers' own months roll over) and all time.
 * Returns null if the tracking table hasn't been created yet. */
export async function spendByUser(): Promise<SpendRow[] | null> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.rpc("ai_spend_by_user");
    if (error || !data) return null;
    return (data as { user_id: string | null; month_usd: number | string; total_usd: number | string; month_calls: number | string }[]).map((r) => ({
      userId: r.user_id,
      monthUsd: Number(r.month_usd),
      totalUsd: Number(r.total_usd),
      monthCalls: Number(r.month_calls),
    }));
  } catch {
    return null;
  }
}
