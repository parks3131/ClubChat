// Content for the in-app Privacy Policy / Terms of Service screens
// (app/(auth)/privacy-policy.tsx, app/(auth)/terms.tsx, and their
// (tabs)/profile/legal/ counterparts, via the shared
// components/LegalDocument.tsx renderer).
//
// Drafted from ClubChat's actual data model and features (see SPEC.md
// section 2) rather than boilerplate — but this is a first draft, not
// legal advice. Have it reviewed by an actual lawyer before relying on
// it for a real public launch; it exists now to satisfy App Store/Google
// Play's submission-time requirement for a reachable Privacy Policy URL
// and in-app Terms.
export const LEGAL_LAST_UPDATED = "July 2026";

export interface LegalSection {
  heading: string;
  body: string;
}

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: "Overview",
    body: "ClubChat is an app for running/sports clubs to coordinate chat, calendars, workout plans, races/meets, and polls. This policy explains what information we collect, how we use it, and who can see it.",
  },
  {
    heading: "Information we collect",
    body: "Account information you provide: your name, email address, and password. Profile information you choose to add: bio, city, date of birth, school, and a profile photo. Content you create: chat messages, photos you post in chat, club/race/poll content, and reactions. Usage information: which clubs, races, and Eboard channels you're a member of, and your role (admin or member) in each. We do not currently use third-party analytics or advertising trackers.",
  },
  {
    heading: "How we use your information",
    body: "To operate the core features of the app: showing your name and photo next to messages you send, letting club admins manage membership, displaying calendar events and workout plans, and running polls. To let other members of your clubs find and contact you within the app. To enforce our Terms of Service, including acting on reports of objectionable content.",
  },
  {
    heading: "Who can see your information",
    body: "Your profile (name, photo, bio, city, date of birth, school) is visible to other authenticated users of the app. Your chat messages and photos are visible to other members of the specific club, race, or Eboard channel you posted them in — not to the whole app. Club admins can see the full member roster and pending join requests for clubs they administer. Eboard channels are private to club admins who are also Eboard members.",
  },
  {
    heading: "Data storage and security",
    body: "Your data is stored using Supabase (a hosted Postgres database, authentication, and file storage provider). Access to your data is controlled by database-level security rules scoped to your actual club/race/channel memberships — for example, a member of one club cannot read another club's private chat.",
  },
  {
    heading: "Data retention and account deletion",
    body: "You can delete your account at any time from Profile → Delete account. Deleting your account removes your personal information (name, photo, bio, city, date of birth, school) and permanently disables sign-in. Messages and content you previously posted remain visible to other members of the relevant club/race/channel, attributed to \"Deleted user\", so that ongoing conversations aren't disrupted for other members.",
  },
  {
    heading: "Children's privacy",
    body: "ClubChat is not directed at children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has created an account, contact us using the information below and we will delete it.",
  },
  {
    heading: "Your rights and choices",
    body: "You can view and edit most of your profile information at any time from Profile → Edit Profile. You can leave any club, race, or Eboard channel through that club's member management screen. You can delete your account entirely as described above.",
  },
  {
    heading: "Changes to this policy",
    body: "If we make material changes to this policy, we'll update the date below and, where appropriate, notify users in-app.",
  },
  {
    heading: "Contact us",
    body: "Questions about this policy? Contact the club/app administrator through the app, or reach out at the contact information provided by your club.",
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "Acceptance of terms",
    body: "By creating an account and using ClubChat, you agree to these Terms of Service and our Privacy Policy. If you don't agree, please don't use the app.",
  },
  {
    heading: "Description of service",
    body: "ClubChat provides club chat, calendars, weekly workout routines, races/meets with carpool coordination, an Eboard/council space for club admins, and polls, organized around clubs that you create or join.",
  },
  {
    heading: "Account registration and eligibility",
    body: "You must provide accurate information when creating an account and are responsible for keeping your password secure. You're responsible for activity that happens under your account.",
  },
  {
    heading: "Acceptable use",
    body: "Don't post content that is illegal, harassing, hateful, or that violates another person's privacy or rights. Don't impersonate another person or misrepresent your affiliation with a club. Don't use the app to send unsolicited spam. Club admins may remove members or content that violates a club's own rules, in addition to what's described below.",
  },
  {
    heading: "Content moderation",
    body: "You can report a message you believe violates these terms; club admins are notified and can remove the message. Any club admin can also delete a message directly, and any member can delete their own message. Deleted messages are replaced with a \"This message was deleted\" placeholder rather than being silently removed, so conversations stay coherent for other members.",
  },
  {
    heading: "Your content",
    body: "You retain ownership of the messages, photos, and other content you post. By posting content, you grant other members of the relevant club/race/channel (and ClubChat, as needed to operate the service) a license to store, display, and transmit that content within the app.",
  },
  {
    heading: "Club and race membership",
    body: "Clubs are created and administered by their own members — ClubChat does not vet or endorse any specific club. Club admins control who can join a club (open or request-based), and control access to that club's races, meets, and Eboard channel.",
  },
  {
    heading: "Termination",
    body: "You may delete your account at any time (see Privacy Policy). We may suspend or remove access for accounts that violate these terms.",
  },
  {
    heading: "Disclaimers",
    body: "ClubChat is provided \"as is\" without warranties of any kind. We are not responsible for the accuracy of workout plans, race logistics, or other content posted by club members — that content is created and managed by clubs themselves, not by us.",
  },
  {
    heading: "Changes to these terms",
    body: "We may update these terms from time to time. Continuing to use ClubChat after a change means you accept the updated terms.",
  },
  {
    heading: "Contact us",
    body: "Questions about these terms? Contact the club/app administrator through the app.",
  },
];
