# Weekly Routines

**Status:** Shipped

Admin-authored, dated training plans - the feature that replaces the screenshotted Excel sheet.

## Purpose

Give captains a place to publish the week's workouts that is dated, per-sport, and readable on a phone, instead of an image pasted into chat and pinned.

## User stories

- As a captain, I want to write the week's workouts day by day so that I stop maintaining a spreadsheet and screenshotting it.
- As a captain, I want to tag a workout with its activity type so that a swim set and a long run are distinguishable at a glance.
- As a member, I want to see what today's workout is without scrolling chat so that I know what I am doing before I leave the house.
- As a member, I want to page forward to next week so that I can plan around it.
- As a member, I want a day with nothing on it to say so explicitly so that I do not wonder whether it was just not posted yet.
- As a captain, I want to edit or delete a workout so that a correction does not mean posting a second screenshot.

## Scope

**In scope**

- A Monday–Sunday view of a real calendar week (not a repeating template)
- Previous/next week paging
- One or more workouts per day, each with an activity type, a title, and an optional description
- Ten activity types: Run, Trail Run, Bike, Swim, Strength, Hybrid Fitness, Indoor Climb, Bouldering, XC Ski, Other
- Workout detail view; admin create, edit, delete
- Reachable from club chat's quick-nav menu

**Out of scope**

| Not in scope | Why |
|---|---|
| A structured exercise builder (sets, reps, distances, splits) | Explicit founder "keep it very simple" scoping call |
| Completion tracking or check-offs | Deliberately not built - this is a plan, not a log |
| Recurring / template weeks that auto-populate | Each week is authored for its real dates |
| Per-member or per-squad personalisation | One plan per club |
| Attaching a file or image to a workout | Not requested |
| Race-specific workout plans | Sketched in the original vision, never built - see Open questions |

## Behaviour rules

1. **The routines screen shows one real calendar week, Monday through Sunday.**
2. **Only today and future days are shown for the current week** - the week is a plan, not a record.
3. **A day with no workout renders as "Rest day"**, explicitly, rather than being omitted or left blank.
4. **Creating a workout starts with picking its activity type**, then the title and description form.
5. **A workout carries an activity type, a title, and an optional description** - nothing else.
6. **Any club admin can create, edit, or delete any workout**, not only the one who wrote it.
7. **Each activity type has its own icon and label**, used consistently in the week view and the detail view.
8. **Members see the week view and workout detail read-only** - no create, edit, or delete controls anywhere.
9. **Creating a workout does not notify anyone and does not post to chat.** It is reference material, not an event.

## Permissions

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| View the week and page between weeks | ✅ | ✅ | ✅ | ❌ |
| View a workout's detail | ✅ | ✅ | ✅ | ❌ |
| Create a workout | ✅ | ✅ | ❌ | ❌ |
| Edit any workout | ✅ | ✅ | ❌ | ❌ |
| Delete any workout | ✅ | ✅ | ❌ | ❌ |

## States & edge cases

| State | Behaviour |
|---|---|
| Week with no workouts at all | Every visible day shows "Rest day" |
| Current week, viewed on Friday | Only Friday through Sunday are shown |
| Past week, paged back to | Shown in full, read-only in effect (admins can still edit) |
| Loading | Spinner within the week view |
| Load failure | Standard inline load-error with retry |
| Member hits a create/edit URL directly | Redirected away |
| Workout deleted while its detail is open | The user is returned to the week view |
| Delete confirmation | Explicit confirmation on every platform, including web |

## Acceptance criteria

- [ ] The week view shows Monday–Sunday for a real calendar week, with the current week by default.
- [ ] On the current week, days already past are not shown; paging back a week shows all seven.
- [ ] A day with no workout shows "Rest day".
- [ ] An admin can create a workout by choosing one of the ten activity types, then entering a title and description.
- [ ] The workout appears on its date with the correct activity icon and label.
- [ ] An admin who did not author a workout can still edit and delete it.
- [ ] A member sees no create, edit, or delete controls, and is redirected off those URLs.
- [ ] Deleting a workout asks for confirmation on web as well as native.
- [ ] Creating a workout produces no notification and no chat message.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Title plus free-text description only | A structured exercise sub-model (sets, reps, intervals) | Explicit founder call to keep it very simple; coaches already write plans as prose |
| Dated real weeks | A repeating weekly template | Training changes week to week; a template would need overriding constantly |
| Only today and future days on the current week | Show the whole week always | The screen answers "what am I doing", not "what did we do" |
| Any admin can edit any workout | Creator-only editing | Matches the calendar/race model; captains cover for each other |
| Explicit "Rest day" | Omit empty days | An empty day is ambiguous between "rest" and "not posted yet" |
| No completion tracking | Check off a workout as done | Explicitly out of scope; the club is not trying to build a training log |
| No notification on creation | Notify the club each time | A week of workouts would fire seven notifications for reference material |

## Open questions

- The original vision included a **race-specific workout plan** inside each race; it was never built. Is it still wanted, or has [Meet Information](06-races.md) absorbed the need?
- Routines are reachable from club chat's quick-nav menu but not from the club hub - should they also appear there?
- Should a whole week be copyable to the next week as a starting point?
- Should members be able to see which workout is "today" from the hub or a notification, rather than opening Routines?
