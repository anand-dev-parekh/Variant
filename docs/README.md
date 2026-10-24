# Variant technical docs

How the Chess Explorer prototype works, for anyone (human or agent) changing it. The root
[README](../README.md) is the quick start; these pages are the detail.

| Page | Read it when you want to know… |
| --- | --- |
| [Architecture](architecture.md) | What the pieces are, how a game flows through them, and the rules they follow |
| [Data model](data-model.md) | The Convex tables, how the tree is stored, and how analyses are cached |
| [Analysis pipeline](analysis-pipeline.md) | What happens between "Analyze game" and a finished tree |
| [Move classification](move-classification.md) | How a move becomes best / inaccuracy / mistake / blunder, and what "critical" means |
| [Engines](engines.md) | The three places Stockfish runs, the engine service API, and deploying it |
| [Node chat](chat.md) | How a position's chat works: fact sheet, tools, prompt, and the LLM provider |
| [Accounts](accounts.md) | Sign-in, who can see and change a game, share links, importing from Lichess / Chess.com |
| [Frontend](frontend.md) | Pages, the board/tree/side-panel view, tree folding and layout, theming |
| [Development](development.md) | Setup, commands, environment variables, tests, and known machine quirks |
| [Decisions](decisions.md) | Why things are the way they are, with the alternatives we rejected |

The product spec is the design doc (*Chess Explorer — Prototype Design Doc*), which these pages
implement. Milestone status lives in the root README.

## Keeping these current

Update the page that covers your change in the same commit. If you change a number that appears
here (thresholds, depths, limits), the code is the source of truth: each page names the constant
and file so it can be checked.
