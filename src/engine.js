/* The virtual machine knows nothing about Canvas or the page. */
class Instruction {
    constructor(op, a = 0, b = 0) {
        this.op = op;
        this.a = a;
        this.b = b;
    }
}

class Bot {
    constructor(name, pc) {
        this.name = name;
        this.pc = pc;
        this.alive = true;
    }
}

const OPCODES = new Set(['DAT', 'MOV', 'ADD', 'SUB', 'JMP']);

// Numeric, relative assembly. Semicolon starts a comment; labels are not supported.
function parseProgram(source) {
    const program = [];
    source.split(/\r?\n/).forEach((line, index) => {
        const code = line.split(';')[0].trim();
        if (!code) return;
        const fields = code.toUpperCase().split(/\s+/);
        if (fields.length !== 3 || !OPCODES.has(fields[0])) {
            throw new Error(`Line ${index + 1}: expected OPCODE a b (DAT, MOV, ADD, SUB, JMP).`);
        }
        if (!fields.slice(1).every(value => /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value)))) {
            throw new Error(`Line ${index + 1}: operands must be safe integers.`);
        }
        program.push(new Instruction(fields[0], Number(fields[1]), Number(fields[2])));
    });
    if (!program.length || program.length > 128) {
        throw new Error('A bot needs 1–128 instructions.');
    }
    return program;
}

class Executor {
    constructor(memory) {
        this.memory = memory;
        this.steps = 0;
        this.handlers = new Map([
            ['DAT', this.executeDAT], ['MOV', this.executeMOV],
            ['ADD', this.executeADD], ['SUB', this.executeSUB],
            ['JMP', this.executeJMP]
        ]);
    }

    wrap(address) {
        return ((address % this.memory.length) + this.memory.length) % this.memory.length;
    }

    step(bot) {
        if (!bot.alive) return null;
        const pc = this.wrap(bot.pc);
        const instruction = { ...this.memory[pc] };
        const handler = this.handlers.get(instruction.op);
        this.lastWrite = null;
        let fault = null;
        if (!handler) {
            bot.alive = false;
            fault = `Invalid opcode ${instruction.op}`;
        } else {
            bot.pc = this.wrap(handler.call(this, instruction, bot, pc));
        }
        this.steps++;
        return { oldPC: pc, newPC: bot.pc, instruction, write: this.lastWrite, fault };
    }

    // One write path gives the UI a precise event, including writes of identical data.
    write(address, instruction) {
        const before = { ...this.memory[address] };
        this.memory[address] = new Instruction(instruction.op, instruction.a, instruction.b);
        this.lastWrite = { address, before, after: { ...this.memory[address] } };
    }

    executeDAT(instruction, bot, pc) {
        bot.alive = false;
        return pc;
    }

    executeMOV(instruction, bot, pc) {
        this.write(this.wrap(pc + this.wrap(instruction.b)), this.memory[this.wrap(pc + this.wrap(instruction.a))]);
        return pc + 1;
    }

    arithmetic(instruction, bot, pc, sign) {
        const address = this.wrap(pc + this.wrap(instruction.b));
        const target = this.memory[address];
        const b = target.b + sign * instruction.a;
        // Stop a bot rather than silently losing integer precision.
        if (!Number.isSafeInteger(b)) {
            bot.alive = false;
            return pc;
        }
        this.write(address, { ...target, b });
        return pc + 1;
    }

    executeADD(instruction, bot, pc) { return this.arithmetic(instruction, bot, pc, 1); }
    executeSUB(instruction, bot, pc) { return this.arithmetic(instruction, bot, pc, -1); }
    executeJMP(instruction, bot, pc) { return pc + this.wrap(instruction.a); }
}

class Game {
    constructor(blueProgram, orangeProgram, turnLimit = 10000) {
        this.memorySize = 256;
        if (!Number.isInteger(turnLimit) || turnLimit < 1) throw new Error('Invalid turn limit.');
        this.turnLimit = turnLimit;
        this.originalPrograms = [blueProgram, orangeProgram].map(program => {
            if (!Array.isArray(program) || !program.length || program.length > 128) {
                throw new Error('Each program must contain 1–128 instructions.');
            }
            return program.map(instruction => {
                if (!OPCODES.has(instruction.op) || !Number.isSafeInteger(instruction.a) || !Number.isSafeInteger(instruction.b)) {
                    throw new Error('Invalid instruction.');
                }
                return new Instruction(instruction.op, instruction.a, instruction.b);
            });
        });
        this.reset();
    }

    reset() {
        this.memory = Array.from({ length: this.memorySize }, () => new Instruction('DAT'));
        this.executor = new Executor(this.memory);
        this.bots = [];
        this.owners = Array(this.memorySize).fill(null);
        this.lastWrittenTurn = Array(this.memorySize).fill(null);
        this.writes = [0, 0];
        this.currentBotIndex = 0;
        this.status = 'ready';
        this.winner = null;
        this.finishReason = null;
        this.lastEvent = null;
        this.loadProgram(this.originalPrograms[0], 0, 'Blue');
        this.loadProgram(this.originalPrograms[1], 128, 'Orange');
    }

    loadProgram(program, startAddress, name) {
        const owner = this.bots.length;
        const start = this.executor.wrap(startAddress);
        program.forEach((instruction, index) => {
            const address = this.executor.wrap(start + index);
            this.memory[address] = new Instruction(instruction.op, instruction.a, instruction.b);
            this.owners[address] = owner;
        });
        const bot = new Bot(name, start);
        this.bots.push(bot);
        return bot;
    }

    start() { if (this.status !== 'finished') this.status = 'running'; }
    pause() { if (this.status === 'running') this.status = 'paused'; }
    finish(winner, reason) {
        this.status = 'finished';
        this.winner = winner;
        this.finishReason = reason;
    }

    step() {
        if (this.status === 'finished') return null;
        const botIndex = this.currentBotIndex;
        const bot = this.bots[botIndex];
        const execution = this.executor.step(bot);
        if (execution.write) {
            const address = execution.write.address;
            this.owners[address] = botIndex;
            this.lastWrittenTurn[address] = this.executor.steps;
            this.writes[botIndex]++;
        }
        if (!bot.alive) this.finish(this.bots[1 - botIndex], 'death');
        else if (this.executor.steps >= this.turnLimit) this.finish(null, 'turn-limit');
        else this.currentBotIndex = 1 - botIndex;

        this.lastEvent = {
            ...execution, turn: this.executor.steps, botIndex, botName: bot.name,
            alive: bot.alive, status: this.status,
            winner: this.winner?.name ?? null, finishReason: this.finishReason
        };
        return this.lastEvent;
    }
}

// Lets Node test the same engine that the browser runs. No build step required.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Instruction, Bot, Executor, Game, parseProgram };
}
