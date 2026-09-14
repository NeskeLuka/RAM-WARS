const PRESETS = {
    bomber: {
        name: 'Bomber',
        description: 'Drops DAT bombs every five cells by rewriting its own MOV target.',
        code: '; Change the ADD stride to try a new attack\nMOV 3 8\nADD 5 -1\nJMP -2 0\nDAT 0 0'
    },
    imp: {
        name: 'Imp',
        description: 'Copies itself one cell forward, then executes the new copy.',
        code: '; A one-instruction program that walks through RAM\nMOV 0 1'
    },
    reverse: {
        name: 'Reverse bomber',
        description: 'Walks its bombing target backward through memory.',
        code: '; SUB changes the destination of the previous MOV\nMOV 3 -8\nSUB 7 -1\nJMP -2 0\nDAT 0 0'
    },
    sniper: {
        name: 'Sniper',
        description: 'Targets the other starting address. Try it against a looping bot.',
        code: '; The two starting addresses are 128 cells apart\nMOV 2 128\nJMP -1 0\nDAT 0 0'
    },
    loop: {
        name: 'Loop',
        description: 'Stays in one place. Two loops draw at the turn limit.',
        code: '; Useful as a target or for testing draws\nJMP 0 0'
    }
};
