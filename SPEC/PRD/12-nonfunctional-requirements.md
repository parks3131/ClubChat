# Non-Functional Requirements

**Status:** Partial — privacy, moderation, and deletion are shipped; accessibility and error monitoring are not.

The cross-cutting expectations every feature must meet, and an honest record of where the product currently falls short.

## Platform support

| Platform | Status | Notes |
|---|---|---|
| **iOS** | Supported | Phone-first; tablet layout supported but not designed for |
| **Android** | Supported | Confirmed working on a real device from an internal preview build |
| **Web** | Supported | Primarily a development and testing surface, but fully functional |
| Portrait orientation | Enforced | Landscape is not designed for |

**Requirement:** any behaviour must work identically on all three. Confirmation dialogs, file pickers, camera capture, clipboard access, and sharing each behave differently per platform and must be verified on each — several shipped bugs came from a control that silently did nothing on one platform while working on the others.

## Privacy & data handling

1. **Every read is access-scoped at the data layer, not just hidden in the UI.** A member who types a URL for a race chat, an Eboard poll, or another club's roster gets nothing back. UI gating is a convenience on top of enforcement, never the enforcement itself.
2. **Profiles are visible only to people who share a club** with the viewer.
3. **Chat photos and documents are stored privately**, not on public URLs, and are served through short-lived access links scoped to people who can read that chat.
4. **Club, race, and Eboard avatars are public images** — they are identity, not content.
5. **Personal data collected is deliberately minimal**: email, name, and optional bio, city, date of birth, and school.
6. **No analytics, tracking, or third-party data sharing** is implemented.
7. **No personal data is ever placed in a shareable link.** The club join link carries only an opaque club invite token.

> Implementation: see [TECH/02-security-rls.md](../TECH/02-security-rls.md) and [TECH/07-media-and-storage.md](../TECH/07-media-and-storage.md).

## Legal & compliance

| Item | Status |
|---|---|
| In-app Privacy Policy | Shipped — reachable signed out and signed in |
| In-app Terms of Service | Shipped — same |
| Consent line at sign-up linking to both | Shipped |
| Self-service account deletion | Shipped |
| Message reporting and admin moderation | Shipped |
| **Legal review of the policy and terms** | **Not done** — the current content is a first draft written in-house, explicitly not legal advice, and must be reviewed before any public release |
| App Store privacy label / Play Data Safety form | Not done — completed at submission time, not a build task |
| Handling for clubs including minors | Not considered |

## Moderation & safety

1. **Any member can report any message they did not send.** Reports surface to that space's admins only.
2. **Admins can delete any message in their space**; a member can delete their own.
3. **Deleted messages leave a tombstone**, so a conversation stays readable.
4. **Reporting the same message twice changes nothing** — no report spam.
5. **There is no block or mute** between members — an unresolved gap for a product that will eventually include minors.

## Performance & scale expectations

| Concern | Expectation | Current behaviour |
|---|---|---|
| Chat history | Never load an entire conversation at once | Loads the most recent 40 messages, pages backward on scroll |
| Notifications feed | Paginated | 20 per page, extends on scroll |
| Photos and documents | Never inline the file in the payload | Referenced and fetched separately |
| News feed, races list, rosters | Small enough to load whole | Currently unpaginated |
| Unread counts | Computed, never stored | Cannot drift out of sync with the messages |
| Merged calendar | One read per feature, merged client-side | Cross-club mode multiplies this by the user's club count — the least scalable read in the product |
| Deadline reminders | Fire within a minute of their window | Checked on a schedule |

**Requirement:** no screen may block on an unbounded read. The cross-club calendar is the known exception to watch as club counts grow.

## Reliability & error handling

1. **Every data-loading screen has three states**: loading, loaded, and a standard inline load-error with a retry. No screen may fail to a blank page.
2. **Destructive actions are confirmation-gated on every platform**, with the confirmation naming the thing being destroyed and stating what is lost.
3. **A screen reached by deep link or refresh must still be navigable back out**, since there is no history to pop.
4. **A user who lands somewhere they lack permission is redirected**, not shown a broken screen.
5. **Realtime is an enhancement, not a requirement** — every screen also loads its data directly, so a dropped realtime connection degrades to stale-until-refresh rather than broken.

## Offline behaviour

**Current state: the app is online-only.** There is no offline cache, no message queue, and no optimistic send.

| Situation | Behaviour |
|---|---|
| Offline on launch | The signed-in session is remembered, but every data read fails to the load-error state |
| Offline while in chat | Sending fails visibly; the message is not queued or retried |
| Connection lost mid-session | Realtime stops; already-loaded content stays on screen |
| Connection restored | Realtime reconnects; a refresh or re-navigation reloads content |

This is a known limitation, not a decision — a club coordinating at a race venue with poor signal is exactly the scenario it fails.

## Accessibility

**Current state: no accessibility work has been done.** This is the product's clearest non-functional gap.

| Requirement | Status |
|---|---|
| Accessibility labels on interactive controls | **None** — the codebase contains zero |
| Screen-reader navigation | Untested |
| Colour contrast against WCAG AA | Unverified |
| Dynamic type / font scaling | Unverified |
| Touch-target minimum sizes | Unverified |
| Reduced-motion support | Not implemented |

Every icon-only control — the composer's attach button, the pin and announce toggles, the per-message overflow menu, the pin control on a race row, the jump-to-latest button — is currently unlabelled and effectively invisible to a screen reader.

## Design consistency

1. **One design system across the app** — shared colour, spacing, radius, and typography tokens; no ad-hoc values.
2. **Shared screens, not forked copies.** Chat, Highlights, Polls, Calendar, Events, Members, and Gallery are each one implementation reused by club, race, and Eboard, so a fix lands everywhere at once.
3. **Consistent headers** across every club-scoped screen, including a working back control on screens reached by deep link.

> Implementation: see [TECH/08-design-system.md](../TECH/08-design-system.md) and [TECH/04-component-inventory.md](../TECH/04-component-inventory.md).

## Quality gates

| Gate | Status |
|---|---|
| Type checking, strict, on every change | Enforced in CI |
| Automated test suite | Runs in CI; covers date/formatting and calendar-feed logic — screens and permissions are not covered |
| Linter / formatter | None configured |
| Live smoke testing before declaring a feature done | Standard practice; has caught navigation and platform-specific bugs that code review did not |
| **Error monitoring in production** | **Not implemented** — a crash or a failed load in real use is invisible to the team |

> Implementation: see [TECH/09-testing-and-ci.md](../TECH/09-testing-and-ci.md).

## Environments & release readiness

| Item | Status |
|---|---|
| Hosted backend environment | **Exists**, in sync with the full migration history |
| Local development backend | Deliberately remains the default for day-to-day development |
| Build tooling and project registration | Complete |
| Android internal preview build | **Confirmed working on a real device** |
| iOS distribution | **Blocked on Apple Developer Program enrolment** — a paid-account matter, not a tooling one |
| Over-the-air updates | Not wired up |

> Implementation: see [TECH/10-environments-and-release.md](../TECH/10-environments-and-release.md).

## Acceptance criteria

- [ ] Every feature behaves identically on iOS, Android, and web, including confirmations, pickers, camera, clipboard, and sharing.
- [ ] No screen fails to a blank page; every data load has loading, loaded, and retryable-error states.
- [ ] Every destructive action is confirmation-gated on all three platforms.
- [ ] Direct URL access to any screen the user lacks permission for redirects rather than exposing data.
- [ ] Private media is never reachable by a public URL.
- [ ] Chat and notifications page rather than loading everything.
- [ ] The app is usable end-to-end on a real Android device from an installable build.
- [ ] *(Not met)* Every interactive control carries an accessibility label and is reachable by screen reader.
- [ ] *(Not met)* Production errors are reported to a monitoring service.
- [ ] *(Not met)* The Privacy Policy and Terms have been reviewed by a lawyer.

## Open questions

- What is the minimum viable offline story — read-only cached chat, or queued sends?
- Which accessibility standard is the target, and does it block the first public release?
- Is error monitoring required before wider testing, or only before public launch?
- Do clubs with minors require age gating, parental consent, or restricted profile fields?
- Should there be a data-retention policy (how long chat, photos, and notifications are kept)?
