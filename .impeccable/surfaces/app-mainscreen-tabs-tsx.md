---
version: 1
slug: "app-mainscreen-tabs-tsx"
primary_target: "app/MainScreen/tabs.tsx"
related_targets: ["app/MainScreen/mainTabs/ChatsScreen.tsx","app/components/chatroom.tsx"]
---

# TalkNow app shell: Liquid Glass refinement

## Scope and mode

Every signed-in and signed-out screen of the TalkNow mobile app (Expo, iOS + Android, one Apple-inspired language). Visitor mode: Operate. Build path: code-led (Operate surface).

## Audience, job, constraints

Phone users chatting one-to-one with accepted connections, many short sessions a day. Jobs: read and answer messages, find and connect with people, verify encryption, manage their profile and safety. Constraints: purple brand values preserved exactly (owner decision 2026-10-18); light and dark both first-class; real Liquid Glass via expo-glass-effect on iOS 26+, expo-blur on older iOS, near-opaque tinted fallback on Android and under Reduce Transparency; no invented presence or claims; all business logic, API calls and navigation routes unchanged.

## Direction contract

THESIS: Content sits on a calm, purple-tinted ground; only the navigation layer (tab capsule, navigation bars, composer, sheets, floating controls) is glass, and that glass is clear at rest and gathers material only when content scrolls beneath it. Refuses the web-ported messenger: opaque white headers, shadowed card stacks, a different palette on every screen.

OWN-WORLD: One tint, #6733d0, for every interactive and selected state; pressed #4c1f9e; soft tint #ede6ff; ground #f8f5ff (dark: deep violet-black derived from ink #1a1a2e); plain surfaces white (dark: raised violet-grey); wordmark plum #710b8d only on the brand title; ink #1a1a2e; purple-tinted hairline separators. System type on the iOS text-style scale. Pill controls, 20 pt bubbles with a 6 pt tail corner, grouped inset lists at 16 pt radius, Ionicons in one outline/filled pairing.

STORY: Open the app and see who wrote, what, and when, with unread state at a glance; tap into a conversation whose encryption state is always visible; verification, safety and profile are one tap away and plainly worded.

FIRST VIEWPORT: Chats. Large "TalkNow" wordmark top left, glass bell button top right; a search field and a Chats / Users segmented control beneath; chat rows (52 pt avatar, name, time, one-line preview, tint unread badge) filling the screen and scrolling under the bars; a floating glass tab capsule bottom centre. The primary action is tapping a chat row.

FORM: Brief-pinned direction (Apple Liquid Glass on TalkNow's purple), not rolled; signature interaction is scroll-edge glass (bar material and hairline interpolate in with scroll offset) plus the tab capsule's sliding selection lens; motion grammar is springs for selection and press, 200-250 ms ease-out fades, new messages rise 8 pt as they fade in, crossfade or instant under Reduce Motion. seed: none (brief-pinned direction; no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Native capture (Simulator / emulator) is unavailable on this machine; web renders of auth screens and a dev-only component gallery are the strongest available evidence.
