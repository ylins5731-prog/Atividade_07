import { createLineReader } from './protocol.js';

export class SerialConnection {
  constructor(port, onLine, onEnd) {
    this.port = port; this.onLine = onLine; this.onEnd = onEnd;
    this.reader = null; this.writer = null; this.task = null;
    this.closing = false; this.opened = false; this.closeTask = null;
    this.writes = Promise.resolve();
  }
  async open() {
    await this.port.open({ baudRate: 115200 });
    this.opened = true;
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.task = this.readLoop();
  }
  async readLoop() {
    const decoder = new TextDecoder();
    const consume = createLineReader(this.onLine);
    let failure = null;
    try {
      while (!this.closing) {
        const { value, done } = await this.reader.read();
        if (done) break;
        consume(decoder.decode(value, { stream: true }));
      }
    } catch (error) { failure = error; }
    finally {
      this.reader?.releaseLock(); this.reader = null;
      // Callback fora da tarefa para close() poder aguardar esta tarefa sem ciclo.
      if (!this.closing) setTimeout(() => this.onEnd(failure), 0);
    }
  }
  send(command) {
    const pending = this.writes.then(async () => {
      if (this.closing || !this.writer) throw new Error('Porta fechada');
      await this.writer.write(new TextEncoder().encode(command + '\n'));
    });
    this.writes = pending.catch(() => {});
    return pending;
  }
  close() {
    if (!this.closeTask) this.closeTask = this.dispose();
    return this.closeTask;
  }
  async dispose() {
    this.closing = true;
    try { await this.reader?.cancel(); } catch { /* USB removido */ }
    await this.task;
    try { await this.writer?.abort(); } catch { /* USB removido */ }
    await this.writes;
    this.writer?.releaseLock(); this.writer = null;
    if (this.opened) await this.port.close();
    this.opened = false;
  }
}
