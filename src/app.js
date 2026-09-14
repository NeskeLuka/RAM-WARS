/* DOM controls, animation scheduling and rendering stay outside the engine. */
(() => {
    const $ = id => document.getElementById(id);
    const sides = ['blue', 'orange'];
    const colors = ['#66b7ff', '#ff9c69'];
    const speeds = [1, 5, 20, 60, 150, 500, 1000];
    const canvas = $('arena');
    const ctx = canvas.getContext('2d');
    const format = instruction => `${instruction.op} ${instruction.a} ${instruction.b}`;
    const pad = (value, length = 3) => String(value).padStart(length, '0');
    let game;
    let selected = 0;
    let dirty = false;
    let accumulator = 0;
    let previousTime = performance.now();
    let trace = [];
    let flashes = Array(256).fill(0);

    function markDirty() {
        dirty = true;
        game?.pause();
        accumulator = 0;
        updateUI();
    }

    sides.forEach((side, index) => {
        for (const [key, preset] of Object.entries(PRESETS)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = preset.name;
            $(`${side}-preset`).append(option);
        }
        $(`${side}-preset`).value = index === 0 ? 'bomber' : 'imp';
        function choose() {
            const preset = PRESETS[$(`${side}-preset`).value];
            $(`${side}-code`).value = preset.code;
            $(`${side}-description`).textContent = preset.description;
            $(`${side}-error`).textContent = '';
        }
        choose();
        $(`${side}-preset`).addEventListener('change', () => { choose(); markDirty(); });
        $(`${side}-code`).addEventListener('input', () => {
            $(`${side}-description`).textContent = 'Custom program. Apply your edits to begin a new match.';
            markDirty();
        });
    });

    function reset() {
        game?.pause();
        const programs = [];
        let valid = true;
        sides.forEach(side => {
            try {
                programs.push(parseProgram($(`${side}-code`).value));
                $(`${side}-error`).textContent = '';
                $(`${side}-code`).setAttribute('aria-invalid', 'false');
            } catch (error) {
                valid = false;
                $(`${side}-error`).textContent = error.message;
                $(`${side}-code`).setAttribute('aria-invalid', 'true');
            }
        });
        if (!valid) { dirty = true; updateUI(); return; }
        game = new Game(programs[0], programs[1]);
        trace = [];
        flashes.fill(0);
        accumulator = 0;
        dirty = false;
        updateUI();
        renderTrace();
    }

    function executeTurn() {
        const event = game.step();
        if (!event) return;
        trace.unshift(event);
        if (trace.length > 60) trace.pop();
        if (event.write) flashes[event.write.address] = performance.now();
    }

    function toggleRun() {
        if (dirty || game.status === 'finished') return;
        if (game.status === 'running') game.pause();
        else game.start();
        accumulator = 0;
        previousTime = performance.now();
        updateUI();
    }

    function singleStep() {
        if (dirty || game.status === 'finished') return;
        game.pause();
        accumulator = 0;
        executeTurn();
        updateUI();
        renderTrace();
    }

    $('run').addEventListener('click', toggleRun);
    $('step').addEventListener('click', singleStep);
    $('reset').addEventListener('click', reset);
    $('speed').addEventListener('input', () => {
        accumulator = 0;
        $('speed-label').textContent = `${speeds[Number($('speed').value)]} turns/s`;
    });

    function inspect(address) {
        selected = Math.max(0, Math.min(255, Math.trunc(address)));
        $('cell-select').value = selected;
        updateInspector();
    }

    canvas.addEventListener('click', event => {
        const rect = canvas.getBoundingClientRect();
        const column = Math.min(15, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * 16)));
        const row = Math.min(15, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * 16)));
        inspect(row * 16 + column);
    });
    canvas.addEventListener('keydown', event => {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[event.key];
        if (offset !== undefined) { event.preventDefault(); inspect(game.executor.wrap(selected + offset)); }
    });
    $('cell-select').addEventListener('input', event => {
        if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) inspect(event.target.valueAsNumber);
    });
    document.addEventListener('keydown', event => {
        if (event.target.matches('textarea, input, select, button, a') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
        if (event.code === 'Space') { event.preventDefault(); toggleRun(); }
        if (event.key.toLowerCase() === 'n') singleStep();
        if (event.key.toLowerCase() === 'r') reset();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && game?.status === 'running') {
            game.pause();
            accumulator = 0;
            updateUI();
        }
    });

    function updateInspector() {
        if (!game) return;
        const instruction = game.memory[selected];
        const owner = game.owners[selected];
        const written = game.lastWrittenTurn[selected];
        const wrap = value => game.executor.wrap(value);
        const a = wrap(selected + wrap(instruction.a));
        const b = wrap(selected + wrap(instruction.b));
        $('cell-address').textContent = `@${pad(selected)}`;
        $('cell-instruction').textContent = format(instruction);
        $('cell-owner').textContent = owner === null ? 'Untouched' : `${game.bots[owner].name} · ${written === null ? 'loaded' : `turn ${written}`}`;
        $('cell-owner').style.color = owner === null ? '' : colors[owner];
        const descriptions = {
            DAT: 'A bot executing this cell dies. The operands are ignored.',
            MOV: `If executed here: copy all fields from @${pad(a)} into @${pad(b)}, then advance.`,
            ADD: `If executed here: add ${instruction.a} to the b field at @${pad(b)}, then advance.`,
            SUB: `If executed here: subtract ${instruction.a} from the b field at @${pad(b)}, then advance.`,
            JMP: `If executed here: jump to @${pad(a)}. The b operand is ignored.`
        };
        $('cell-explanation').textContent = descriptions[instruction.op] || 'Invalid instruction.';
        const pointers = game.bots.filter(bot => bot.pc === selected).map(bot => `${bot.name}${bot.alive ? '' : ' (dead)'}`);
        $('cell-pointers').textContent = pointers.length ? `Program counter: ${pointers.join(', ')}` : 'No program counter at this address.';
    }

    function updateUI() {
        if (!game) return;
        const finished = game.status === 'finished';
        $('status').textContent = game.status.toUpperCase();
        $('run').textContent = game.status === 'running' ? 'Ⅱ Pause' : game.status === 'paused' ? '▶ Resume' : '▶ Run battle';
        $('run').disabled = finished || dirty;
        $('step').disabled = finished || dirty;
        $('turn-counter').textContent = `TURN ${pad(game.executor.steps, 5)}`;
        $('match-message').textContent = finished
            ? game.winner ? `${game.winner.name} wins. ${game.bots.find(bot => !bot.alive).name} was eliminated.` : 'Draw. Both bots survived 10,000 turns.'
            : `Next: ${game.bots[game.currentBotIndex].name} @ ${pad(game.bots[game.currentBotIndex].pc)}. ${game.status === 'running' ? 'Battle in progress.' : 'Run the battle or advance one instruction.'}`;
        $('pending').textContent = dirty ? 'Unapplied edits. Use Reset / apply to load both programs.' : 'Space: run / pause · N: step · R: reset';
        $('pending').classList.toggle('dirty', dirty);
        sides.forEach((side, index) => {
            $(`${side}-pc`).textContent = pad(game.bots[index].pc);
            $(`${side}-writes`).textContent = game.writes[index].toLocaleString();
            $(`${side}-alive`).textContent = game.bots[index].alive ? 'ALIVE' : 'ELIMINATED';
        });
        updateInspector();
    }

    function renderTrace() {
        const container = $('trace');
        container.replaceChildren();
        if (!trace.length) {
            const empty = document.createElement('p');
            empty.className = 'trace-empty';
            empty.textContent = 'The battlefield is quiet. Run a battle or step through an instruction.';
            container.append(empty);
            return;
        }
        for (const event of trace) {
            const row = document.createElement('div');
            row.className = 'trace-row';
            const turn = document.createElement('span');
            turn.className = 'turn';
            turn.textContent = `#${pad(event.turn, 5)}`;
            const bot = document.createElement('span');
            bot.className = 'bot';
            bot.textContent = event.botName;
            bot.style.color = colors[event.botIndex];
            const detail = document.createElement('span');
            detail.className = 'detail';
            detail.textContent = `@${pad(event.oldPC)} ${format(event.instruction)} → ${event.alive ? `PC ${pad(event.newPC)}` : 'ELIMINATED'}${event.write ? ` · write @${pad(event.write.address)}` : ''}`;
            row.append(turn, bot, detail);
            container.append(row);
        }
    }

    function draw(now) {
        if (!game) return;
        const size = canvas.width / 16;
        ctx.fillStyle = '#10130f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let address = 0; address < 256; address++) {
            const x = (address % 16) * size;
            const y = Math.floor(address / 16) * size;
            const owner = game.owners[address];
            ctx.fillStyle = owner === null ? '#252c21' : owner === 0 ? '#274b66' : '#6d412b';
            ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
            ctx.fillStyle = owner === null ? '#6d7c62' : colors[owner];
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(game.memory[address].op, x + size / 2, y + size / 2 + 4);
            const age = now - flashes[address];
            if (flashes[address] && age < 320) {
                ctx.fillStyle = `rgba(255,255,235,${0.6 * (1 - age / 320)})`;
                ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
            }
            if (address === selected) {
                ctx.strokeStyle = '#dbfb72';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
            }
        }
        game.bots.forEach((bot, index) => {
            const x = (bot.pc % 16) * size;
            const y = Math.floor(bot.pc / 16) * size;
            ctx.strokeStyle = colors[index];
            ctx.lineWidth = 3;
            const inset = index === 0 ? 4 : 8;
            ctx.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
            ctx.fillStyle = colors[index];
            ctx.fillRect(x + (index === 0 ? 4 : size - 10), y + 3, 6, 6);
            if (!bot.alive) {
                ctx.beginPath();
                ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + size - 8, y + size - 8);
                ctx.moveTo(x + size - 8, y + 8); ctx.lineTo(x + 8, y + size - 8);
                ctx.stroke();
            }
        });
    }

    function frame(now) {
        const elapsed = Math.min(now - previousTime, 100);
        previousTime = now;
        if (game.status === 'running') {
            accumulator += elapsed * speeds[Number($('speed').value)] / 1000;
            let changed = false;
            // Bound frame work so controls remain responsive at high speeds.
            for (let i = 0; accumulator >= 1 && i < 100 && game.status === 'running'; i++) {
                executeTurn();
                accumulator--;
                changed = true;
            }
            if (changed) { updateUI(); renderTrace(); }
        }
        draw(now);
        requestAnimationFrame(frame);
    }

    reset();
    requestAnimationFrame(frame);
})();
