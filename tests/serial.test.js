import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialConnection } from '../src/serial.js';

function fakePort() {
  let input;
  const writes = [];
  return {
    writes, closed: false,
    readable: new ReadableStream({ start(controller) { input = controller; } }),
    writable: new WritableStream({ write(bytes) { writes.push(new TextDecoder().decode(bytes)); } }),
    async open(options) { assert.equal(options.baudRate, 115200); },
    async close() {
      assert.equal(this.readable.locked, false);
      assert.equal(this.writable.locked, false);
      this.closed = true;
    },
    emit(text) { input.enqueue(new TextEncoder().encode(text)); },
    unplug() { input.error(new Error('USB removido')); }
  };
}

test('serial entrega linhas completas, serializa comandos e libera locks ao fechar', async () => {
  const port = fakePort(), lines = [];
  const serial = new SerialConnection(port, line => lines.push(line), () => assert.fail('Fechamento intencional'));
  await serial.open();
  port.emit('ESTA'); port.emit('DO:1\r\nLED:PISCANDO\n');
  await Promise.all([serial.send('B'), serial.send('T:500'), serial.send('P')]);
  assert.deepEqual(port.writes, ['B\n', 'T:500\n', 'P\n']);
  assert.deepEqual(lines, ['ESTADO:1', 'LED:PISCANDO']);
  await serial.close(); await serial.close();
  assert.equal(port.closed, true);
  await assert.rejects(serial.send('B'), /Porta fechada/);
});

test('remocao USB encerra leitura e permite limpar recursos sem deadlock', async () => {
  const port = fakePort();
  let ended;
  const end = new Promise(resolve => { ended = resolve; });
  const serial = new SerialConnection(port, () => {}, ended);
  await serial.open(); port.unplug();
  const error = await end;
  assert.match(error.message, /USB removido/);
  await serial.close(); assert.equal(port.closed, true);
});
