import type { ReactNode } from "react";

/**
 * The page a signed-out visitor sees first (src/app/login/page.tsx): what The Rail is, what
 * already works, what doesn't yet, and the sign-in button. Meant to be enough on its own for
 * someone who has never heard of the app to decide whether to sign in.
 *
 * Everything shown is real: the product photos are pieces from the owner's own wardrobe (clean
 * catalogue shots, so no people appear), the tag card is one real piece's catalogued details, and
 * the outfits are real output of the recommended-outfits feature for that piece. The "planned"
 * list is labelled as not built — keep it honest when features ship or change.
 */

const img = (slug: string) => `/landing/${slug}.webp`;

function Tile({ slug, label, hero = false }: { slug: string; label: string; hero?: boolean }) {
  return (
    <div className={hero ? "landing-tile hero" : "landing-tile"}>
      <img src={img(slug)} alt={label} width={240} height={320} loading="lazy" />
    </div>
  );
}

const OUTFITS: { tiles: { slug: string; label: string; hero?: boolean }[]; why: string }[] = [
  {
    tiles: [
      { slug: "navy-crewneck-jumper", label: "Navy crewneck jumper", hero: true },
      { slug: "dark-wash-jeans", label: "Dark wash jeans" },
      { slug: "brown-leather-sneakers", label: "Brown leather sneakers" },
    ],
    why: "Dark denim and brown leather sneakers keep the navy jumper relaxed yet polished for everyday wear.",
  },
  {
    tiles: [
      { slug: "brown-suede-jacket", label: "Brown suede jacket" },
      { slug: "navy-crewneck-jumper", label: "Navy crewneck jumper", hero: true },
      { slug: "khaki-wide-leg-trousers", label: "Khaki wide-leg trousers" },
      { slug: "white-stan-smith", label: "White Stan Smith trainers" },
    ],
    why: "Khaki trousers and a brown suede jacket add warm tones and texture that lift the navy knit for a date or dinner.",
  },
  {
    tiles: [
      { slug: "navy-crewneck-jumper", label: "Navy crewneck jumper", hero: true },
      { slug: "black-trousers", label: "Black straight-leg trousers" },
      { slug: "white-sneakers", label: "White sneakers" },
    ],
    why: "Black trousers and clean white trainers give a sharp, minimal smart casual look that works well for the office.",
  },
];

export function Landing({ signIn, signInAgain }: { signIn: ReactNode; signInAgain: ReactNode }) {
  return (
    <div className="landing">
      {/* ── hero ── */}
      <section className="landing-hero">
        <div>
          <p className="landing-eyebrow">The Rail</p>
          <h1>An AI fashion assistant that helps you find your style.</h1>
          <p className="landing-lede">
            Less deciding what to wear every day, and smarter choices about what to buy. It starts with
            the clothes you already own.
          </p>
          <div className="landing-signin">{signIn}</div>
        </div>
        <div className="landing-collage" aria-hidden="true">
          <Tile slug="white-linen-shirt" label="" />
          <Tile slug="light-blue-jeans" label="" />
          <Tile slug="brown-suede-jacket" label="" />
          <Tile slug="olive-cargo" label="" />
          <Tile slug="cream-gum-trainers" label="" />
          <Tile slug="black-shirt" label="" />
        </div>
      </section>

      {/* ── what it's for ── */}
      <section className="landing-section">
        <p className="landing-eyebrow">What it&rsquo;s for</p>
        <h2>Two things it takes off your plate</h2>
        <div className="landing-cols">
          <div>
            <h3>Decision fatigue</h3>
            <p className="landing-muted">
              &ldquo;What do I wear?&rdquo; is a small decision you make every day, and it adds up. The Rail
              puts your whole wardrobe in front of you and shows what goes with what, so the decision is
              mostly made.
            </p>
          </div>
          <div>
            <h3>
              Shopping <span className="landing-soon">Coming</span>
            </h3>
            <p className="landing-muted">
              Once it knows what you own and what you like, it can tell you what&rsquo;s missing, so you buy
              the piece that unlocks new outfits instead of another one you already have.
            </p>
          </div>
        </div>
      </section>

      {/* ── how it works ── */}
      <section className="landing-section">
        <p className="landing-eyebrow">How it works</p>
        <h2>Photos in. A wardrobe out.</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <span className="landing-num">01</span>
            <h3>Add photos from your phone</h3>
            <p>
              Pick as many as you like. A mirror selfie works: one photo can give you a top, trousers and
              shoes. If someone else is in the shot, it asks which one is you.
            </p>
            <div className="landing-mini">
              <Tile slug="white-linen-shirt" label="White linen shirt" />
              <Tile slug="light-blue-jeans" label="Light blue jeans" />
              <Tile slug="cream-gum-trainers" label="Cream gum-sole trainers" />
            </div>
            <span className="landing-cap">One photo, three pieces</span>
          </div>

          <div className="landing-step">
            <span className="landing-num">02</span>
            <h3>Every piece is read and tagged</h3>
            <p>
              Each item is redrawn as a clean catalogue photo and tagged with its colour, material and how
              dressy it is. If it gets something wrong, you fix it.
            </p>
            <div className="landing-tagcard">
              <div className="landing-tile">
                <img src={img("navy-crewneck-jumper")} alt="Navy crewneck jumper" width={240} height={320} loading="lazy" />
              </div>
              <div className="landing-tags">
                <strong>Navy Crewneck Jumper</strong>
                <span>Tops · navy</span>
                <span>Wool knit · textured</span>
                <span>
                  Formality <i className="dots">●●○○○</i>
                </span>
                <span>Autumn · winter · spring</span>
              </div>
            </div>
          </div>

          <div className="landing-step">
            <span className="landing-num">03</span>
            <h3>See what goes with it</h3>
            <p>
              Open any piece and get whole outfits built from what you own, each with a one-line reason.
              Below, real outfits for that jumper.
            </p>
            <p className="landing-aside">From about 5 tops and 5 bottoms, it has enough to work with.</p>
          </div>
        </div>
      </section>

      {/* ── the money shot ── */}
      <section className="landing-section">
        <p className="landing-eyebrow">Outfits from your own wardrobe</p>
        <h2>Outfits for: Navy Crewneck Jumper</h2>
        <div className="landing-outfits">
          {OUTFITS.map((o, i) => (
            <div className="landing-outfit" key={i}>
              <div className="landing-outfit-row">
                {o.tiles.map((t, j) => (
                  <Tile key={j} slug={t.slug} label={t.label} hero={t.hero} />
                ))}
              </div>
              <p>
                <span className="landing-num">{String(i + 1).padStart(2, "0")}</span> {o.why}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── built / planned ── */}
      <section className="landing-section">
        <p className="landing-eyebrow">Where it is today</p>
        <h2>What works, and what&rsquo;s next</h2>
        <div className="landing-cols">
          <div>
            <h3 className="landing-label">Working today</h3>
            <ul className="landing-list">
              <li>
                <strong>Easy wardrobe ingestion.</strong> Add many photos at once from your phone. Each piece is
                cut out, tagged and hung on your rail.
              </li>
              <li>
                <strong>Recommended outfits.</strong> Open any piece for whole outfits built from what you
                own, each with a one-line reason.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="landing-label">Coming next, not built yet</h3>
            <ul className="landing-list planned">
              <li>
                <strong>Outfits that learn your taste.</strong> Better suggestions, shaped by what you accept
                and what you skip.
              </li>
              <li>
                <strong>Trip planning.</strong> Say where you&rsquo;re going and when, and get a packing list
                made from your wardrobe.
              </li>
              <li>
                <strong>Style inspiration.</strong> Show it looks you love, and it works out your style.
              </li>
              <li>
                <strong>Photorealistic avatars.</strong> See an outfit on a lifelike version of you before
                you wear it.
              </li>
              <li>
                <strong>Smarter shopping.</strong> Know what to buy next, matched to your style and what you
                already own.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── privacy ── */}
      <section className="landing-section">
        <p className="landing-eyebrow">Your wardrobe, your account</p>
        <h2>What happens to your photos</h2>
        <div className="landing-facts">
          <div>
            <h3>Only you can see it</h3>
            <p>Every person has their own account. Nobody else on The Rail can open your wardrobe in the app.</p>
          </div>
          <div>
            <h3>AI reads your photos</h3>
            <p>
              Each photo is sent to Anthropic (Claude) and Google (Gemini) so it can be tagged and tidied.
              The Rail uses them for nothing else.
            </p>
          </div>
          <div>
            <h3>Other people aren&rsquo;t kept</h3>
            <p>
              If a photo has more than one person, you choose which one is you. Only that part of the photo
              is kept.
            </p>
          </div>
        </div>
      </section>

      {/* ── closing ── */}
      <section className="landing-section landing-close">
        <h2>Start with ten pieces.</h2>
        <p className="landing-lede">
          Add about ten from your phone and your first outfits appear. Invite-only for now: sign in with
          the Google account you were invited with.
        </p>
        <div className="landing-signin">{signInAgain}</div>
      </section>
    </div>
  );
}
