import { createInterface } from 'node:readline';

const mode = process.argv[2] ?? 'normal';
const input = createInterface({ input: process.stdin });
const send = (line) => {
  if (mode === 'fragmented') {
    process.stdout.write(line.slice(0, 4));
    process.stdout.write(line.slice(4) + '\r\n');
  } else process.stdout.write(line + '\n');
};
input.on('line', (command) => {
  if (command === 'uci') {
    send('id name Test UCI fixture');
    if (mode !== 'unsupported') {
      send('option name Threads type spin default 1 min 1 max 2');
      send('option name Hash type spin default 16 min 1 max 256');
      send('option name MultiPV type spin default 1 min 1 max 5');
    }
    if (mode !== 'no-handshake') send('uciok');
  }
  if (command === 'isready') send('readyok');
  if (command.startsWith('go ')) {
    if (mode === 'crash') process.exit(3);
    if (mode === 'stall') return;
    if (mode === 'oversized') {
      process.stdout.write('x'.repeat(300_000));
      return;
    }
    if (mode !== 'no-score')
      send(
        'info depth 8 seldepth 12 multipv 1 score cp 31 nodes 1000 nps 20000 time 50 pv e2e4 e7e5 g1f3',
      );
    send(`bestmove ${mode === 'bad-move' ? 'a1a8' : 'e2e4'}`);
  }
  if (command === 'quit') process.exit(0);
});
