class Instruction{
    constructor(op, a, b){
        this.op = op;
        this.a = a;
        this.b = b;
    }
};

class Bot{
    constructor(name, pc){
        this.name = name;
        this.pc = pc;
        this.alive = true; 
    };
};

class Executor {
    constructor(memory) {
        this.memory = memory;
        this.steps = 0;

        this.handlers = new Map([
            ["DAT", this.executeDAT],
            ["MOV", this.executeMOV],
            ["ADD", this.executeADD],
            ["JMP", this.executeJMP],
            ["SUB", this.executeSUB]
        ]);
    }

    wrap(address) {
        return ((address % this.memory.length)
            + this.memory.length) % this.memory.length;
    }

    step(bot) {
        if (!bot.alive) return;

        const pc = this.wrap(bot.pc);

        const instruction = { ...this.memory[pc] };

        const handler = this.handlers.get(instruction.op);

        if (!handler) {
            throw new Error(`Unknown opcode: ${instruction.op}`);
        }

        const nextPC = handler.call(this, instruction, bot, pc);

        bot.pc = this.wrap(nextPC);
        this.steps++;
    }

    executeDAT(instruction, bot, pc) {
        bot.alive = false;
        return pc;
    }

    executeMOV(instruction, bot, pc){
        let destAddr = this.wrap(instruction.b + pc);
        let srcAddr = this.wrap(instruction.a + pc);
        this.memory[destAddr] = { ...this.memory[srcAddr] };
        return pc + 1;
    }

    executeADD(instruction, bot, pc){
        const destAddr = this.wrap(pc + instruction.b);
        this.memory[destAddr].b += instruction.a;
        return pc+1;
    }

    executeSUB(instruction, bot, pc){
        const destAddr = this.wrap(pc + instruction.b);
        this.memory[destAddr].b -= instruction.a;
        return pc + 1;
    }

    executeJMP(instruction, bot, pc){
        return pc + instruction.a;
    }
};

class Game {
    constructor(blueProgram, orangeProgram, turnLimit = 10000) {
        this.memorySize = 256;

        if (!Number.isInteger(turnLimit) || turnLimit < 1) {
            throw new Error("Turn limit must be a positive integer.");
        }

        this.turnLimit = turnLimit;

        // Preserve independent originals so reset restores both programs.
        this.originalPrograms = [blueProgram, orangeProgram].map(
            (program) => {
                if (!Array.isArray(program) ||
                    program.length < 1 ||
                    program.length > 128) {
                    throw new Error(
                        "Each program must contain 1–128 instructions."
                    );
                }

                return program.map(
                    (instruction) => new Instruction(
                        instruction.op,
                        instruction.a,
                        instruction.b
                    )
                );
            }
        );

        this.reset();
    }

    reset() {
        this.memory = Array.from(
            { length: this.memorySize },
            () => new Instruction("DAT", 0, 0)
        );

        this.executor = new Executor(this.memory);

        this.bots = [];
        this.currentBotIndex = 0;
        this.status = "ready";
        this.winner = null;
        this.finishReason = null;

        this.loadProgram(this.originalPrograms[0], 0, "Blue");
        this.loadProgram(this.originalPrograms[1], 128, "Orange");
    }

    loadProgram(program, startAddress, name) {
        const start = this.executor.wrap(startAddress);

        program.forEach((instruction, index) => {
            const address = this.executor.wrap(start + index);

            this.memory[address] = new Instruction(
                instruction.op,
                instruction.a,
                instruction.b
            );
        });

        const bot = new Bot(name, start);
        this.bots.push(bot);

        return bot;
    }

    start() {
        if (this.status !== "finished") {
            this.status = "running";
        }
    }

    pause() {
        if (this.status === "running") {
            this.status = "paused";
        }
    }

    finish(winner, reason) {
        this.status = "finished";
        this.winner = winner;
        this.finishReason = reason;
    }

    step() {
        if (this.status === "finished") {
            return null;
        }

        const botIndex = this.currentBotIndex;
        const bot = this.bots[botIndex];
        const oldPC = this.executor.wrap(bot.pc);

        const instruction = { ...this.memory[oldPC] };

        this.executor.step(bot);

        if (!bot.alive) {
            const opponent = this.bots[1 - botIndex];
            this.finish(opponent, "death");
        } else if (this.executor.steps >= this.turnLimit) {
            this.finish(null, "turn-limit");
        } else {
            this.currentBotIndex = 1 - botIndex;
        }

        return {
            turn: this.executor.steps,
            botName: bot.name,
            oldPC,
            newPC: bot.pc,
            instruction,
            alive: bot.alive,
            status: this.status,
            winner: this.winner?.name ?? null,
            finishReason: this.finishReason
        };
    }
};

const blueProgram = [
    new Instruction("MOV", 2, 128),
    new Instruction("JMP", -1, 0),
    new Instruction("DAT", 0, 0)
];

const orangeProgram = [
    new Instruction("JMP", 0, 0)
];

const game = new Game(blueProgram, orangeProgram);

console.log(game.step()); // Blue writes DAT into Orange's cell.
console.log(game.step()); // Orange executes DAT and dies.

console.log(game.status);        // "finished"
console.log(game.winner?.name);  // "Blue"
console.log(game.executor.steps); // 2

game.reset();

console.log(game.status);         // "ready"
console.log(game.memory[128].op); // "JMP": original program restored
console.log(game.executor.steps); // 0

