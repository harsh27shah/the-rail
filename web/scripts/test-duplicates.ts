// The duplicate finder's rules (lib/duplicates.ts): ranking, the cheap-then-careful cascade, and the thresholds.
// No database, no AI: the AI is a fake that returns scripted answers and counts how often it is asked.
//   npx tsx scripts/test-duplicates.ts

import {
  DUPLICATE_CONFIDENCE_THRESHOLD, DUPLICATE_SHORTLIST, DUPLICATE_SMALL_SIDE, DUPLICATE_UNSURE_BELOW,
  findTwin, shortlist, similarity, type LookSize, type PieceTags, type Verdict,
} from "@/lib/duplicates";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

const piece = (id: string, name: string, color: string, hex: string, extra: Partial<PieceTags> = {}): PieceTags & { id: string } =>
  ({ id, name, color, palette: [hex], pattern: "solid", material: "cotton", formality: 3, ...extra });

async function main() {
  check("the settings are what was tested (top 3, 0.6, 0.9, 640px)",
    DUPLICATE_SHORTLIST === 3 && DUPLICATE_CONFIDENCE_THRESHOLD === 0.6 && DUPLICATE_UNSURE_BELOW === 0.9 && DUPLICATE_SMALL_SIDE === 640);

  // ── ranking ──
  const target = piece("new", "Off-white pullover", "off-white", "#F2EEDC");
  const twin = piece("twin", "Cream fleece snap neck", "cream", "#F0ECD8"); // shares NO word with the new name or colour
  const noise = [
    piece("a", "Black zip hoodie", "black", "#111111"), piece("b", "Navy crewneck jumper", "navy", "#1B2A4A"),
    piece("c", "Olive overshirt", "olive", "#5A5E3A"), piece("d", "Cream trousers", "cream", "#E8E0C8"),
    piece("e", "White tee", "white", "#FFFFFF"), piece("f", "Grey sweatshirt", "grey", "#888888"),
    piece("g", "Cream cardigan", "cream", "#EFEAD2"), piece("h", "Burgundy knit", "burgundy", "#6B1F2A"),
  ];
  const sharedWord = (a: PieceTags, b: PieceTags) => [...a.name.toLowerCase().split(/\W+/), ...a.color.toLowerCase().split(/\W+/)].some((w) => w.length > 2 && [...b.name.toLowerCase().split(/\W+/), ...b.color.toLowerCase().split(/\W+/)].includes(w));
  check("(the old problem) the twin shares no word with the new piece, so the old word filter would have dropped it", !sharedWord(target, twin));
  const pool = [...noise, twin]; // the twin is the NEWEST: last in the list, beyond the old first-5 cut-off
  const top = shortlist(target, pool);
  check("ranking puts that twin first, by colour", top[0].id === "twin", top.map((p) => p.id).join());
  check("only the top 3 are returned", top.length === 3);
  check("fewer pieces than 3 returns what there is", shortlist(target, [twin]).length === 1 && shortlist(target, []).length === 0);
  check("a closer colour outranks a distant one with the same words",
    similarity(piece("x", "Cream shirt", "cream", "#F0ECD8"), piece("y", "Cream shirt", "cream", "#F0ECD8")) > similarity(piece("x", "Cream shirt", "cream", "#F0ECD8"), piece("z", "Cream shirt", "cream", "#222222")));
  check("matching pattern and material add to the score",
    similarity(piece("x", "Shirt", "red", "#aa0000", { pattern: "striped", material: "linen" }), piece("y", "Shirt", "red", "#aa0000", { pattern: "striped", material: "linen" })) >
      similarity(piece("x", "Shirt", "red", "#aa0000", { pattern: "striped", material: "linen" }), piece("y", "Shirt", "red", "#aa0000", { pattern: "solid", material: "wool" })));
  check("equal scores keep the given order (stable)", shortlist(piece("n", "Tee", "grey", "#888888"), [piece("p1", "Tee", "grey", "#888888"), piece("p2", "Tee", "grey", "#888888"), piece("p3", "Tee", "grey", "#888888"), piece("p4", "Tee", "grey", "#888888")]).map((p) => p.id).join() === "p1,p2,p3");
  check("a missing or malformed palette doesn't throw and just ranks lower",
    (() => { const r = shortlist(target, [{ ...twin, id: "nopal", palette: [] }, { ...twin, id: "bad", palette: ["not-a-colour"] }, piece("ok", "Cream fleece", "cream", "#F0ECD8")]); return r[0].id === "ok" && r.length === 3; })());

  // ── the cascade ──
  const calls: string[] = [];
  const script = (answers: Record<string, Partial<Record<LookSize, Verdict | "throw">>>) => async (c: { id: string }, size: LookSize): Promise<Verdict> => {
    calls.push(`${c.id}:${size}`);
    const a = answers[c.id]?.[size];
    if (a === "throw") throw new Error("down");
    if (!a) throw new Error(`unscripted ${c.id}:${size}`);
    return a;
  };
  const same = (confidence: number): Verdict => ({ verdict: "same", confidence, why: "same garment" });
  const diff = (confidence: number): Verdict => ({ verdict: "different", confidence, why: "different cut" });
  const ids = (...x: string[]) => x.map((id) => ({ id }));
  const reset = () => { calls.length = 0; };

  reset();
  let r = await findTwin(ids("a", "b", "c"), script({ a: { small: same(0.97) } }));
  check("a confident cheap 'same' stops at once: one call, no careful look, later pieces never looked at", r?.match.id === "a" && r.look === "small" && calls.join() === "a:small", calls.join());

  reset();
  r = await findTwin(ids("a", "b", "c"), script({ a: { small: diff(0.98) }, b: { small: diff(0.95) }, c: { small: diff(0.9) } }));
  check("confident 'different' answers (0.9 and up) cost three cheap looks and no careful ones", r === null && calls.join() === "a:small,b:small,c:small", calls.join());

  reset();
  r = await findTwin(ids("a", "b"), script({ a: { small: diff(0.68), full: same(0.97) } }));
  check("an unsure cheap 'different' (0.68) gets a careful look, which can find the twin", r?.match.id === "a" && r.look === "full" && calls.join() === "a:small,a:full", calls.join());

  reset();
  r = await findTwin(ids("a"), script({ a: { small: diff(0.89), full: diff(0.9) } }));
  check("just under 0.9 is unsure (careful look); the careful look can also say different", r === null && calls.join() === "a:small,a:full");
  reset();
  await findTwin(ids("a"), script({ a: { small: diff(0.9) } }));
  check("exactly 0.9 is confident (no careful look)", calls.join() === "a:small");

  reset();
  r = await findTwin(ids("a"), script({ a: { small: same(0.6) } }));
  check("'same' at exactly 0.6 is flagged", r?.match.id === "a");
  reset();
  r = await findTwin(ids("a", "b"), script({ a: { small: same(0.59) }, b: { small: diff(0.99) } }));
  check("'same' at 0.59 is not flagged, and (as tested) not escalated either", r === null && calls.join() === "a:small,b:small", calls.join());

  reset();
  r = await findTwin(ids("a", "b"), script({ a: { small: "throw", full: same(0.95) } }));
  check("a cheap look that fails counts as unsure and gets the careful look", r?.match.id === "a" && r.look === "full" && calls.join() === "a:small,a:full", calls.join());
  reset();
  r = await findTwin(ids("a", "b"), script({ a: { small: "throw", full: "throw" }, b: { small: same(0.9) } }));
  check("when both looks fail on one piece the next piece is still tried", r?.match.id === "b" && calls.join() === "a:small,a:full,b:small", calls.join());

  reset();
  r = await findTwin(ids("a", "b", "c"), script({ a: { small: diff(0.7), full: diff(0.95) }, b: { small: diff(0.99) }, c: { small: same(0.92) } }));
  check("it keeps going down the shortlist and flags the first piece judged the same", r?.match.id === "c" && calls.join() === "a:small,a:full,b:small,c:small", calls.join());

  reset();
  const log: string[] = [];
  await findTwin(ids("a", "b"), script({ a: { small: diff(0.5), full: diff(0.95) }, b: { small: "throw", full: same(0.9) } }), (c, size, v) => log.push(`${c.id}:${size}:${v ? "ok" : "failed"}`));
  check("the logging hook hears about every look, including failures", log.join() === "a:small:ok,a:full:ok,b:small:failed,b:full:ok", log.join());

  check("no candidates: nothing to do, no calls", (reset(), await findTwin([], script({}))) === null && calls.length === 0);

  // ── cost, in calls: the point of the change ──
  // The old way looked at up to 5 pieces with a full-size 4-photo comparison each. For a new piece with no twin:
  reset();
  await findTwin(ids("a", "b", "c"), script({ a: { small: diff(0.98) }, b: { small: diff(0.97) }, c: { small: diff(0.99) } }));
  check("a typical upload with no twin makes 3 cheap comparisons (the old way: 5 full-size ones)", calls.length === 3 && calls.every((c) => c.endsWith(":small")));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
