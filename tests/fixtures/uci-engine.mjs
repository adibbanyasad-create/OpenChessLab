import { createInterface } from 'node:readline';
import { setTimeout } from 'node:timers/promises';

const mode = process.argv[2] ?? 'normal';
const input = createInterface({ input: process.stdin });
let searches = 0;
let output = Promise.resolve();
const send = (line) => {
  if (mode === 'fragmented') {
    output = output.then(async () => {
      process.stdout.write(line.slice(0, 4));
      await setTimeout(5);
      process.stdout.write(line.slice(4) + '\r\n');
    });
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
    searches++;
    if (mode === 'crash') process.exit(3);
    if (mode === 'stall') return;
    if (mode === 'oversized') {
      process.stdout.write('x'.repeat(300_000));
      return;
    }
    if (mode === 'split-statistics') {
      send('info depth 8 seldepth 12');
      send('info score cp 31 pv e2e4 e7e5 g1f3');
      send('info nodes 1500');
      send('info nps 30000 time 50 hashfull 7');
    } else if (mode === 'missing-statistics' || (mode === 'reset-statistics' && searches > 1)) {
      send('info depth 8 score cp 31 pv e2e4 e7e5 g1f3');
    } else if (mode === 'missing-depth') {
      send('info score cp 31 nodes 1000 nps 20000 time 50 pv e2e4 e7e5');
    } else if (mode === 'zero-statistics') {
      send('info depth 8 score cp 0 nodes 0 nps 0 time 0 hashfull 0 pv e2e4');
    } else if (mode === 'bound-only') {
      send('info depth 8 score cp 31 lowerbound nodes 1000 nps 20000 time 50 pv e2e4');
    } else if (mode === 'unscoped-multipv-depth') {
      send('info depth 9 seldepth 20');
      send('info depth 8 multipv 1 score cp 31 nodes 1500 nps 30000 time 50 pv e2e4 e7e5');
      send('info multipv 2 score cp 20 pv d2d4 d7d5');
    } else if (mode === 'multiple-lines' || mode === 'unknown-pv-depth') {
      send('info depth 7 multipv 2 score cp 20 nodes 1000 nps 20000 time 50 pv d2d4 d7d5');
      send('info depth 8 multipv 1 score cp 31 nodes 1500 nps 30000 time 50 pv e2e4 e7e5');
      if (mode === 'unknown-pv-depth') send('info multipv 3 score cp 10 pv g1f3 g8f6');
      send('info nodes 2000 nps 40000 time 50');
    } else if (mode !== 'no-score')
      send(
        'info depth 8 seldepth 12 multipv 1 score cp 31 nodes 1000 nps 20000 time 50 pv e2e4 e7e5 g1f3',
      );
    send(`bestmove ${mode === 'bad-move' ? 'a1a8' : 'e2e4'}`);
  }
  if (command === 'quit' && mode !== 'ignore-quit') process.exit(0);
});
