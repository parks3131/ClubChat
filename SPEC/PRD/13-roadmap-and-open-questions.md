# Roadmap & Open Questions

**Status:** Planned

What is not built, what is blocking a real release, and the founder decisions still outstanding.

## Release status

| Item | Status |
|---|---|
| Feature set | Complete for the agreed MVP, plus everything added since |
| Hosted backend environment | **Live and in sync** with the full schema history |
| Local development environment | Deliberately remains the default for day-to-day development |
| Build tooling and project registration | **Done** |
| **Android** | **Confirmed working on a real device** from an internal preview build |
| **iOS** | **Blocked on Apple Developer Program enrolment** — a paid-account matter, not a tooling or code one |
| Google Play distribution | Blocked on Play Console registration |
| App Store privacy label / Play Data Safety form | Filled out at submission time; not a build task |

## Not built

### Blocking a real release

| Gap | Impact | Notes |
|---|---|---|
| **Push notifications** | A member learns nothing until they open the app. The in-app inbox already computes every message and destination a push would carry — only delivery is missing. | The single biggest functional gap |
| **Legal review of the Privacy Policy and Terms** | The shipped documents are an in-house first draft, explicitly not legal advice | Must happen before any public release |
| **Apple Developer Program enrolment** | No iOS distribution of any kind | Paid enrolment |
| **Error monitoring** | A crash or failed load in real use is invisible to the team | See [Non-functional requirements](12-nonfunctional-requirements.md) |

### Important but not blocking

| Gap | Impact |
|---|---|
| **Accessibility pass** | Zero accessibility labels exist; icon-only controls are unusable by screen reader |
| **Offline behaviour** | The app is online-only — no cache, no queued sends. A club at a race venue with poor signal is exactly the failure case |
| **Over-the-air updates** | Every fix requires a full store release |
| **Test coverage of screens and permissions** | Tests cover formatting and feed logic only; the permission matrix is verified by hand |
| **Muting / notification preferences** | Everything fans out to everyone eligible, with no member control |
| **Block or mute between members** | No member-level safety tool exists |

### Deliberately deferred

| Not built | Why |
|---|---|
| Race-specific workout plans | In the original vision; never built. May have been absorbed by Meet Information — needs a founder call |
| Bidirectional chat paging ("load newer") | Chat only pages upward from the live tail; only matters after a jump into deep history |
| Message search | Not requested |
| Comments on News posts | Discussion belongs in chat |
| Recurring events | Weekly training is Routines' job |
| External calendar sync | Not requested |
| RSVP / attendance anywhere | No attendance concept in the product |

## Navigation: an open founder decision

The club hub was restructured around a founder wireframe and currently links to **News & Highlights**, **Club Main Chat**, **Eboard & Council** (admins only), and a **Races & Meets** preview.

**Routines, Polls, and the Events list are fully reachable from club chat's header quick-nav menu**, and work normally from there. What is unresolved is only whether they should *also* have a place on the club hub. A stopgap "More" menu on the hub was explicitly rejected by the founder.

| Feature | Current entry point | Hub placement |
|---|---|---|
| News & Highlights | Club hub | Settled |
| Club Main Chat | Club hub | Settled |
| Races & Meets | Club hub (preview of 5, plus a searchable "See all") | Settled |
| Eboard & Council | Club hub, admins only | Settled |
| Calendar (month grid) | Its own bottom tab | Settled |
| Events list (Upcoming/Past) | Chat's quick-nav menu | Open |
| Routines | Chat's quick-nav menu | Open |
| Polls | Chat's quick-nav menu | Open |
| Members | Chat's quick-nav menu, and the club profile | Settled |
| Gallery | The club profile | Settled |

## Unverified design work

The visual redesign was rolled out app-wide, but **Highlights, Races, and Eboard were extrapolated from the hub's pattern rather than built against a source mockup**. They have never been reviewed against an intended design. Worth a founder look before release.

## Open questions by area

### Product shape

- Should a **race-specific workout plan** be built, or is it dead?
- Should the calendar's "race" event **type be removed**, given it has no relationship to a real [Race](06-races.md) and reads as if it does?
- Should a club be **archivable** (read-only history preserved) instead of only deletable?
- Should a finished race be archivable, so the races list does not grow forever?
- Is "Eboard & Council" the right default name for every club, or should it be set per club?
- Should "News & Highlights" be renamed, given chat's own "Highlights" is easy to confuse with it?

### Permissions

- Should a race be delegable to a non-admin race captain without making them a club admin?
- Should an admin other than a poll's creator be able to close a poll whose creator has left the club?
- Should ownership transfer require the recipient to accept, rather than taking effect immediately?
- Should demotion warn that it will also eject the person from the Eboard space?
- Should a club poll ever be member-creatable?

### Notifications

- Should members be able to mute a chat, race, or club?
- Should high-volume types (announcements, mentions) be separable from low-volume ones (join requests)?
- Should the badge count chat unreads as well as discrete notifications?
- Should notifications expire or be prunable?

### Growth and scale

- Should club search be scoped (by sport, by city) once there are many clubs?
- Should the join link be revocable or rotatable if it leaks?
- Does the News feed need pagination, or is a club's volume low enough that it never will?
- The cross-club merged calendar reads once per club the user belongs to — at what club count does that need rethinking?

### Compliance

- Do clubs including **minors** need age gating, parental consent, or restricted profile fields?
- Should there be a **data-retention policy** for chat, photos, and notifications?
- Should a user be able to **export their own data** before deleting their account?

## Suggested sequencing

1. **Push notifications** — the largest functional gap, and everything it needs already exists.
2. **Apple Developer Program enrolment** — unblocks iOS entirely; nothing else is in the way.
3. **Legal review** of the Privacy Policy and Terms.
4. **Error monitoring**, before any wider tester group.
5. **Settle whether Routines, Polls, and Events belong on the club hub** as well as in chat's quick-nav menu.
6. **Accessibility pass** — start with labels on every icon-only control.
7. **Design review** of Highlights, Races, and Eboard against an intended mockup.
8. **Offline story**, scoped to at least read-only cached chat.
