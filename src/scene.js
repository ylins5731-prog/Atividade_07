import * as B from '@babylonjs/core';

export function createBoard(canvas) {
  const engine = new B.Engine(canvas, true);
  const scene = new B.Scene(engine);
  scene.clearColor = B.Color4.FromHexString('#101c2bff');
  const camera = new B.ArcRotateCamera('camera', -Math.PI / 2.5, .72, 8.5, B.Vector3.Zero(), scene);
  camera.attachControl(canvas, true); camera.lowerRadiusLimit = 4; camera.upperRadiusLimit = 13;
  camera.wheelPrecision = 45;
  new B.HemisphericLight('luz', new B.Vector3(0, 1, 0), scene).intensity = 1.25;
  const material = (name, hex, emissive = false) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    if (emissive) m.emissiveColor = m.diffuseColor;
    return m;
  };
  const pcb = material('placa', '#184c45'), metal = material('metal', '#b3bdc6');
  const black = material('conectores', '#11171d'), gold = material('pinos', '#d5b26a');
  const box = (name, width, height, depth, x, y, z, mat) => {
    const mesh = B.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z); mesh.material = mat; return mesh;
  };
  box('ESP32 DevKit ilustrativa', 2.4, .12, 4.5, 0, 0, 0, pcb);
  box('modulo', 1.55, .15, 2.1, 0, .14, -.35, black);
  box('blindagem', 1.5, .15, 1.5, 0, .25, -.08, metal);
  box('antena', 1.52, .04, .6, 0, .24, -1.2, black);
  for (let i = 0; i < 5; i++) box('trilha antena', .9, .02, .026, 0, .27, -1.4 + i * .1, gold);
  for (const side of [-1, 1]) {
    box('header', .18, .16, 3.8, side * 1.02, .15, 0, black);
    for (let i = 0; i < 15; i++) box('pino', .1, .42, .09, side * 1.02, -.07, -1.75 + i * .25, gold);
  }
  box('USB', .75, .3, .65, 0, .22, 2.1, metal);
  box('porta USB', .52, .14, .03, 0, .22, 2.44, black);
  for (const side of [-1, 1]) {
    box(side < 0 ? 'EN' : 'BOOT', .34, .13, .34, side * .7, .17, 1.65, metal);
    box('botao', .18, .1, .18, side * .7, .28, 1.65, black);
  }
  box('chip USB serial', .55, .12, .45, 0, .14, 1.05, black);
  const label = new B.DynamicTexture('inscricao', { width: 512, height: 256 }, scene, false);
  label.drawText('ESP32', null, 142, 'bold 66px Arial', '#27323c', '#b3bdc6', true);
  const lm = new B.StandardMaterial('texto modulo', scene); lm.diffuseTexture = label;
  const plane = B.MeshBuilder.CreateGround('ESP32 inscricao', { width: 1.3, height: .65 }, scene);
  plane.position.set(0, .331, -.1); plane.material = lm;
  const led = B.MeshBuilder.CreateSphere('LED GPIO 2', { diameter: .23, segments: 16 }, scene);
  led.position.set(.65, .26, .76);
  const on = material('LED aceso', '#69ffb0', true);
  const off = material('LED apagado', '#263a31');
  const unknown = material('LED desconhecido', '#73859a');
  led.material = unknown;
  const glow = new B.GlowLayer('brilho', scene); glow.intensity = .65; glow.addIncludedOnlyMesh(led);
  const resize = new ResizeObserver(() => engine.resize()); resize.observe(canvas);
  engine.runRenderLoop(() => scene.render());
  return { setLed(value) { led.material = value === null ? unknown : value ? on : off; } };
}
