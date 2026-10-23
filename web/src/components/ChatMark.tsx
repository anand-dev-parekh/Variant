/** Marks a move the player has asked the coach about. */
export function ChatMark() {
  return (
    <svg className="chat-mark" viewBox="0 0 16 16" width="13" height="13" role="img" aria-label="Has a chat">
      <title>You asked about this move</title>
      <path d="M2.5 2h11A1.5 1.5 0 0 1 15 3.5v7a1.5 1.5 0 0 1-1.5 1.5H7l-3.2 2.6a.5.5 0 0 1-.8-.4V12h-.5A1.5 1.5 0 0 1 1 10.5v-7A1.5 1.5 0 0 1 2.5 2Z" />
    </svg>
  );
}
