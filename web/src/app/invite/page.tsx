import { InviteForm } from "@/components/InviteForm";
import { requireOwner } from "@/lib/auth";
import { listMembers } from "@/lib/invites";

export const metadata = { title: "Invite · The Rail" };

export default async function InvitePage() {
  const me = await requireOwner();
  const members = await listMembers();
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
      <ul className="invite-list">
        {members.map((m) => (
          <li key={m.email}>
            <span className="invite-email">{m.email}{m.email === me.email ? " (you)" : m.isOwner ? " (owner)" : ""}</span>
            <span className="invite-meta">
              {m.lastSignIn ? `Last in ${fmt(m.lastSignIn)}` : `Invited ${fmt(m.joined)} · not signed in yet`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
