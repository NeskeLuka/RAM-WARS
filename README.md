# RAM WARS

**Two programs. One memory. No protection.**

A browser game where two tiny assembly programs fight by overwriting each other's instructions. Inspired by Core War, with a deliberately smaller custom instruction set. Built around the student's JavaScript `Instruction`, `Bot`, `Executor`, and `Game` design.

## Play

Unzip this project and open **index.html** in a modern browser. No installation, external fonts, packages, server, or build step is required. Keep `style.css` and `src/` alongside the HTML file.

Alternatively, run `python -m http.server 8000` from this directory and visit http://localhost:8000. On Windows, `py -m http.server 8000` may be the appropriate command.

1. Choose presets or edit either program. Blue starts at address 0; Orange at 128.
2. Click **Reset / apply** to load edited programs.
3. Click **Run battle**, or use **Step** to execute exactly one instruction.
4. Click a memory cell to inspect its current instruction, owner, last write and relative destinations.
5. Modify a stride or jump and replay. Reset reloads the source editors, not the corrupted memory.

Shortcuts outside input controls: **Space** run/pause, **N** step, **R** reset. Focus the arena and use arrow keys to inspect cells. The numeric inspector also provides direct access. Switching away from the tab pauses a running game.

## Rules

- 256 circular instruction cells; two programs of 1–128 instructions each.
- One instruction per turn, alternating Blue then Orange. Blue has a first-move advantage; fixed placements make matches reproducible.
- Executing `DAT` kills the bot immediately. Copying a `DAT` instruction does not kill anyone.
- Death on turn 10,000 still produces a winner. Otherwise two surviving bots draw at the limit.
- An instruction is snapshotted before it executes, so self-modification cannot change the current instruction halfway through.
- A memory color means initial loader / most recent writer, not health or territory.

Every source line is `OPCODE a b`, with two signed integer operands. Semicolon starts a comment. Blank lines are ignored. There are no labels or indirect addressing modes.

| Opcode | Behavior |
|---|---|
| `DAT a b` | Kill the executing bot; leave PC unchanged. |
| `MOV a b` | Independently copy the whole instruction at PC+a to PC+b; advance PC by 1. |
| `ADD a b` | Add literal a to the b field of the instruction at PC+b; advance PC by 1. |
| `SUB a b` | Subtract literal a from that b field; advance PC by 1. |
| `JMP a b` | Jump to PC+a; ignore b. |

Addresses wrap; stored operands do not. Operands must be JavaScript safe integers. Arithmetic outside that range eliminates the bot to avoid silent precision loss. An invalid runtime opcode also eliminates the bot; invalid source is rejected before starting.

## First bot: a bomber

```text
MOV 3 8
ADD 5 -1
JMP -2 0
DAT 0 0
```

The first instruction copies DAT into a target. ADD changes the previous MOV's destination by five. JMP returns to the beginning. Try changing five to four, seven, or a negative stride. Strategies can destroy their own code; no bot is guaranteed to survive.

Presets: Bomber, Imp (self-copying `MOV 0 1`), Reverse bomber, Sniper, Loop. Try Sniper vs Loop to watch a two-turn kill, or Loop vs Loop at maximum speed to see a draw.

## Source map

| File | Responsibility |
|---|---|
| `src/engine.js` | Instruction data, bots, parser, opcode handlers, match lifecycle and write events |
| `src/presets.js` | Editable sample programs and descriptions |
| `src/app.js` | Editor validation, controls, animation scheduling, Canvas, inspector and bounded trace |
| `style.css` | Responsive interface |
| `index.html` | Page structure and ordered script loading |
| `tests/engine.test.js` | Node's built-in tests for memory semantics and battle rules |

The browser uses ordered deferred classic scripts so the project also runs directly from disk. `engine.js` additionally exports its classes to Node for testing. No dependencies are needed.

Run engine tests with Node 18 or newer:

```bash
node --test tests/engine.test.js
```

The executor returns an event for each instruction, including any memory write. Game attributes writes to a bot. The UI consumes events rather than changing simulation memory. At high speeds multiple instructions execute per animation frame; each frame is bounded to keep controls responsive. The trace retains the latest 60 turns.

Validation for this delivery: all nine engine tests passed. A lightweight DOM harness also exercised controls, source validation, inspection, a two-turn win and a scheduled 10,000-turn draw. An actual browser was unavailable in the build environment, so Canvas appearance and responsive layout have not been visually verified.

## Keep building it yourself

Add a new opcode by implementing and registering a handler in Executor, adding it to OPCODES and updating the inspector/manual. Good next projects: JNZ, seeded random non-overlapping placement, tournament scoring with swapped starting order, or execution replay.

To publish on GitHub Pages, put these files in a repository and configure Pages to serve the root of your chosen branch. No bundler is needed. This project has not been published automatically.
