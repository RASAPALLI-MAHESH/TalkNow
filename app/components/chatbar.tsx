export type ChatListItem = {
  id: string;
  name: string;
  lastMessage: string;
  Date: string;
};

// Simple in-memory chat list used by ChatsScreen.
// (Replace with real backend data later.)
const ChatBar: ChatListItem[] = [
  { id: '1', name: 'Mahesh', lastMessage: 'Hey! How are you?', Date: '2023-01-01' },
  { id: '2', name: 'TalkNow Team', lastMessage: 'Your OTP feature is live ✅', Date: '2023-01-02' },
  { id: '3', name: 'Support', lastMessage: 'Let us know if you need help.', Date: '2023-01-03' },
];

export default ChatBar;