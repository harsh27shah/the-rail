# The Rail — laundry list

Small and not-yet-urgent things noticed along the way, parked so they don't get lost.
Not a roadmap (that's PROJECT.md §2 and the PRD). Tick things off as they're done; add
new ones at the bottom of the right section. Last updated 2026-11-27 (roadmap use cases added;
earlier: 2026-11-17, PRD "MVP laundry list" tab merged in).

Each line: what it is → why it's parked / what triggers doing it.

---

## Do soon (real user-facing breakage, waiting on a go-ahead)

- [ ] **First-run onboarding: all four steps are built (PROJECT.md §5 item 32); steps 3 and 4 are built
  locally and awaiting an upload.** Goal is 12 pieces (5 tops, 5 bottoms, 2 outerwear), shoes a bonus;
  "ready" is at 5 tops + 5 bottoms (10), decided 2026-11-27. What's left:
  - The item page's own outfits text says "It takes a few seconds", but the first outfits can take up to
    about half a minute; reword it to match.
  - Parked, not part of onboarding: a "what's your style?" quiz (fits the "find your style" headline,
    but it's a separate feature).
- [x] ~~**Duplicate checking is the biggest AI cost per piece: look at trimming it**~~ **Built and checked locally
  2026-11-27, awaiting an upload** (PROJECT.md §5 item 38). A new piece with no twin now costs about 2.4 cents
  to check (was about 9), and more real twins are found (11 of 12 in the test, was 9 of 12). Still open from it:
  `scripts/backfill-duplicates.mjs` still uses the old method (update it before the next run), and pieces from the
  same bulk upload that haven't finished cleaning are still skipped as candidates (see the item below).
- [x] **Large photos fail on the deployed site.** **Fixed and confirmed live:** the Fuji photo that
  failed now uploads fine (PROJECT.md §5 item 28). A Fuji camera photo (DSCF2147.JPG) failed
  with "An unexpected response was received from the server", most likely Vercel's ~4.5 MB limit
  on request bodies (not confirmed on the live site). Photos now go from the browser straight to
  temporary private storage and the server reads them from there; a second, hidden limit
  (Claude refuses any image over ~5 MB) is handled by sending the AI a shrunk copy. After it
  goes live: re-try the Fuji photo to confirm. (Done: it worked.)
- [x] **Time limit (`maxDuration`) on photo processing.** Turned out to be set already: the Add
  page has 60 seconds (and the item page now does too). Nothing to do unless photos start timing
  out.
- [ ] **Re-test the Painted Ladies photo on the deployed site.** Re-import it, tap yourself in the
  picker, and confirm you get the sweater, jeans and sneakers (verified locally from the
  stored original, not yet through the live upload). Delete any leftover sweater-only
  "Untitled" item first.

- [ ] **Google Photos import: improve it properly once the app is published (PARKED, owner's call
  2026-11-25).** Held off on purpose: it may be a smaller use case than assumed until the app is
  published, after which it can be targeted more scalably. What was learned, so it isn't redone:
  - **The weekly reconnect.** Google's docs confirm apps in "Testing" get permissions that expire
    after 7 days (an exception covers apps using only name, email and profile, which is why plain
    Google sign-in is unaffected). The app recovers by sending the person back through Google
    (PROJECT.md §5 item 26). The fix is publishing the app out of Testing.
  - **Friends can't use the import yet.** Checked in Google Cloud on 2026-11-25: publishing status
    "Testing", user type External, one test user (the owner). In Testing only listed test users can
    authorise, up to 100, so the import fails for any friend (and for the owner's second account)
    unless their email is added as a test user. Plain Google sign-in works for everyone, because it
    only uses the basic permissions.
  - **What publishing would cost is not yet known.** Google's docs don't label the Photos picker
    permission sensitive or restricted, but say apps using the Photos APIs must pass OAuth
    verification. If it counts as sensitive: friends see an "unverified app" warning, a lifetime cap
    of 100 users applies, and full verification needs a privacy policy URL and a verified domain
    (the app is on a `vercel.app` address, which may need checking). The console only shows the
    category once the permission is added under Data access (a reversible setting, not done).
    Publishing also needs an app name (blank today) on the Branding page; privacy policy, home page
    and domain are blank too.
  - **Opening the Google Photos app on iPhone** instead of a browser tab: Google documents no way to
    force it (the picker is a web link; no deep link, no return-to-app redirect). Whether an iPhone
    hands the link to the app depends on iOS "universal links", which work best from a real tapped
    link in Safari and often not from Chrome or a script-opened tab (our code uses `window.open`).
    Cheap experiments when picked up: make the second tap a real link; check for the photos the
    moment the page regains focus (iPhones pause background tabs); try Safari against Chrome on a
    real iPhone. No guarantee it can work.
  - **Why it still matters:** on an iPhone the normal photo picker only shows photos saved on the
    phone, not Google Photos, so this import is the only route for someone whose photos live in
    Google Photos.
  - **What was switched off in the meantime (2026-11-25), so a friend never hits an error:**
    1. The Add page tip "Photos in Google Photos? Use Import from Google Photos below. Your phone's own
       picker may only show the photos saved on the phone itself." was removed (`components/AddTips.tsx`).
    2. The "Import from Google Photos" button is now shown **only to the owner** (the one Google test
       user), through a `showGoogleImport` setting passed from `app/add/page.tsx` to
       `components/AddPhotosForm.tsx` (default off). Everyone else just sees the normal photo picker.
       Note the effect: on an iPhone, a friend whose photos live only in Google Photos has no way to
       bring them in until this is turned back on.
  - **REMEMBER, when the app is published (or if a friend must use the import sooner):**
    - [ ] Publish the Google app out of Testing (Audience page; needs an app name on the Branding page,
          and possibly a privacy policy and verified domain depending on how Google classifies the
          Photos permission: find that out first by adding the permission under Data access).
    - [ ] Show the import button to everyone again: change `showGoogleImport={user.isOwner}` in
          `app/add/page.tsx` to `showGoogleImport` (or remove the setting).
    - [ ] Put the tip line back in `components/AddTips.tsx` (wording above).
    - [ ] Confirm the weekly reconnect is gone after publishing (it should be; Google's docs only
          state the 7-day limit for Testing).
    - [ ] Then try the iPhone experiments above (real link, check on return, Safari against Chrome).
    - [ ] Update the landing page's "Working today" list if the import is worth mentioning, and the
          privacy copy if anything changes about what Google sees.
    - **Shortcut if a friend needs it before publishing:** add their Google email under Test users
      (Google Cloud → Google Auth Platform → Audience, up to 100), then show the button to them. The
      7-day reconnect still applies to them.

## Paused, waiting on something

- [ ] **Dark mode: built, parked on a side branch, not released** (decided 2026-11-25: keep it out of
  the onboarding release). The whole site follows the phone's light or dark setting. The finished work
  is saved on the local branch `dark-mode` (commit `aa4c34e`, on this computer only, not uploaded);
  its project notes are item 33 there. It is waiting on the photo backgrounds below, because the light
  studio backgrounds of the generated product photos glow on the dark page.
  - **Cut out the photo backgrounds** so garments sit directly on the page colour in both themes.
    Compared on real photos (`web/eval-data/dark-photo-options.png`, private): dimming (20% / 35%)
    just turns the backgrounds a flat murky grey and dulls the clothes, so not that. A simple
    edge-flood-fill cut-out looked great on dark and coloured garments (navy jumper, brown jacket,
    black trousers) but ate into white and cream ones (white Stan Smith trainers, white linen shirt),
    so it can't be the method.
    - **Next step:** test two proper background-removal options on the hardest items (white trainers,
      white linen shirt, white tee) before choosing, e.g. a segmentation mask from Gemini and a
      dedicated background-removal library. Change nothing in the app until the results are seen.
    - **To settle when building it:** it also changes the light look (the grey photo background
      becomes the page colour); it adds a processing step and a few cents per upload; the 49 existing
      photos need one backfill run (same pattern as the other `scripts/backfill-*` scripts); keep a soft
      shadow or other cue so garments don't look like they float; it must work with
      `normalizeProductPhoto` and the 3:4 tile (`lib/product-photo.ts`). Also lays groundwork for the
      planned outfit images on a stand-in model, since cut-outs combine cleanly.
  - **Smaller dark mode items:** the light theme's grey secondary text is a little faint (3.5:1 against
    the page, under the 4.5:1 guideline; a design decision, held at today's level by the dark mode
    test); an optional manual light/dark switch (the page already supports forcing a theme); the
    installed home-screen app's launch screen stays light; select mode, the Google Photos import and
    the correction result weren't looked at in dark; not checked on a real phone.
  - **To release:** decide whether to wait for the cut-outs or ship dark mode with bright photos, then
    merge the `dark-mode` branch (the colour switch is in `globals.css` and `layout.tsx`).

- [ ] **Better "styles well with" suggestions (tops with bottoms only for now) — waiting on other
  people's ratings.** Where it stands (2026-11-24): the rules and an AI stylist both agreed with
  the owner's own ratings only about as well as a coin flip (rules 58%, colour-aware rules 51%,
  AI stylist 48%; 60% for the AI once football-shirt pairs are left out). The owner's own taste
  isn't a safe yardstick (he says some outfits others liked he wouldn't have chosen), so the
  same 24 pairs were put on two photo sheets (`web/eval-data/photo-sheet-1.png`, `-2.png`) and
  sent to a few other people to rate on "is this a well put-together outfit?". Next, once the
  answers arrive: measure how much people agree with each other, then score the AI and the rules
  against that agreement. If people mostly agree, tune toward them; where they split, that's
  taste, and the owner's ratings (`web/eval-data/pairing-ratings.json`) are the yardstick for him.
  Then: tag each item's cut (wide, tapered, fitted) and give the AI the owner's reasons as style
  notes, tested on a fresh batch of pairs. Outerwear and shoes come after tops and bottoms.
  Nothing from this is live yet. Experimental code: `src/lib/colour.ts`, `src/lib/stylist.ts`,
  and `scripts/eval-pairings.ts`, `eval-stylist.ts`, `make-photo-sheet.ts` (all uncommitted).
  **First four other people's answers are in** (`web/eval-data/second-opinions.json`, analysed by
  `scripts/eval-consensus.ts`): people agree with each other much less than hoped (all five
  raters identical on only 3 of 24 pairs; some pairs of raters gave flat opposites on 10), but
  the four others were clearly positive on 10 pairs and clearly negative on 4. Against that
  crowd view the AI stylist tracks it at 0.45 (0 = unrelated, 1 = identical order), roughly as
  well as the typical single person tracks the rest (0.32, 0.40, 0.52); today's rules score
  below zero (-0.23) and rules + colour -0.09. The owner's own ratings track the others at about
  zero, and most of his "no" reasons (olive/brown "tree", green-on-green, fabric and volume
  mismatches) were NOT shared by the others, so they must not be turned into general style
  rules. Waiting for more raters before tuning anything (24 pairs and 4 raters would just be
  fitted to); one rater's answers had two typos read as 14 and 24 (assumption noted in the file).

## Planned: recommended outfits (ROs) on the item page — decisions of 2026-11-24

An RO is a whole outfit (top, bottom, shoes, sometimes outerwear) built around one item, shown
on that item's page. It replaces today's single-item "styles well with" suggestions.

**Milestones**
- [~] **M1:** show each outfit's items side by side (the cleaned item photos), with a one-line
  "why this works". No model. **Built and tested on the owner's machine (2026-11-25), not live
  yet** (PROJECT.md §5 item 27). Still to do before it replaces the grid hover pills: owner's
  go-ahead to put it live, then a look at how it reads on the real wardrobe.
- [ ] **M2:** show the outfit worn by a generic model (this is the PRD's generic-model P1
  feature; needs a synthetic or licensed model, not a retailer's or stock photo).
- [ ] **M3:** worn by the user's own personalised avatar (face and body data: handle with the
  care of PROJECT.md §5 item 18).

**Rules decided**
- 4 outfits per item, best first, with some variety between them. Every outfit includes the item
  it is built around, so for an outerwear item all four include it.
- Outfits cut across the wardrobe: top, bottom and shoes at minimum, and for non-outerwear items
  at least 1 and at most 3 of the 4 also include outerwear.
- If the user owns no outerwear or no shoes, keep to what they have (tops and bottoms at least).
- Leave out items flagged as duplicates.
- Too-small wardrobe: de-prioritised for now; show a note that about 5 tops and 5 bottoms are
  needed first (matches the existing coverage nudge).
- Each outfit carries a one-line rationale.
- The hover pills on the grid are removed once the outfits on the item page are built and
  look right (not before). **Done 2026-11-25** (owner approved; pending going live).

**Bugs**
- [ ] **Outfits regenerated after logging out and back in** (reported 2026-11-25). An item whose
  outfits were already made got new ones (and a new AI bill) on the next sign-in. Wanted: make
  outfits once per item and keep them on the person's account, only redoing them when the
  wardrobe changes or they give interested / not-interested signals. They're already meant to
  be saved per account (PROJECT.md §5 item 27), so this looks like a bug, not missing design.
  Not investigated. Things to check: the "wardrobe grew by 5" rule, the version-change rule,
  or the saved-outfits table not being set up where this happened.

**Deliberately later**
- [ ] Seasonality / weather in outfit choice (outerwear in summer is currently possible).
- [ ] "Interested / not interested" on outfits, to see more and to personalise.
- [ ] Create an outfit by describing the vibe. Entry point idea: the home page search bar, which
  needs improving anyway, could grow into "describe the vibe you're going for".
- [ ] Measuring "suggestions actually worn" (the north star) and wear logging. Not now, but every
  week without wear data is data lost (PROJECT.md §2).
- [ ] Validate shoe and outerwear pairings; so far only top-and-bottom pairs have been rated.
- [ ] Make it social: style your avatar in an outfit and share it with a friend or partner for
  their verdict. Builds on M3 (your own avatar); sharing means someone else sees your
  likeness, so handle it with the same care.

## Roadmap use cases (from PROJECT.md §2 and the PRD feature table)

The big capabilities that are not started and aren't tracked elsewhere in this file. Added 2026-11-27 so
the whole picture lives in one place. Priorities are the PRD's (P1 next, P2 later, P3 someday). Things
already listed above (generic model = M2, own avatar = M3, "interested / not interested", describe the
vibe, seasonality, wear logging) are not repeated; they're pointed to instead. Where the landing page
promises one of these, its name there is noted, so the page stays honest as things ship.

**P1**
- [ ] **Dress for an occasion.** Type a request ("dinner in Lisbon", "first date") and get an outfit
  built from what you own. A close cousin of "describe the vibe" under recommended outfits. Likely
  route: the same outfit engine (`lib/outfits.ts`) with the request added to the stylist's prompt.
- [ ] **Outfit of the day, with weather and push notifications.** A daily suggestion by occasion and
  weather. Needs weather and seasonality ("deliberately later" under recommended outfits), a way to
  send notifications to a phone (the installed home-screen app matters here), and **wear logging
  first** (see the product questions section), or the north-star metric can't be measured.
- [ ] **Personalise suggestions from what people accept and reject.** Landing page name: "Outfits that
  learn your taste". Starts with the "interested / not interested" button; the rating study that
  tests suggestion quality is paused (see Paused).
- [ ] **Build a style profile from looks or influencers the person likes.** Landing page name: "Style
  inspiration". The parked "what's your style?" quiz belongs here. Not designed yet. Open: where the
  inspiration photos come from, and the care other people's photos need.
- [ ] **Wardrobe-level gap analysis: what to buy next.** Recommend the pieces that would unlock the most
  new outfits. Landing page name: "Smarter shopping". Builds on the coverage minimums
  (`lib/coverage.ts`) but needs counting outfits, not just pieces.
- [ ] **"Shop this new item to unlock outfits with something you already own."** "Buy this and you get N
  new outfits." Needs product data (retailer pages are flaky to read: see the Zara item) and outfit
  counting for an item you don't own yet.
- [ ] **Different brands and colours in shopping suggestions, at item level.** Offer options, not one
  pick.
- [ ] **Favourite ("starred") outfits.** Star an outfit and it floats up. Also unlocks "starred items to
  the front" from the PRD list below.

**P2**
- [ ] **Virtual try-on.** Outfits on the person's own photo. The most expensive item on the list:
  photorealism is hard. Full-resolution originals are already stored for it. Treated as a shareable
  growth feature, not core utility. Landing page name: "Photorealistic avatars" (also see M3).
- [ ] **Trip planning.** Where, when and for how long, then a capsule packing list from the wardrobe, plus
  shopping inspiration seeded by the destination. No design is recorded yet. Likely route: weather and
  occasion mix per day, reusing the outfit engine.
- [ ] **Browser or shopping plug-in.** Flags new styles, or "you own something like this", while
  shopping.
- [ ] **In-person camera point-and-capture.** Point your phone at something in a shop: "do I already own
  this or similar?" Needs visual similarity against the wardrobe: the same hard problem as duplicate
  detection (see its item).
- [ ] **Find similar while shopping.** Budget- and material-matched alternatives.

**P3**
- [ ] **Monthly upgrade suggestions**, **influencer look-alike**, **gift wishlist.**
- [ ] **Guided new-user flow through styling decisions.** Partly overlaps the first-run onboarding (PROJECT.md
  §5 item 32), which is about getting pieces in, not about styling decisions.

**Carried over from the roadmap**
- Monetisation (referral take-rate, white-label to brands, resale-flagging) is for later and shouldn't
  shape technical decisions now.
- Don't start with try-on or shopping integration: they're demo-shaped and would eat the timeline.

## From the PRD: "MVP laundry list and amendments"

Source: the PRD's [MVP laundry list tab](https://docs.google.com/document/d/1kkXS5PqcRQm0tULCa8dwkfwHpVq71OBwgFfPsvhjhJ4/edit?tab=t.b5aj6z2petf8).
Wording is yours; the status notes are mine, checked against the code on 2026-11-17. The
PRD's `[image]` placeholders didn't come through, so where an item leans on a screenshot I
say so. Items you'd already struck through are listed as done.

**General UI and usability**

- [ ] **Feedback entry point** for users: a free-form field with Wispr Flow integration. Unclear
  what "integration" needs beyond dictation; if it's just dictating into a text box, Wispr
  Flow probably already works on any text field (not verified). Also needs somewhere for the
  feedback to go (a table, or an email to you).
- [ ] **Summary bar: hovering the categories should explain them.** Confirmed open: the bar is
  plain text with no hover.
- [ ] **Summary bar: click a colour to sort/filter by it.** Open; swatches aren't clickable. The
  per-item colour data this needs already exists (PROJECT.md §5 item 7).
- [ ] **Summary bar: reorder and resize the palette by how much of the wardrobe is each
  colour.** Open; today it's a flat row of swatches. The PRD says "proportion of outfits that
  fit the colour"; we have no outfits yet, so this would start as share of *pieces*. Confirm
  that's what you want.

**Language**

- [ ] **No em dashes or other AI giveaways in content.** Open, two parts: the AI prompts have no
  such rule, and our own interface copy uses em dashes in plenty of places (error messages,
  hints). Needs a prompt rule, a sweep of the UI strings, and a one-off pass over existing
  AI-written notes.
- [ ] **Sentence case for item titles, whatever the input.** Open; titles are currently mixed
  ("White Crew Neck Tee" next to "Navy crewneck jumper"). Enforce when saving, then tidy
  existing items.
- [ ] **"Football", not "soccer".** No explicit rule yet. The tagger has been using "football"
  anyway; adding it to the British-English note would make that reliable.

**Wardrobe visualisation**

- [ ] **Apple Photos: use the "Me" and Clothing filters** to get the right collection. Today the
  Add page gives no guidance. A how-to hint is easy; an actual Apple Photos import isn't
  something I know a web equivalent of Google's picker for (not checked).
- [ ] **Disclaimer that the cleaned-up photos are AI-generated, not photo-realistic.** Open.
- [x] **Loading state while a photo is being cleaned up, with no refresh needed.** **Built and checked
  locally 2026-11-27, awaiting an upload** (PROJECT.md §5 item 34): a new piece shows a "Cleaning up
  photo" placeholder instead of the original, and the clean photo swaps in by itself. This replaces the
  old deliberate no-polling choice (§5 item 5). Ranked first in the "fix before inviting friends" list.
- [ ] **Let users improve image generation:**
  - [ ] by pasting the URL of the item they bought, or a similar photo from the web;
  - [ ] by taking a new, clearer photo to regenerate from;
  - [ ] **partly done:** seeing the original and the current render side by side when giving
    feedback. The dialog already shows the original photo (§5 item 6); check whether it shows
    both together.
- [ ] **Identify layers underneath and separate them.** Open, and it pulls against a change I made
  on 2026-11-16 (§5 item 25): a layer showing only a sliver, like the collar of a tee under a
  fleece, is now *not* catalogued. Splitting out under-layers is the same judgement from the
  other side, so decide the threshold for "enough of it is visible" once for both.
- [ ] **"Looks good" button for items with a "! Check" tag.** Open; today the only way to clear the
  flag is to edit the item.
- [ ] **Easier deleting.** Open: single items can only be removed through Select mode or the
  duplicates page. Needs a delete action on the item itself, without going through edit.
- [ ] **Let starred items go to the front of the list.** Open; there's no starring yet.
- **Duplicates:**
  - [x] Option to mark an item as a duplicate — done (§5 item 19).
  - [ ] Review a duplicate straight from the prompt. Partly there: the badge and a "Review
    duplicates" pill lead to the review page, but I couldn't see your screenshot, so check
    that's the prompt you meant.
  - [ ] When marking as a duplicate, choose immediately which one stays. Open; marking currently
    just adds the pair to the review queue.
- [x] ~~Rearrange to show tops on top~~ — done (shelves run Tops, Bottoms, Outerwear, Footwear).

**Ingestion**

- [x] ~~Identify the user in photos so only outfits on you are uploaded~~ — done (§5 items 18, 24).
- [x] Enable ingestion from Google Photos — done (§5 item 22).
- [ ] **Some photos just aren't accepted for upload.** Open. Almost certainly the large-photo
  failure under "Do soon" (a camera photo was rejected), plus the mislabelled-iPhone-photo
  bug already fixed on 2026-11-15 (§5 item 24).
- [x] ~~Accessories bundled separately / descoped~~ — done, dropped from the MVP (§5 item 15).
- [ ] **Disclaimer on the Add page that facial data is never stored.** Open, and the wording
  needs care. The app builds no face-recognition data and never stores the full group photo,
  but it *does* store your own photo, which includes your face, as the item's original. A
  blanket "facial data is never stored" would be misleading; something like "we never build
  face profiles or recognise people, and photos with other people in them are cropped to
  you before saving" is true.

## Before inviting people beyond friends

- [ ] **Per-user usage limits.** Every photo triggers several AI calls (tagging, person
  detection, image generation, up to five duplicate comparisons), all billed to you. No cap
  per person today. → Must happen before strangers have accounts. **Half done 2026-11-25:** spend is
  now *tracked* per person (PROJECT.md §5 item 30, shown on the Invite page); the *limit* itself
  (stop a person once they pass a monthly amount) is not built. Provider-level caps are set too:
  Anthropic $25/month plus prepaid credit; Google $50 prepaid credit.
- [ ] **Wardrobe photos sit in a public storage bucket.** Anyone with a photo's exact address can
  open it, although the addresses aren't listed or guessable (they include a random id). The app
  only shows a person their own pieces, and the temporary upload bucket is private, but the stored
  wardrobe photos are not. Found 2026-11-25 while writing the landing page's privacy copy, which
  deliberately does not claim private storage. Decide before strangers join: make the bucket private
  and serve photos through short-lived links, or accept and state it. The landing page's privacy
  wording (`components/Landing.tsx`) must match whatever is decided.
- [ ] **Custom email sender (SMTP).** Removes the "few sign-in emails an hour" ceiling and lets us
  go back to typed 6-digit codes, which fixes the "link must open in the same browser" problem
  (worst on the iOS home-screen app).
- [ ] **Landing page for new users.** Today a signed-out visitor is sent straight to the sign-in
  page, which only says the app is invite-only. A landing page would say what The Rail is and
  show it, before anyone is asked to sign in. Open questions for when it's picked up: what
  "getting in" means while sign-up is closed (request an invite? waitlist?), and what it
  should show (screenshots of the rail and the new outfits view, the pitch from PROJECT.md
  §1). Needs the sign-in rules in `src/proxy.ts` loosened for the landing page only.
- [ ] **Public "what we're building" link on the home page.** A link users can click to see the
  upcoming product backlog, so they know what's being worked on (building in public). Open
  question: show this file as-is, or a cleaned-up public version (it has internal notes, costs
  and script names)?
- [ ] **"Send feedback" pill: rant freely, we turn it into a product request.** A floating pill on
  every page where people can type or speak (possibly a dictation tool like Wispr Flow) as
  unstructured as they like. Behind the scenes it's turned into a tidy, formal request for you.
  Goal: zero effort to give feedback, no need to describe the issue precisely.
- [ ] **Invite your friend** to dogfood: `node scripts/create-user.mjs <email>`. Their AI usage is
  billed to you (see the limits item above).
- [ ] **Make `items.user_id` required** once you're confident:
  `alter table items alter column user_id set not null;` (run in Supabase by hand).
- [ ] **Backfill scripts ignore who owns what.** Most `scripts/backfill-*.mjs` act on every row
  regardless of user. Fine while you're the only real user; fix if one ever needs to run for
  one person.
- [ ] **Make selecting, editing, removing and reviewing duplicates feel snappy.** Especially right
  after a bulk add, when there's the most to tidy up. Not measured yet: find where it's slow.
- [ ] **Make that same tidy-up flow intuitive for a new user.** After a first bulk add (onboarding),
  selecting, editing, removing and resolving duplicates should be obvious without explanation.

## Photo ingestion — known gaps

- [ ] **Duplicate detection is missing clear duplicates** (reported 2026-11-23). **Mostly addressed
  2026-11-27, awaiting an upload** (PROJECT.md §5 item 38): confirmed causes were the word-overlap shortlist
  dropping twins the AI had named with different words (and the cap of 5 in database order); both are replaced by
  ranking every same-category piece. **Still open:** (1) a piece from the same bulk upload that hasn't finished
  cleaning is skipped as a candidate and never re-checked (a "check again once it's ready" step is needed);
  (2) a twin the model rates "same" below 0.6, or "different" with high confidence, is still missed (one of 12
  test cases, a white-sneaker pair, was missed by every method); (3) wardrobes that already contain duplicates
  from before aren't re-scanned (the backfill script is the way). Workaround today: "Mark as duplicate" on the
  item. History worth remembering: this feature already took four attempts to get right (PROJECT.md §5 item 13).
- [ ] **Claude can undercount people.** If it reads a photo fine but says "one person" when there
  are two, the "which one is you?" picker never appears (the white-tee case may have been
  this). Option: run person detection on every photo — costs an extra Gemini call each and
  adds prompts for background strangers. → Revisit if it recurs.
- [ ] **Picker offers background passers-by.** Tiny boxes for strangers appear alongside the real
  people. Harmless (you tap yourself) but cluttered. → Hide boxes below a minimum size if it
  bothers you.
- [ ] **Failed read after you've tapped yourself still makes a blank item.** In the second step of
  the multi-person flow, if tagging fails, a blank "Untitled piece" is created and extraction
  is told only that — it could pick the wrong garment inside the crop. Rare (tagging retries
  once). → Same fix shape as the first step (error instead of guessing) if it shows up.
- [ ] **Test a real HEIC file.** Uploads are now read by their bytes, and non-JPEG formats are
  converted — but whether the server's image library can decode genuine HEIC from an iPhone
  is untested (the fallback is a clear error, not a crash). Safari usually converts to JPEG
  first, so this may never matter.
- [ ] **No resume: closing the tab or switching apps mid-batch drops the rest.** Photos now go three at a
  time (PROJECT.md §5 item 35), but the browser still drives the run, so an iPhone pausing a background tab
  stalls it. → Phase 2: upload everything quickly, then read and clean in the background on the server and
  show progress from there, so the person can leave. Bigger change; do it once real friends hit this.
- [x] ~~**Faster, more visual photo upload.**~~ **Built and checked locally 2026-11-27, awaiting an upload**
  (§5 item 35): a row per photo with its thumbnail, stage and the pieces it became, three at a time,
  straight to the rail when the last is read. Still open from it: a per-row "try again" for failed photos.
- [ ] **Show the old outfits while new ones are made (no wait).** When a relevant new piece triggers a redo
  (§5 item 36), the page shows "putting outfits together" for 6 to 30 seconds. Better: keep showing the saved
  outfits with a small "updating with your new pieces" note and swap in the new ones when ready. Needs a
  small build. → Do it if the wait feels bad in real use. Also still open from the same discussion: a
  per-person monthly AI spend limit before friends use this heavily.
- [ ] **A photo waiting on "which one is you?" is easy to miss.** On the new Add page (§5 item 35) the
  other photos finish and the page just stays put, with only "1 needs you" in the summary line and the
  row's label; if the person has scrolled down past the picker they see a page that never finishes. Ideas:
  a highlighted "Tap which one is you" banner, or scrolling to the picker once the others are done.
  Added 2026-11-27, not built.
- [ ] **Baseball cap catalogued as a Top** (once, on the rain-jacket photo). Accessories are meant to
  be skipped. Not obviously caused by recent changes. → Watch for a repeat; tighten the
  accessories rule if it does.
- [ ] **Shoe photos aren't consistent: some show both shoes, some only one.** Wanted: every
  footwear photo shows the pair, in one standard way, the same angle and arrangement every
  time, floating on the neutral background like the PRD's "Zara homepage" look. Likely route:
  a shoe-specific instruction in the photo-cleanup prompt (both shoes, same side-on view),
  since today every category gets the same generic instruction. Count of affected items not
  yet checked. One thing to rule out first: the double-view fix of 2026-11-16 (PROJECT.md §5
  item 25) crops to the top block when it sees two similar blocks stacked above and below, so
  a pair of shoes drawn one above the other could lose a shoe. It found no shoes in the
  wardrobe at the time, but only the generator itself can be blamed for existing photos.
- [ ] **Other image-generation glitches remain.** Besides the doubled view (now handled in code),
  Gemini sometimes still leaves the person in frame or cuts off a sleeve. "Not quite right?"
  is the safety net. → Add automatic detection only if these become common.
- [ ] **A repeatable way to raise and standardise product-photo quality, per item type.** Instead
  of fixing photos one bug at a time: write a standard look for each category (angle, framing,
  shoes as a pair, etc.), and build a repeatable quality test (an "eval": a fixed set of real
  photos scored against that standard) to check every prompt or model change. Could be a
  reusable skill or a better model. Ties together the shoe-consistency and glitch items above.
- [ ] **Pure gym gear isn't rejected** — a technical running tee still gets catalogued as a Top.
  Actively excluding it would be a separate feature.
- [ ] **"This is actually from Zara": let people name the brand and paste a product link.** The
  person says what the real item is (brand, plus one or more product URLs), and we find the
  real product to make a more realistic generated photo, and to learn its real texture, fit and
  material where we can pin the item down. Note: the retired prototype found retailer pages
  flaky to read (scrapers get blocked; PROJECT.md §4), so plan for links that can't be read.

## Wardrobe data & coverage

- [ ] **Unresolved duplicate pair:** khaki chinos vs a similar pair of stretch trousers. The model
  says different (0.75); a direct look didn't settle it. Left unflagged — your call whether
  it's one pair or two.
- [ ] **Orphaned "Brown Leather Belt"** still has the removed category "Accessories"; opening its
  edit page would silently reclassify it to Tops on save. Check whether it's still there and
  either delete it or pick a category on purpose.
- [ ] **No coverage nudge for Footwear.** No agreed minimum for "enough shoes" yet, so no red dot.
- [ ] **Existing items from earlier bad imports** weren't retroactively fixed; you've corrected the
  ones you noticed. Worth a skim of the rail for any other "Untitled piece" or wrong-photo
  items.

## Product questions still open (from PROJECT.md)

- [ ] **Wear logging** — no feature owns recording "did you actually wear this outfit", but the
  north-star metric (% of suggestions worn) needs it. Decide before outfit-of-the-day (P1)
  ships; every week without it is data lost.
- [x] **PROJECT.md §2 was out of step with the PRD** — three P1 features were missing (dress for
  occasion, generic-model visualisation, favourite outfits). Added 2026-11-17.
- [ ] **Pairing suggestions are rule-based.** Revisit whether AI-computed pairings are worth the
  cost once there's a real wardrobe to judge them on.

## User delight

- [ ] **A home page header that feels fresh every time the app opens.** Greet the person by name
  ("Welcome, Harsh"), with a slogan that rotates on each visit. The same space could also show
  today's temperature (a lead-in to the weather-based outfit-of-the-day, P1). Note: we hold
  only an email address today, so we'd need to ask for a first name.

## Tiny cleanups

- [ ] **Text in proper sentence case everywhere, with a check that keeps it that way.** Some
  pages show all-lowercase text. Fix it to sentence case with standard spelling, grammar and
  punctuation, then add an automatic check that new text must pass. Keep the deliberate
  exceptions: the uppercase mono garment-tag labels and Anton headings (PROJECT.md §3), and
  British spelling.

- [ ] **Misplaced code comment** in `web/src/lib/product-photo.ts`: the long description of the
  bounding-box search now sits above the new `ContentMask` helper instead of above
  `findContentBBox`.
- [ ] **8 lint warnings** about plain `<img>` tags (`ItemCard.tsx`, `MarkDuplicate.tsx`, etc.).
  Pre-existing and harmless; deliberate for now.
