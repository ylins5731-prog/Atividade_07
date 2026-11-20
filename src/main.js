import './style.css';
import { createBoard } from './scene.js';
import { DemoDevice, decodeLine, freshState, updateState, isFresh } from './protocol.js';
import { SerialConnection } from './serial.js';

const ui = Object.fromEntries(['conectar', 'demo', 'iniciar', 'parar', 'aplicar', 'lento', 'rapido', 'intervalo',
  'intervaloValor', 'fonte', 'conexao', 'estado', 'modo', 'confirmado', 'frequencia',
  'idade', 'mensagem', 'log', 'falha', 'ledIndicador', 'avisoFonte'].map(id => [id, document.getElementById(id)]));
let model;
try { model = createBoard(document.getElementById('renderCanvas')); }
catch { ui.mensagem.textContent = 'WebGL indisponível. O painel textual permanece disponível.'; }
let source = 'none', state = freshState(), connection = null, demo = null;
let busy = false, muted = false, generation = 0;
const logs = [];

function log(text) {
  logs.push(`${new Date().toLocaleTimeString('pt-BR')}  ${text}`);
  if (logs.length > 100) logs.shift();
  ui.log.textContent = logs.join('\n'); ui.log.scrollTop = ui.log.scrollHeight;
}
function message(text) { ui.mensagem.textContent = text; }
function receive(line) {
  const event = decodeLine(line);
  if (!event) return; // Logs de boot e mensagens incompletas nao atualizam a visualizacao.
  log(`RX ${line}`);
  if (event.type === 'error') { message(`Comando recusado: ${line}`); return; }
  updateState(state, event, performance.now());
  if (event.type === 'period') message(`Período confirmado: ${event.value} ms.`);
  render();
}
function render() {
  const now = performance.now(), fresh = isFresh(state, now);
  const active = source !== 'none';
  ui.fonte.textContent = source === 'usb' ? 'ESP32 USB' : source === 'demo' ? 'DEMO · SIMULAÇÃO' : 'SEM CONEXÃO';
  ui.fonte.className = `badge ${source}`;
  ui.conexao.textContent = !active ? 'Selecione USB ou DEMO' : fresh ? 'Estados recebidos' : 'SEM DADOS VÁLIDOS';
  ui.estado.textContent = !fresh ? 'DESCONHECIDO' : state.led ? 'ACESO' : 'APAGADO';
  ui.ledIndicador.className = fresh && state.led ? 'on' : '';
  model?.setLed(fresh ? state.led : null);
  ui.modo.textContent = !fresh || state.running === null ? '—' : state.running ? 'PISCANDO' : 'PARADO';
  ui.confirmado.textContent = fresh && state.period !== null ? `${state.period} ms` : '—';
  ui.frequencia.textContent = fresh && state.period !== null ? `${(1000 / state.period).toFixed(2).replace('.', ',')} Hz` : '—';
  ui.idade.textContent = state.lastState === null ? '—' : `${((now - state.lastState) / 1000).toFixed(1)} s${fresh ? '' : ' · vencido'}`;
  for (const id of ['iniciar', 'parar', 'intervalo', 'aplicar', 'lento', 'rapido']) {
  ui[id].disabled = busy || !active || !fresh;
}
  ui.conectar.disabled = busy; ui.demo.disabled = busy;
  ui.conectar.textContent = busy ? 'AGUARDE…' : source === 'usb' ? 'DESCONECTAR USB' : 'CONECTAR ESP32';
  ui.demo.textContent = source === 'demo' ? 'ENCERRAR DEMO' : 'INICIAR DEMO';
  ui.falha.disabled = busy || source !== 'demo';
  ui.falha.textContent = muted ? 'RESTABELECER DADOS DEMO' : 'SIMULAR PERDA DE DADOS';
  ui.avisoFonte.textContent = source === 'demo'
    ? 'SIMULAÇÃO LOCAL: nenhum comando é enviado à placa. A falha interrompe apenas as respostas simuladas.'
    : source === 'usb'
      ? '115200 baud · LED comum no GPIO 2. Desconectar o navegador não garante parar o firmware. Use PARAR antes.'
      : 'USB: firmware na placa, cabo de dados e Monitor Serial fechado. DEMO: simulação local, sem acionar hardware.';
}
async function cleanup() {
  generation++; demo = null; muted = false;
  const old = connection; connection = null;
  source = 'none'; state = freshState(); render();
  if (old) {
    try { await old.close(); }
    catch (error) { log(`Fechamento: ${error.message}`); }
  }
}
async function endSerial(current, error) {
  if (connection !== current) return;
  busy = true;
  await cleanup(); busy = false; render();
  message(`Conexão encerrada. ${error?.message || 'Reconecte para receber novos estados.'}`);
}
async function connect() {
  if (busy) return;
  if (source === 'usb') {
    busy = true; render(); await cleanup(); busy = false; render();
    message('USB desconectada. A placa pode continuar piscando enquanto estiver alimentada.'); return;
  }
  if (!navigator.serial) { message('Use Chrome ou Edge no computador, em localhost ou HTTPS.'); return; }
  busy = true; render();
  try {
    // requestPort ocorre no gesto do usuario, antes de outras operacoes assincronas.
    const port = await navigator.serial.requestPort();
    await cleanup();
    const token = generation;
    const current = new SerialConnection(port, line => {
      if (generation === token && source === 'usb') receive(line);
    }, error => { void endSerial(current, error); });
    connection = current;
    source = 'usb';
    await current.open();
    await current.send('S'); log('TX S');
    message('Porta aberta. Aguardando os estados da ESP32.');
  } catch (error) {
    if (error.name !== 'NotFoundError') { await cleanup(); message(`Não foi possível conectar: ${error.message}`); }
    else message('Seleção de porta cancelada.');
  } finally { busy = false; render(); }
}
async function toggleDemo() {
  if (busy) return;
  busy = true; const wasDemo = source === 'demo';
  await cleanup();
  if (!wasDemo) {
    source = 'demo';
    const token = generation;
    demo = new DemoDevice(line => { if (!muted && generation === token) receive(line); }, performance.now());
    receive('PRONTO'); demo.snapshot();
    message('DEMO ativa. Experimente os comandos e a perda de dados.');
  } else message('Simulação encerrada.');
  busy = false; render();
}
async function send(command) {
  if (busy || !isFresh(state, performance.now())) return;
  log(`TX ${command}`);
  const target = connection;
  try {
    if (source === 'demo') demo.command(command, performance.now());
    else if (source === 'usb') { await target.send(command); message(`Enviado ${command}. Aguarde confirmação.`); }
  } catch (error) { await endSerial(target, error); }
}
ui.conectar.addEventListener('click', connect);
ui.demo.addEventListener('click', toggleDemo);
ui.iniciar.addEventListener('click', () => send('B'));
ui.parar.addEventListener('click', () => send('P'));
ui.aplicar.addEventListener('click', () => send(`T:${ui.intervalo.value}`));
ui.lento.addEventListener('click', () => {
  ui.intervalo.value = 2000;
  ui.intervaloValor.textContent = '2000 ms';
  send('T:2000');
});

ui.rapido.addEventListener('click', () => {
  ui.intervalo.value = 200;
  ui.intervaloValor.textContent = '200 ms';
  send('T:200');
});
ui.intervalo.addEventListener('input', () => { ui.intervaloValor.textContent = `${ui.intervalo.value} ms`; });
ui.falha.addEventListener('click', () => {
  if (source !== 'demo') return;
  muted = !muted;
  if (!muted) demo.snapshot();
  message(muted ? 'Respostas DEMO interrompidas. Após 3 s, o estado será desconhecido.' : 'Respostas DEMO restabelecidas.');
  render();
});
setInterval(() => { demo?.tick(performance.now()); render(); }, 25);
render();
