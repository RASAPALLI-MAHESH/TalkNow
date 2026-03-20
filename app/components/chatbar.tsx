export type ChatListItem = {
  id: string;
  name: string;
  profilePicture?: string;
  lastMessage: string;
  Date: string;
};

// Global search rows are username-only.
export type GlobalChatListItem = {
  id: string;
  name: string;
  profilePicture?: string;
};

// Simple in-memory chat list used by ChatsScreen.
// (Replace with real backend data later.)
const ChatBar: ChatListItem[] = [
  //real data will come from backend, this is just for testing
];

export default ChatBar;