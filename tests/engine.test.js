const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Instruction: I, Bot, Executor, Game, parseProgram } = require('../src/engine.js');
const parse = parseProgram;
const makeMemory = () => Array.from({ length: 16 }, () => new I('DAT'));

test('MOV wraps, advances and copies independently, with an accurate write event', () => {
    const memory = makeMemory();
    memory[15] = new I('MOV', 1, 2);
    memory[0] = new I('DAT', 7, 9);
    const bot = new Bot('Blue', 15);
    const event = new Executor(memory).step(bot);
    assert.deepEqual(memory[1], new I('DAT', 7, 9));
    assert.notEqual(memory[0], memory[1]);
    assert.equal(bot.pc, 0);
    assert.equal(event.write.address, 1);
    memory[0].a = 99;
    assert.equal(memory[1].a, 7);
});

test('arithmetic modifies only b and jumps use relative negative addresses', () => {
    const memory = makeMemory();
    memory[0] = new I('MOV', 3, 8);
    memory[1] = new I('ADD', 4, -1);
    memory[2] = new I('SUB', 3, -2);
    memory[3] = new I('JMP', -4, 0);
    const bot = new Bot('Blue', 1);
    const executor = new Executor(memory);
    executor.step(bot);
    assert.deepEqual(memory[0], new I('MOV', 3, 12));
    executor.step(bot);
    assert.deepEqual(memory[0], new I('MOV', 3, 9));
    executor.step(bot);
    assert.equal(bot.pc, 15);
});

test('a self-overwriting MOV still advances from its original PC', () => {
    const memory = makeMemory();
    memory[0] = new I('MOV', 1, 0);
    const bot = new Bot('Blue', 0);
    new Executor(memory).step(bot);
    assert.equal(memory[0].op, 'DAT');
    assert.equal(bot.pc, 1);
    assert.equal(bot.alive, true);
});

test('attack wins on turn two; death beats the limit; finished games are inert', () => {
    const game = new Game(parse('MOV 2 128\nJMP -1 0\nDAT 0 0'), parse('JMP 0 0'), 2);
    game.step();
    assert.equal(game.owners[128], 0);
    assert.equal(game.writes[0], 1);
    const event = game.step();
    assert.equal(event.winner, 'Blue');
    assert.equal(game.finishReason, 'death');
    assert.equal(game.step(), null);
    assert.equal(game.executor.steps, 2);
    game.reset();
    assert.equal(game.memory[128].op, 'JMP');
    assert.equal(game.owners[128], 1);
    assert.equal(game.executor.steps, 0);
    assert.equal(game.executor.memory, game.memory);
});

test('alternation, pause and bounded draw', () => {
    const game = new Game(parse('JMP 0 0'), parse('JMP 0 0'), 10);
    game.start(); game.pause();
    assert.equal(game.status, 'paused');
    const names = [];
    while (game.status !== 'finished') names.push(game.step().botName);
    assert.deepEqual(names.slice(0, 4), ['Blue', 'Orange', 'Blue', 'Orange']);
    assert.equal(game.winner, null);
    assert.equal(game.finishReason, 'turn-limit');
    assert.equal(game.executor.steps, 10);
});

test('DAT is fatal and dead bots do not execute again', () => {
    const memory = makeMemory();
    const bot = new Bot('Blue', 4);
    const executor = new Executor(memory);
    executor.step(bot);
    assert.equal(bot.alive, false);
    assert.equal(bot.pc, 4);
    assert.equal(executor.step(bot), null);
    assert.equal(executor.steps, 1);
    const game = new Game(parse('DAT 0 0'), parse('JMP 0 0'));
    assert.equal(game.step().winner, 'Orange');
});

test('parser accepts comments and lowercase; rejects malformed source', () => {
    assert.deepEqual(parse('; comment\nmov -1 +2 ; copy\n'), [new I('MOV', -1, 2)]);
    for (const source of ['', 'NOP 0 0', 'MOV 1', 'DAT 1.2 0', 'DAT 1e2 0', 'DAT 99999999999999999 0']) {
        assert.throws(() => parse(source));
    }
});

test('original programs remain independent through edits and reset', () => {
    const program = parse('JMP 0 0');
    const game = new Game(program, program);
    program[0].op = 'DAT';
    game.memory[0].a = 20;
    game.reset();
    assert.deepEqual(game.memory[0], new I('JMP', 0, 0));
    assert.notEqual(game.memory[0], game.memory[128]);
});

test('large operands wrap before PC addition; unsafe arithmetic eliminates the bot', () => {
    const memory = makeMemory();
    memory[5] = new I('MOV', Number.MAX_SAFE_INTEGER, 1);
    memory[4] = new I('DAT', 7, 9);
    const bot = new Bot('Blue', 5);
    const executor = new Executor(memory);
    executor.step(bot);
    assert.deepEqual(memory[6], new I('DAT', 7, 9));
    memory[6] = new I('ADD', Number.MAX_SAFE_INTEGER, 1);
    memory[7] = new I('DAT', 0, 1);
    executor.step(bot);
    assert.equal(bot.alive, false);
    assert.equal(memory[7].b, 1);
});
