# GPT Draft

Open **Admin > Create / Schedule Case > GPT Draft**. It uses the existing admin
password session; the API checks that password before accessing cases or OpenAI.
No public navigation link or player-facing provenance is added.

## Workflow

1. Browse ranked past daily cases. The foundational filter is optional. Each source
   shows unique player sessions, Great case reviews, total reviews, review rate,
   score, and latest scheduled use of its diagnosis (including accepted aliases).
2. Select a source and optionally describe a variation. Generate explicitly;
   generation never writes to the cases table.
3. Review/edit the presentation, clues, and modern teaching sections. Source image
   findings and image-linked clues are preserved. Preview opens the existing admin
   player preview, which does not count toward analytics.
4. Check the review confirmation and choose a future date. **Use Draft** loads the
   normal admin editor, preserving answers, aliases, images, captions, credits,
   references, reveal timing, and internal provenance. An existing editor draft is
   backed up locally before replacement, with confirmation.
5. Click a calendar day or Add on an open daily slot to move the draft. Review and
   explicitly Save in the existing editor to schedule it. Generated drafts use
   insert-only writes, so an occupied slot (including a concurrent save in another
   tab) cannot be overwritten. The source date is explicitly blocked.

The draft shelf keeps the latest 40 variations in this browser's local storage,
including rejected variations and dates sent to the editor. Sources drafted in
the last 30 days are hidden by default. This is not a cross-device database draft
system: clearing browser storage clears the shelf/provenance. The normal calendar
is still authoritative for published/scheduled cases. Case Studio is a separate
saved-case editor; schedule the draft in the main admin editor first.

## Ranking

For each case, P = distinct player sessions, R = distinct reviewers, G = reviewers
who selected Great case. Repeated guesses and repeat reviews do not inflate P/G.
Administrator sessions are excluded using the existing analytics exclusions.

```
quality = (G + 2) / (R + 5)
confidence = P / (P + 30)
endorsement = min(0.5, (G + 1) / (max(P, R) + 20))
score = log(1 + P) * confidence * (0.5 + quality + endorsement)
        * foundationalPreference * recencyMultiplier
```

Foundational diagnoses receive a 1.2 multiplier; other diagnoses receive 1.0.
Recency is measured against the latest matching diagnosis or alias: within 30
days (including future schedules) = 0.25, within 60 days = 0.65, otherwise = 1.
Review rate shown is R/P, not a success rate. Sessions are the existing analytics
identity, not a verified count of distinct human beings. Sparse positive feedback
is smoothed rather than treated as a perfect rating.

## Configuration

No schema migration or new dependency is required. Configure on the server:

- `OPENAI_API_KEY`: required for generation, never prefixed with NEXT_PUBLIC.
- `OPENAI_DRAFT_MODEL`: optional, defaults to `gpt-4.1`; must support Responses
  structured outputs with JSON schema.
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or
  `SUPABASE_SECRET_KEY`) for reading case/analytics data.
- Existing `ADMIN_PASSWORD` for the admin session. Set a non-default password.

Case text, documented findings, image URLs, and three recent cases as style
examples are sent to OpenAI, not player identities or analytics rows. Images are
not visually interpreted. The request uses `store: false`. Generation has a
65-second timeout and a per-process concurrent-request guard (not a distributed
rate limiter). Each explicit generation consumes API usage; there are no automatic
generation retries or background publishing.

## Medical Review And Validation

Structured output requires the source clue count and all six generated teaching
sections. Imaging Findings is copied from the source. Validation rejects empty,
oversized, duplicated-clue, or unchanged-presentation output. Image-linked clues
are restored verbatim, even if a model changes them. Blank source clue slots and
image timing are retained. Model instructions require compatibility with age,
side, skeletal maturity and injury pattern, but these cannot be clinically
guaranteed by schema validation. Andy must review clinical correctness, image
compatibility, clue references, and references before saving.

Run regression tests with `node --test tests/*.test.mjs`, then `npm run build`.
The GPT Draft tests mock database and OpenAI boundaries: ranking, structured
generation, source immutability, repeated variations, editing/handoff, actual
admin save guards, and ordinary save behavior. A real model response and database
round trip must still be smoke-tested in a connected environment before rollout.
