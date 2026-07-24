# Profile & Account

**Status:** Shipped

Sign-up, sign-in, the member profile others see, and self-service account deletion.

## Purpose

Give every member a lightweight identity that makes them recognisable across a club's chats and rosters, and give them full control over their own account without needing to email anyone.

## User stories

- As a new user, I want to sign up with an email and password so that I can get into my club's chat.
- As a returning user, I want to stay signed in so that I do not have to log in every time I open the app.
- As a member, I want a photo and a name so that people recognise me in chat and on rosters.
- As a member, I want to add a bio, city, school, and date of birth so that new teammates know who I am.
- As a member, I want to see every club I am in from my profile so that I can jump between them.
- As a member, I want to open another member's profile from chat or a roster so that I can put a name to an avatar.
- As a user, I want to read the privacy policy and terms before I sign up so that I know what I am agreeing to.
- As a user, I want to delete my account myself so that I am not dependent on an admin.

## Scope

**In scope**

- Email/password sign-up and sign-in, with session persistence
- Profile fields: avatar, full name, bio, city, date of birth, school
- Self-only editing
- "Your clubs" list on the profile, tappable into each club
- Read-only member profile cards, reachable from chat and every roster
- In-app Privacy Policy and Terms, reachable both signed out and signed in
- A consent line at sign-up linking to both documents
- Sign out
- Self-service account deletion

**Out of scope**

| Not in scope | Why |
|---|---|
| Social sign-in (Apple, Google) | Not built |
| Two-factor authentication | Not built |
| Username / handle separate from full name | Not needed; clubs are small and use real names |
| Password change or reset flow inside the app | Handled by the auth provider's own flow |
| Blocking or muting another member | Not built - see [Chat](03-chat.md) moderation |
| Cross-club activity history on a profile | Not requested |
| Public profiles outside a shared club | Deliberate - profiles are only visible to people you share a club with |

## Behaviour rules

1. **Sign-up takes an email and a password.** The consent line below the password field links to the Privacy Policy and the Terms.
2. **Sign-up handles the email-confirmation-required case explicitly** - the user is told to confirm rather than left on a silent failure.
3. **The session persists across app restarts.** A returning user lands in the app, not on sign-in.
4. **An unauthenticated user is always routed to sign-in**; an authenticated one is always routed into the app, including from the bare entry point.
5. **A profile is self-editable only.** No one can edit another member's profile, including an Owner.
6. **The avatar is uploaded from the profile screen** via a pencil overlay on the avatar itself.
7. **"Your clubs" lists the user's clubs on their own profile**, capped with a searchable "+N more" popup when there are many, and each entry opens that club.
8. **Another member's profile is read-only** and is reached by tapping their avatar in chat or their row on any roster.
9. **Privacy Policy and Terms are readable both signed out and signed in.**
10. **Signing out returns the user to sign-in** and clears the session.
11. **Account deletion is permanent and self-service.** It anonymises the user's profile and permanently blocks future sign-in for that account. It is not reversible and does not require an admin.
12. **Deleting an account does not delete the content they posted** - their messages remain in the conversations they belong to, unattributed, so history stays readable.
13. **Deletion is confirmation-gated** on every platform, including web.

## Permissions

| Action | Self | Club Owner/Admin | Fellow club member | Anyone else |
|---|---|---|---|---|
| Sign up / sign in | ✅ | - | - | ✅ |
| View own profile | ✅ | - | - | ❌ |
| Edit own profile and avatar | ✅ | ❌ | ❌ | ❌ |
| View another member's profile card | - | ✅ | ✅ | ❌ |
| See a member's clubs list | ✅ (own) | ❌ | ❌ | ❌ |
| Read Privacy Policy / Terms | ✅ | ✅ | ✅ | ✅ |
| Sign out | ✅ | ❌ | ❌ | ❌ |
| Delete account | ✅ | ❌ | ❌ | ❌ |

## States & edge cases

| State | Behaviour |
|---|---|
| Signed out, deep link into the app | Routed to sign-in first, then on to the target |
| Email confirmation required | An explicit "confirm your email" state, not a silent failure |
| Sign-in fails | Inline error, form retains its input |
| Profile with no avatar | A letter-initial placeholder, used consistently in chat and rosters |
| Profile with no bio/city/school | Those rows are simply absent |
| Avatar upload fails | Surfaced; the old avatar is retained |
| User belongs to no clubs | "Your clubs" shows an empty state |
| User belongs to many clubs | Capped at three chips plus a searchable "+N more" popup |
| Deleted account's past messages | Remain in history, unattributed |
| Deleted account tries to sign in again | Sign-in is permanently blocked |
| Auth check hangs on a slow network | The app falls back to signed-out rather than hanging on a spinner |
| Offline | Cached session persists; data reads fail with the standard load-error state |

## Acceptance criteria

- [ ] A new user can sign up, and the consent line links to both legal documents.
- [ ] The Privacy Policy and Terms are readable before signing up and after signing in.
- [ ] A signed-in user reopening the app lands in the app, not on sign-in.
- [ ] A signed-out user opening any in-app URL is routed to sign-in.
- [ ] A user can set an avatar, name, bio, city, date of birth, and school, and the changes appear in chat and rosters.
- [ ] No user can edit another user's profile, including a club Owner.
- [ ] Tapping a member's avatar in chat opens their read-only profile card.
- [ ] "Your clubs" lists the user's clubs and opens each one.
- [ ] Signing out returns to sign-in and clears the session.
- [ ] Account deletion is confirmation-gated on web as well as native.
- [ ] After deletion, the account cannot sign in again.
- [ ] After deletion, the user's past messages remain in their conversations, unattributed.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Account deletion anonymises and permanently blocks sign-in | Hard-delete the user and everything they wrote | Deleting a member's messages would tear holes in every conversation they were part of |
| Deletion is self-service | Require an admin or a support request | An app store requirement and the right default; nobody should need permission to leave |
| Profiles are visible only to people you share a club with | Public profiles | Clubs are small and often include minors; there is no reason for cross-club visibility |
| Full name only, no handle | Add usernames | Clubs use real names; a second identifier is confusing on a roster |
| Legal documents shipped in-app in two reachable places | Link out to a website | Must be reachable before sign-up, and app stores expect in-app access |
| Session persists indefinitely | Expire sessions aggressively | This is a club chat, not a banking app; re-login friction would be constant |
| Auth check falls back to signed-out on timeout | Wait indefinitely | A hung check previously presented as an app that never loaded |

## Open questions

- Is a password reset flow needed inside the app, or is the provider's own email flow sufficient?
- Should date of birth be visible to fellow members, or is it collected for the club's records only?
- Should a user be able to export their own data before deleting?
- Do clubs with minors need parental-consent handling before a public release?
- Should social sign-in be added to reduce sign-up friction?
