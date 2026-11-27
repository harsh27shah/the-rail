import { InviteForm } from "@/components/InviteForm";
import { requireOwner } from "@/lib/auth";
import { listMembers, memberProgress } from "@/lib/invites";
import { friendProgressLine } from "@/lib/onboarding";
import { spendByUser } from "@/lib/usage";

export const metadata = { title: "Invite · The Rail" };

export default async function InvitePage() {
  const me = await requireOwner();
  const [members, spend] = await Promise.all([listMembers(), spendByUser()]);
  const progress = await memberProgress(members.map((m) => m.id));
  const byUser = new Map((spend ?? []).map((r) => [r.userId, r]));
  const unattributed = byUser.get(null);
  const monthTotal = (spend ?? []).reduce((n, r) => n + r.monthUsd, 0);
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="form-page">
      <h1>Invite a friend</h1>
      <p className="hint">
        Type the email of the Google account they&rsquo;ll sign in with, exactly as it appears on
        their account (a Gmail address with or without dots can matter). Then send them the site
        address. They tap &ldquo;Continue with Google&rdquo; and they&rsquo;re in. Only that
        email can get in.
      </p>
      <InviteForm />

      <h1 style={{ marginTop: 40, fontSize: 18 }}>Who has an account · {members.length}</h1>
      {spend === null ? (
        <p className="hint">
          Spend tracking isn&rsquo;t switched on yet: the database step in supabase/schema.sql (the
          &ldquo;ai_usage&rdquo; part) hasn&rsquo;t been run.
        </p>
      ) : (
        <p className="hint">
          AI spend is an <b>estimate</b> from list prices, so it won&rsquo;t match your Anthropic and
          Google bills to the cent. This month, everyone together: <b>{usd(monthTotal)}</b>.
        </p>
      )}
      <ul className="invite-list">
        {members.map((m) => {
          const s = byUser.get(m.id);
          return (
            <li key={m.id}>
              <span className="invite-email">
                {m.email}
                {m.email === me.email ? " (you)" : m.isOwner ? " (owner)" : ""}
              </span>
              <span className="invite-meta">
                {m.lastSignIn ? `Last in ${fmt(m.lastSignIn)}` : `Invited ${fmt(m.joined)} · not signed in yet`}
              </span>
              <span className="invite-progress">
                {friendProgressLine({
                  pieces: progress.get(m.id)?.pieces ?? 0,
                  seenOutfits: progress.get(m.id)?.seenOutfits ?? false,
                  signedIn: !!m.lastSignIn,
                })}
              </span>
              {spend !== null && (
                <span className="invite-spend">
                  {usd(s?.monthUsd ?? 0)} this month · {usd(s?.totalUsd ?? 0)} total · {s?.monthCalls ?? 0} AI calls
                </span>
              )}
            </li>
          );
        })}
        {unattributed && (
          <li>
            <span className="invite-email">Not tied to anyone</span>
            <span className="invite-meta">calls made with no signed-in person, such as scripts</span>
            <span className="invite-spend">
              {usd(unattributed.monthUsd)} this month · {usd(unattributed.totalUsd)} total · {unattributed.monthCalls} AI calls
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
