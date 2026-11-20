import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineReader, decodeLine, DemoDevice, freshState, isFresh, updateState } from '../src/protocol.js';

test('fragmentos, CRLF e varias mensagens no mesmo bloco', () => {
  const lines = [], read = createLineReader(line => lines.push(line));
  read('ESTA'); read('DO:1\r\nINTERVALO:500\nLED:PAR'); read('ADO\n');
  assert.deepEqual(lines, ['ESTADO:1', 'INTERVALO:500', 'LED:PARADO']);
});
test('linha excessiva e descartada ate a quebra e leitor se recupera', () => {
  const lines = [], read = createLineReader(line => lines.push(line), 12);
  read('x'.repeat(30) + 'ESTADO:1\nESTADO:0\n');
  assert.deepEqual(lines, ['ESTADO:0']);
});
test('mensagens invalidas nao sao estados', () => {
  for (const line of ['ESTADO:2', 'ESTADO:1abc', 'INTERVALO:0', 'INTERVALO:2001', 'INTERVALO:500x', 'INTERVALO:', 'INTERVALO:1e3', 'abc']) assert.equal(decodeLine(line), null);
});
test('somente estado recebido renova validade inclusive com LED parado', () => {
  const state = freshState();
  updateState(state, decodeLine('ESTADO:0'), 100);
  updateState(state, decodeLine('INTERVALO:500'), 3000);
  assert.equal(isFresh(state, 3100), true);
  assert.equal(isFresh(state, 3101), false);
  updateState(state, decodeLine('ESTADO:0'), 4000);
  assert.equal(isFresh(state, 4001), true);
  updateState(state, decodeLine('PRONTO'), 4100);
  assert.equal(isFresh(state, 4100), false);
});
test('demo ciclo completo, parada, retomada e confirmacao do periodo', () => {
  const lines = [], demo = new DemoDevice(line => lines.push(line));
  demo.tick(499); assert.equal(demo.led, false);
  demo.tick(500); assert.equal(demo.led, true);
  demo.tick(1000); assert.equal(demo.led, false);
  demo.command('T:200', 1000);
  demo.tick(1100); assert.equal(demo.led, true);
  demo.command('P', 1101); assert.equal(demo.led, false);
  demo.tick(5000); assert.equal(demo.led, false);
  assert.equal(lines.at(-1), 'ESTADO:0');
  demo.command('B', 5000); demo.tick(5100); assert.equal(demo.led, true);
  assert.ok(lines.includes('INTERVALO:200'));
});
test('demo rejeita comandos sem modificar o periodo', () => {
  const lines = [], demo = new DemoDevice(line => lines.push(line));
  for (const c of ['T:99', 'T:2001', 'T:500abc', 'T:-1', 'T:']) {
    demo.command(c, 0); assert.equal(demo.period, 1000); assert.equal(lines.at(-1), 'ERRO:INTERVALO');
  }
  demo.command('X', 0); assert.equal(lines.at(-1), 'ERRO:COMANDO');
});
