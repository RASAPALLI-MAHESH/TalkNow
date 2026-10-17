# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

People who want a private one-to-one messenger. They find each other by username, connect through a follow request that the other person accepts, and then chat. They use it on their phones, many times a day, in short sessions.

## Product Purpose

TalkNow is an end-to-end encrypted messenger. Only the two phones in a chat can read its messages: the server, its database, backups, logs and push providers only see ciphertext. Success is a messenger that feels as effortless as the big ones while being honest about what it protects.

## Positioning

Signal-protocol encryption (X3DH + Double Ratchet) in a messenger where contact is consent-based: you can only chat with an accepted connection. Safety numbers and QR verification are first-class, and a security-code change pauses sending until the user acknowledges it.

## Operating Context

- Expo / React Native 0.81 app (`expo ~54`), shipped to iOS and Android from one codebase; a web build exists through react-native-web but is not a product surface (the encrypted store needs SQLCipher, which has no web build).
- Requires an EAS development or production build; Expo Go cannot run it.
- Express + MongoDB backend in `backend/`; realtime over a WebSocket at `/ws`.

## Capabilities and Constraints

- Auth: username + password login, email OTP signup, profile setup (photo + username), password setup, forgot/reset password.
- Chats list with local search over chats and global search over users; follow / request / accept / connected relationship states.
- Chat room: encrypted text messages, delivery and read receipts, failed-send retry, undecryptable and identity-changed notices, safety number with QR scan.
- Contact info, full profile (name, bio, hero card designed in an editor, four social links, up to eight custom links), Settings (own profile, blocked accounts, privacy policy, terms, delete account, log out).
- Notifications: activity, follow requests, all connections.
- Safety: report and block from profiles and contact info.
- There is no presence system: the app does not know whether a contact is online. It must not show online status.
- Metadata (who talks to whom, when, message length, IP) is not hidden; copy must not claim otherwise.
- Android: system Back, edge-to-edge window insets, ripple feedback and 48 dp touch targets still apply, even though Android ships the same Apple-inspired design language as iOS.
- Light and dark appearance are both first-class (`userInterfaceStyle: automatic`).

## Brand Commitments

- Name: TalkNow.
- Purple is the brand. The core values in use today are `#6733d0` (primary), `#4c1f9e` / `#5126a6` (pressed and deep), `#ede6ff` / `#e9e2ff` (soft tints), `#f8f5ff` (tinted ground), `#710b8d` (wordmark plum), `#350d81` (avatar initials) and ink `#1a1a2e`. They must be preserved; other hues found in code (onboarding teal, profile navy and sage) are drift, confirmed by the owner on 2026-10-18.
- Design language: Apple-inspired Liquid Glass (clarity, restraint, material depth, fluid motion), applied to TalkNow's own palette, not Apple's blue.

## Evidence on Hand

- App icon and splash assets in `assets/images/`.
- No testimonials, metrics, press or customer claims exist; none may be invented.
- The encryption protocol has not had an independent audit (README); UI copy must not imply one.

## Product Principles

1. Privacy you can see: encryption state, verification and failures are always visible and plainly worded.
2. Consent before contact: connection state is clear at every point where someone could reach another person.
3. Familiar first: a fluent messenger user should know where everything is without learning anything.
4. Honest interface: never show a state the system does not know (presence, typing, delivery it has not confirmed).

## Accessibility & Inclusion

- Text and controls meet WCAG AA contrast in light and dark.
- Touch targets are at least 44 pt (iOS) and 48 dp (Android).
- Motion respects Reduce Motion, and translucency respects Reduce Transparency.
