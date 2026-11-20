export const TIMEOUT_MS = 3000;

export function decodeLine(line) {
  if (line === 'PRONTO') return { type: 'ready' };
  if (line === 'PLACA:ESP32_GPIO2') return { type: 'board' };
  if (line === 'LED:PISCANDO') return { type: 'running', value: true };
  if (line === 'LED:PARADO') return { type: 'running', value: false };
  if (/^ESTADO:[01]$/.test(line)) return { type: 'led', value: line.endsWith('1') };
  if (/^INTERVALO:[0-9]+$/.test(line)) {
    const value = Number(line.slice(10));
    if (Number.isInteger(value) && value >= 100 && value <= 2000) return { type: 'period', value };
  }
  if (/^ERRO:(INTERVALO|COMANDO|TAMANHO)$/.test(line)) return { type: 'error', value: line };
  return null;
}

// Descarta linhas excessivas ate a proxima quebra, sem aceitar um sufixo como nova linha.
export function createLineReader(onLine, limit = 160) {
  let buffer = '', dropping = false;
  return text => {
    for (const c of text) {
      if (c === '\n') {
        if (!dropping && buffer) onLine(buffer);
        buffer = ''; dropping = false;
      } else if (c !== '\r' && !dropping) {
        if (buffer.length < limit) buffer += c;
        else { buffer = ''; dropping = true; }
      }
    }
  };
}

export function freshState() {
  return { led: null, running: null, period: null, lastState: null };
}

export function updateState(state, event, now) {
  if (event.type === 'ready') Object.assign(state, freshState());
  if (event.type === 'led') { state.led = event.value; state.lastState = now; }
  if (event.type === 'running') state.running = event.value;
  if (event.type === 'period') state.period = event.value;
}

export function isFresh(state, now) {
  return state.lastState !== null && now - state.lastState <= TIMEOUT_MS;
}

export class DemoDevice {
  constructor(onLine, now = 0) {
    this.onLine = onLine; this.period = 1000; this.running = true;
    this.led = false; this.lastToggle = now; this.lastStatus = now;
  }
  snapshot() {
    this.onLine('PLACA:ESP32_GPIO2');
    this.onLine(`INTERVALO:${this.period}`);
    this.onLine(this.running ? 'LED:PISCANDO' : 'LED:PARADO');
    this.onLine(`ESTADO:${Number(this.led)}`);
  }
  command(command, now) {
    if (command === 'P') { this.running = false; this.led = false; }
    else if (command === 'B') { this.running = true; this.lastToggle = now; }
    else if (command === 'S') { /* Somente consulta. */ }
    else if (command.startsWith('T:')) {
      const value = Number(command.slice(2));
      if (!/^T:[0-9]+$/.test(command) || !Number.isInteger(value) || value < 100 || value > 2000) {
        this.onLine('ERRO:INTERVALO'); return;
      }
      this.period = value; this.lastToggle = now;
    } else { this.onLine('ERRO:COMANDO'); return; }
    this.snapshot();
  }
  tick(now) {
    if (this.running && now - this.lastToggle >= Math.floor(this.period / 2)) {
      this.lastToggle = now; this.led = !this.led;
      this.onLine(`ESTADO:${Number(this.led)}`);
    }
    if (now - this.lastStatus >= 1000) { this.lastStatus = now; this.snapshot(); }
  }
}
