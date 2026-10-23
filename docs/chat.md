# Node chat

Every position has its own chat (milestone 4). The answer comes from an LLM, but every chess fact
in it should come from the fact sheet or from a tool call: the LLM explains, Stockfish decides.

## Flow

1. The Position tab's `NodeChat` (`web/src/components/NodeChat.tsx`) calls `chat.send` with the
   node and the question.
2. `chat.send` (mutation) checks the game is `ready`, finds or creates the node's thread (the
   `threads` table maps a node to an Agent thread id), saves the question, and schedules
   `chat.respond`.
3. `chat.respond` (action) builds the node's **fact sheet** (`chat.factSheet`), and streams a
   reply with the Agent component, saving deltas as they come in.
4. The browser reads the thread with `useUIMessages(api.chat.messages, …, { stream: true })`, so the
   reply appears as it's written. Tool calls show as small chips above the reply.

Threads, messages and stream deltas live in the Convex Agent component's own tables
(`@convex-dev/agent`, mounted in `convex.config.ts`), not in ours.

## Fact sheet

`FactSheet` and `renderFactSheet` live in `packages/chess-core/src/factSheet.ts`;
`chat.factSheet` fills one from the database. It holds:

- the FEN, the moves from the start, and where the node came from (`game`, `engine`, `user`);
- **board facts** read off the FEN by `boardFacts` (`chess-core/src/board.ts`): every piece's
  square, material in pawn units, check, and per side the pawn islands and the passed, isolated
  and doubled pawns;
- the move into the position with its classification, win-% lost, only-move and key-moment
  flags, and the engine's preferred move when the played move wasn't it;
- this position's saved engine lines, cut to `PROMPT_LINE_PLIES` (8);
- on the main line, **what was played next** (`CONTINUATION_PLIES`, 6) with the evaluation and
  verdict after each move, from the cache.

Per-move evaluations are only given for played moves. Along an engine line they barely move (each
move is the engine's choice), so annotating engine lines cost seconds of searching for little
information; that was tried and dropped.

The rendered sheet is appended to the system prompt on every reply. Milestone 6 adds detector
output to the same type.

## Tools

`web/convex/lib/chatTools.ts`:

| Tool | Input | Returns |
| --- | --- | --- |
| `play_moves` | `fen`, `moves[]` (SAN) | The line with move numbers, each resulting FEN, or the first illegal move and why |
| `evaluate` | `fen` | Score (White POV), White win %, depth, top 3 lines in SAN |

`evaluate` reads the shared `analyses` cache first. On a miss it calls the engine service at the
game pass's settings (`ANALYSIS_DEPTH`, `ANALYSIS_MULTIPV`) and saves the result, so tool
analyses and game analyses are interchangeable.

## Prompt

`INSTRUCTIONS` in `web/convex/chat.ts` holds the grounding rules from the design doc: name a
tactic, threat or evaluation only if the fact sheet or a tool shows it; check any move not in the
fact sheet with `play_moves`, then `evaluate`; never read the board from the FEN; say so when the
tools can't answer. It also asks the model to call its tools first and then write only the final
answer. Temperature 0.3, at most 6 steps per reply, the last 20 messages of the thread as context.

## Model

`web/convex/lib/llm.ts` is the only file that knows the provider. `LLM_PROVIDER` picks it:
`anthropic` (Claude, through the AI SDK's Anthropic provider and its native API) or, by default,
NVIDIA NIM through the AI SDK's OpenAI-compatible provider.

| Env var | Default | |
| --- | --- | --- |
| `LLM_PROVIDER` | NIM | `anthropic` for Claude |
| `ANTHROPIC_API_KEY` | | Required when `LLM_PROVIDER=anthropic` |
| `NVIDIA_API_KEY` | | Required for NIM, from build.nvidia.com |
| `LLM_MODEL` | `claude-opus-5-5` / `nvidia/nemotron-3-ultra-550b-a55b` | The provider's model id |
| `LLM_BASE_URL` | `https://integrate.api.nvidia.com/v1` | NIM path only: any OpenAI-compatible API |

Claude: current models reject sampling settings (no `temperature`); thinking is adaptive and
always on; `effort: 'medium'` is set explicitly; `fallbacks: 'default'` reruns a declined reply on a
fallback model. NIM: temperature 0.3.

**Tested 2026-10-22, same fact sheets and questions:** Claude Opus 5.5 checked lines with tools
and explained the actual idea correctly (28… Kc5: "the king belongs on e5, hitting the isolated
e4 pawn"; 28… Qc8: the 29. Qxc6! bxc6 30. Rxb8 trick), in 23–29 s. The NIM models below mixed
up sides, invented pieces, or skipped the tools.

On NIM, the model must return OpenAI-style `tool_calls`. Tested 2026-10-22
with one tool call each: Nemotron 3 Ultra ✓ (~13 s), GPT-OSS 20B ✓ (~3 s, smaller), GLM 5.3 ✓
(~70 s); DeepSeek V4.1 Flash ✗ (writes its raw tool tokens, `<｜DSML｜ calls>`, as text). Kimi
K2.6 and Nemotron 3 Super weren't available to our account. A full reply with two tool calls
takes 20–45 s on Nemotron 3 Ultra.

The reply shows only the text after the last tool call; text between calls is the model's working.
Reasoning arrives separately (`reasoning_content`) and isn't shown.

The AI SDK retries rate limits and server errors (NIM's free tier often returns 503
"overloaded") four times with backoff, and a reply is aborted after `REPLY_TIMEOUT_MS` (2 min).
If a reply still fails, the Agent marks it `failed` and the chat says the model is busy; the
cause is in `npx convex logs`.

## Versions

Agent v0.7 (AI SDK 7) needs Node 22. Until the development machine's Node is upgraded, the repo
pins `@convex-dev/agent` 0.6 with AI SDK 6 (`ai` 6, `@ai-sdk/openai-compatible` 2). Upgrade them
together; see the agent's `MIGRATION.md`.
