// ============================================================
// main.js —— 奶蛙学走路（第一关：追上公交车）
//
// 玩法：按一下按钮 = 走一步。左右脚必须严格交替，
//       而且两次点击的间隔要落在节拍窗口里（太快/太慢都会摔）。
// 摔倒后自动爬起来，公交一直在前面匀速开，被拉开就失败。
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadFrog, setSkin } from './frog.js';

// ---------------- 全部可调数值 ----------------
const CONFIG = {
  step : { dist: 0.66, dur: 0.30, perfectBoost: 0.10 },       // 一步走多远 / 走多久 / 完美步伐加成
  beat : { bpm: 96, fastRatio: 0.55, slowRatio: 1.75, perfectRatio: 0.16 },
  bus  : { url: 'assets/bus.glb', length: 6.0, gapStart: 7.0, winGap: 2.7, loseGap: 14.0, speed: 0.68, flip: false },
  cam  : { leadX: 3.2, y: 3.1, z: 10.5, fov: 45, follow: 4.5 },
  fall : { down: 0.95, up: 0.75 },
  frog : { head: 0xfff08a, belly: 0xffd93d, yaw: 1.35, height: 1.45 },
  // 第二关：上公交车
  lvl2 : {
    time: 30, missPenalty: 3,
    chargeMin: 0.18, chargeMax: 2.1, perfectMin: 0.35, perfectMax: 1.2,
    jumpT: 0.55,
    railHold: 0.6, swipeDist: 70,
    startX: 6.3, busX: 12.3,
    stepTopX: 8.45, stepTopY: 1.38,
    doorX: 9.55, doorY: 2.0,
  },
};
const BEAT_MS = 60000 / CONFIG.beat.bpm;

// ---------------- 渲染器 / 场景 / 相机 ----------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ff);
scene.fog = new THREE.Fog(0x9fd8ff, 26, 80);

const camera = new THREE.PerspectiveCamera(CONFIG.cam.fov, innerWidth / innerHeight, 0.1, 200);
camera.position.set(CONFIG.cam.leadX, CONFIG.cam.y, CONFIG.cam.z);
camera.lookAt(CONFIG.cam.leadX, 1.35, 0);

scene.add(new THREE.HemisphereLight(0xdff1ff, 0x8a7460, 1.0));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.position.set(6, 14, 9);
scene.add(sun);

addEventListener('resize', ()=>{
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// 街道布景
// ============================================================
const STREET_X0 = -60, STREET_X1 = 200;

function addBox(w, h, d, color, x, y, z, parent = scene){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function makeShadow(w, d){
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.18, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.012;
  return m;
}

// 楼上的窗户：用 canvas 画一张贴图，避免几百个小方块
function windowTexture(wall, glass){
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = wall; g.fillRect(0, 0, 128, 128);
  for(let row = 0; row < 4; row++){
    for(let col = 0; col < 3; col++){
      g.fillStyle = (row + col) % 3 === 0 ? '#ffffff' : glass;
      g.fillRect(11 + col * 38, 9 + row * 29, 26, 19);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildStreet(){
  // 兜底大地面（防止镜头下方露出天空色）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET_X1 - STREET_X0, 60),
    new THREE.MeshLambertMaterial({ color: 0xd6cfbe })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((STREET_X0 + STREET_X1) / 2, -0.03, 0);
  scene.add(ground);

  // 柏油路
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET_X1 - STREET_X0, 6.5),
    new THREE.MeshLambertMaterial({ color: 0x565d68 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set((STREET_X0 + STREET_X1) / 2, 0, 0);
  scene.add(road);

  // 中间虚线
  const dashGeo = new THREE.BoxGeometry(0.7, 0.02, 0.16);
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xf3efe2 });
  const count = Math.floor((STREET_X1 - STREET_X0) / 3.2);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, count);
  const dm = new THREE.Matrix4();
  for(let i = 0; i < count; i++){
    dm.makeTranslation(STREET_X0 + i * 3.2, 0.013, 0);
    dashes.setMatrixAt(i, dm);
  }
  scene.add(dashes);

  // 人行道 + 路沿（放在远离镜头的一侧，不挡角色）
  const walkway = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET_X1 - STREET_X0, 2.8),
    new THREE.MeshLambertMaterial({ color: 0xd8d0bf })
  );
  walkway.rotation.x = -Math.PI / 2;
  walkway.position.set((STREET_X0 + STREET_X1) / 2, 0.14, -4.6);
  scene.add(walkway);
  addBox(STREET_X1 - STREET_X0, 0.16, 0.26, 0xbdb5a4, (STREET_X0 + STREET_X1) / 2, 0.08, -3.3);

  // 近镜头这一侧也铺一层人行道（把画面下方补满）
  const nearWalk = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET_X1 - STREET_X0, 5),
    new THREE.MeshLambertMaterial({ color: 0xded6c4 })
  );
  nearWalk.rotation.x = -Math.PI / 2;
  nearWalk.position.set((STREET_X0 + STREET_X1) / 2, 0.14, 6.2);
  scene.add(nearWalk);
  addBox(STREET_X1 - STREET_X0, 0.16, 0.26, 0xbdb5a4, (STREET_X0 + STREET_X1) / 2, 0.08, 3.3);

  // 后面的地面
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET_X1 - STREET_X0, 22),
    new THREE.MeshLambertMaterial({ color: 0xe7e0cd })
  );
  back.rotation.x = -Math.PI / 2;
  back.position.set((STREET_X0 + STREET_X1) / 2, 0.1, -14);
  scene.add(back);

  // 楼房（两排，远的那排更淡）
  const WALLS = [0xf7e7c8, 0xf6d3c0, 0xd9e8f5, 0xf2f0e9, 0xe8d7f1, 0xd6ecd9];
  const GLASS = ['#8fb8d8', '#a8c6d9', '#7fa7c4', '#b9cfe0'];
  let seed = 20261108;
  const rnd = ()=>{ seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const texA = windowTexture('#f4e9d3', '#8fb8d8');
  const texB = windowTexture('#e8eef5', '#a8c6d9');
  const texC = windowTexture('#f3e3d8', '#b9cfe0');

  let i = 0;
  for(let x = STREET_X0; x < STREET_X1; x += 5.6){
    const h = 3.2 + rnd() * 3.4;
    const w = 4.2 + rnd() * 1.2;
    const tex = [texA, texB, texC][i++ % 3];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 4),
      new THREE.MeshLambertMaterial({ map: tex, color: WALLS[i % WALLS.length] })
    );
    m.position.set(x + w / 2, h / 2 + 0.1, -9.6);
    scene.add(m);
  }
  for(let x = STREET_X0; x < STREET_X1; x += 11.5){
    const h = 8 + rnd() * 6;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(7, h, 5),
      new THREE.MeshLambertMaterial({ map: texB, color: WALLS[(i++ + 3) % WALLS.length] })
    );
    m.position.set(x, h / 2, -17);
    scene.add(m);
  }

  // 路灯
  for(let x = STREET_X0 + 6; x < STREET_X1; x += 15){
    addBox(0.12, 3.2, 0.12, 0x3c4a5e, x, 1.66, -3.85);
    const lamp = addBox(0.55, 0.22, 0.5, 0xfff0b2, x, 3.35, -3.85);
    lamp.material.emissive = new THREE.Color(0xffe9a0);
    lamp.material.emissiveIntensity = 0.6;
  }
}
buildStreet();

// ============================================================
// 公交车
// ============================================================
let bus = null;   // { root, flip }

function loadBus(){
  return new Promise((resolve, reject)=>{
    new GLTFLoader().load(CONFIG.bus.url, gltf=>{
      const src = gltf.scene;
      // 包一层：负责“车长对齐 X 轴 + 统一大小 + 落地”
      const inner = new THREE.Group();
      inner.add(src);

      inner.rotation.y = 0;
      let box = new THREE.Box3().setFromObject(src);
      const size = box.getSize(new THREE.Vector3());
      if(size.z > size.x) inner.rotation.y = Math.PI / 2;   // 车长原本在 z 方向 → 转到 X
      inner.updateMatrixWorld(true);

      box = new THREE.Box3().setFromObject(inner);
      const s2 = box.getSize(new THREE.Vector3());
      inner.scale.setScalar(CONFIG.bus.length / Math.max(s2.x, 0.001));
      inner.updateMatrixWorld(true);

      box = new THREE.Box3().setFromObject(inner);
      const c2 = box.getCenter(new THREE.Vector3());
      inner.position.x -= c2.x;
      inner.position.z -= c2.z;
      inner.position.y -= box.min.y;

      // 再包一层：负责车头朝向（flip 可在 CONFIG 里一键调头）
      const flip = new THREE.Group();
      flip.rotation.y = CONFIG.bus.flip ? Math.PI : 0;
      flip.add(inner);

      const root = new THREE.Group();
      root.add(flip);
      root.add(makeShadow(CONFIG.bus.length * 0.95, 2.6));
      scene.add(root);

      resolve({ root, flip });
    }, undefined, reject);
  });
}

// ============================================================
// 奶蛙
// ============================================================
let frog = null;

// ============================================================
// 音效（WebAudio 合成，不用下载音频）
// ============================================================
const Sfx = {
  ctx: null,
  init(){
    if(!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) this.ctx = new AC();
    }
    if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'sine', gain = 0.2, delay = 0){
    if(!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  tick(accent){ this.tone(accent ? 1046 : 760, 0.055, 'square', 0.10); },
  step(){ this.tone(150, 0.10, 'triangle', 0.16); this.tone(90, 0.08, 'sine', 0.10, 0.02); },
  thud(){ this.tone(72, 0.30, 'sine', 0.30); this.tone(48, 0.42, 'sine', 0.26, 0.03); },
  perfect(){ this.tone(1320, 0.10, 'triangle', 0.16); },
  win(){ [523, 659, 784, 1046, 1310].forEach((f, i)=>this.tone(f, 0.26, 'sine', 0.22, i * 0.13)); },
  lose(){ [392, 330, 262, 196].forEach((f, i)=>this.tone(f, 0.32, 'sine', 0.20, i * 0.16)); },
};

// ============================================================
// 游戏状态
// ============================================================
const G = {
  ready: false, started: false, over: false,
  level: 1,                 // 当前关卡：1 | 2
  screen: 'home',           // home | levels | game | end
  state: 'idle',            // idle | step | fall | getup | win | lose
  x: 0, stepFrom: 0, stepTo: 0, stepT: 1, stepSide: null,
  hasStepped: false, lastSide: null, lastClickAt: 0,
  fallKind: null, fallT: 0, fallAngle: 0, upT: 0,
  busX: CONFIG.bus.gapStart, busSpeed: 0,
  tickCount: 0, beatAt: 0,
  steps: 0, falls: 0, perfects: 0,
  camX: CONFIG.cam.leadX, camZ: CONFIG.cam.z,
};
window.__walk = G;   // 方便调试
// 节奏圈 / 落脚提示板
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.56, 48),
  new THREE.MeshBasicMaterial({ color: 0x7f8ea8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.014;
scene.add(ring);

const pads = [];
for(let i = 0; i < 6; i++){
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 1.05),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.5, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.016;
  pad.scale.setScalar(1 - i * 0.09);
  scene.add(pad);
  pads.push(pad);
}

// HUD 引用
const el = {
  gapFill  : document.getElementById('gapFill'),
  gapText  : document.getElementById('gapText'),
  nextFoot : document.getElementById('nextFoot'),
  falls    : document.getElementById('falls'),
  perfects : document.getElementById('perfects'),
  overlay  : document.getElementById('overlay'),
  panelHome: document.getElementById('panelHome'),
  panelLevels: document.getElementById('panelLevels'),
  panelEnd : document.getElementById('panelEnd'),
  homeBtn  : document.getElementById('homeBtn'),
  lv1      : document.getElementById('lv1'),
  lv2      : document.getElementById('lv2'),
  l2Time   : document.getElementById('l2Time'),
  l2Miss   : document.getElementById('l2Miss'),
  l2TimeChip: document.getElementById('l2TimeChip'),
  l2Task   : document.getElementById('l2Task'),
  l2ChargeWrap: document.getElementById('l2ChargeWrap'),
  l2ChargeFill: document.getElementById('l2ChargeFill'),
  railBtn  : document.getElementById('railBtn'),
  swipeHint: document.getElementById('swipeHint'),
  btnL     : document.getElementById('btnL'),
  btnR     : document.getElementById('btnR'),
  backHomeBtn: document.getElementById('backHomeBtn'),
  ovHomeBtn: document.getElementById('ovHomeBtn'),
  homeChip : document.getElementById('homeChip'),
  ovTitle  : document.getElementById('ovTitle'),
  ovDesc   : document.getElementById('ovDesc'),
  ovBtn    : document.getElementById('ovBtn'),
  ovList   : document.getElementById('ovList'),
  loading  : document.getElementById('loading'),
};

// ============================================================
// 主流程 / 状态机
// ============================================================
function easeInOutCubic(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function resetState(){
  G.over = false; G.state = 'idle';
  G.x = 0; G.stepFrom = 0; G.stepTo = 0; G.stepT = 1; G.stepSide = null;
  G.hasStepped = false; G.lastSide = null; G.lastClickAt = 0;
  G.fallKind = null; G.fallT = 0; G.upT = 0; G.fallAngle = 0;
  G.steps = 0; G.falls = 0; G.perfects = 0; G.tickCount = 0;
  G.busX = CONFIG.bus.gapStart; G.busSpeed = 0;
  G.camX = CONFIG.cam.leadX;
  G.camZ = CONFIG.cam.z;

  if(frog){
    frog.root.position.set(0, 0, 0);
    frog.body.rotation.set(0, 0, 0);
    frog.body.position.set(0, 0, 0);
    for(const k in frog.parts){
      const p = frog.parts[k];
      p.pose.x = p.pose.y = p.pose.z = 0;
    }
  }
  if(bus) bus.root.position.x = G.busX;
  updateHUD();
}

function resetGame(){
  resetState();
  G.started = true;
  G.busSpeed = CONFIG.bus.speed;
  G.beatAt = performance.now() + BEAT_MS;
  Sfx.init();
}

// 主页面：不进入关卡，3D 街景做背景
function showHome(){
  G.screen = 'home'; G.started = false; G.level = 1;
  document.body.classList.remove('ingame');
  setLevel1Scene();
  resetState();
  el.panelHome.hidden = false;
  el.panelLevels.hidden = true;
  el.panelEnd.hidden = true;
  el.overlay.classList.add('show');
}

// 关卡列表
function showLevels(){
  G.screen = 'levels'; G.started = false;
  document.body.classList.remove('ingame');
  el.panelHome.hidden = true;
  el.panelLevels.hidden = false;
  el.panelEnd.hidden = true;
  el.overlay.classList.add('show');
}

function showOverlay(title, desc, btnText){
  G.screen = 'end';
  el.ovTitle.innerHTML = title;
  el.ovDesc.innerHTML = desc;
  el.ovBtn.textContent = btnText;
  el.panelHome.hidden = true;
  el.panelLevels.hidden = true;
  el.panelEnd.hidden = false;
  document.body.classList.remove('ingame');
  el.overlay.classList.add('show');
}

// ---------- 点击一只脚 ----------
function pressFoot(side){
  if(!G.started || G.over || !G.ready) return;
  if(G.state === 'fall' || G.state === 'getup') return;

  const now = performance.now();
  const dt = G.hasStepped ? now - G.lastClickAt : BEAT_MS;

  // 1) 出脚顺序错了
  if(G.hasStepped && side === G.lastSide){
    doFall('wrong', now, side);
    return;
  }
  // 2) 太快
  if(dt < BEAT_MS * CONFIG.beat.fastRatio){
    doFall('fast', now, side);
    return;
  }
  // 3) 太慢
  if(dt > BEAT_MS * CONFIG.beat.slowRatio){
    doFall('slow', now, side);
    return;
  }

  // 判断是不是踩在拍点上
  const perfect = G.hasStepped && Math.abs(dt - BEAT_MS) < BEAT_MS * CONFIG.beat.perfectRatio;
  const dist = CONFIG.step.dist * (perfect ? 1 + CONFIG.step.perfectBoost : 1);

  G.stepT = 1;              // 上一步的动画直接收尾
  G.stepFrom = G.x;
  G.stepTo = G.x + dist;
  G.stepT = 0;
  G.state = 'step';
  G.stepSide = side;

  G.hasStepped = true;
  G.lastSide = side;
  G.lastClickAt = now;
  G.steps++;
  if(perfect){
    G.perfects++;
    Sfx.perfect();
    flashPerfect();
  }
  Sfx.step();
}

// ---------- 摔倒 ----------
function doFall(kind, now, side){
  G.state = 'fall';
  G.fallKind = kind;
  G.fallT = 0;
  G.upT = 0;
  G.falls++;
  G.lastClickAt = now;
  if(G.stepT < 1){ G.x = G.stepTo; G.stepT = 1; }

  if(kind === 'wrong') G.fallAngle = side === 'L' ? 1.15 : -1.15;   // 朝按错的那只脚倒
  else if(kind === 'fast') G.fallAngle = -1.30;                     // 向前扑
  else G.fallAngle = 1.30;                                          // 向后仰

  Sfx.thud();
}

// ---------- 结束 ----------
function winGame(){
  if(G.over) return;
  G.over = true; G.state = 'win';
  Sfx.win();
  setTimeout(()=>{
    showOverlay('🎉 赶上公交车啦！',
      `你一共走了 <b>${G.steps}</b> 步，摔倒 <b>${G.falls}</b> 次，踩准拍点 <b>${G.perfects}</b> 次。`,
      '再玩一次');
  }, 1500);
}
function loseGame(){
  if(G.over) return;
  G.over = true; G.state = 'lose';
  G.busSpeed = CONFIG.bus.speed;
  Sfx.lose();
  setTimeout(()=>{
    showOverlay('🚌 公交车开远了…',
      `它已经离你 ${Math.round(G.busX - G.x)} 米，追不上了。摔倒 <b>${G.falls}</b> 次。`,
      '再来一次');
  }, 1400);
}

// ---------- 完美提示 ----------
let perfectTimer = 0;
function flashPerfect(){ perfectTimer = 0.7; }

// ============================================================
// 姿势：每帧算出“目标姿势”，再平滑逼近（摔倒/起身自然过渡）
// ============================================================
const BONES = ['pelvis', 'spine', 'head', 'armL', 'armR', 'legL', 'legR'];
let TGT = {};
let BTGT = { rz: 0, ry: 0, y: 0 };

function buildPoseTargets(now){
  const t = now * 0.001;
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };

  // 呼吸（任何时候都有）
  const br = Math.sin(t * 2.1);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.035;
  TGT.armL.z = 0.035 + br * 0.03;
  TGT.armR.z = -0.035 - br * 0.03;

  if(G.state === 'step'){
    const s = Math.sin(Math.PI * Math.min(1, G.stepT));
    const leftStep = G.stepSide === 'L';
    // 迈出去的那条腿往前摆，支撑腿稍微后顶
    TGT[leftStep ? 'legL' : 'legR'].z = -0.42 * s;
    TGT[leftStep ? 'legR' : 'legL'].z = 0.16 * s;
    // 手臂反着摆
    const arm = leftStep ? 0.32 : -0.32;
    TGT.armL.z += arm * s;
    TGT.armR.z += arm * s;
    // 身体：轻微上下 + 左右侧倾 + 转体
    BTGT.y = 0.075 * s;
    BTGT.rz = (leftStep ? 1 : -1) * 0.06 * s;
    BTGT.ry = (leftStep ? -1 : 1) * 0.11 * s;
    TGT.head.z = -BTGT.rz * 0.5;
  }
  else if(G.state === 'fall'){
    const k = Math.min(1, G.fallT / CONFIG.fall.down);
    const ang = G.fallAngle * Math.pow(k, 1.5);
    BTGT.rz = ang;
    BTGT.y = -0.10 * k;
    TGT.armL.z = 0.35 + 0.75 * k;
    TGT.armR.z = -0.35 - 0.75 * k;
    TGT.head.z = -ang * 0.3;
    TGT.legL.z = 0.30 * k;
    TGT.legR.z = -0.22 * k;
    TGT.spine.x = -0.15 * k;
  }
  else if(G.state === 'getup'){
    const k = Math.min(1, G.upT / CONFIG.fall.up);
    const ang = G.fallAngle * (1 - easeOutCubic(k));
    BTGT.rz = ang;
    BTGT.y = Math.sin(Math.PI * k) * 0.10 - 0.10 * (1 - k);
    TGT.armL.z = 0.55 * (1 - k);
    TGT.armR.z = -0.55 * (1 - k);
    TGT.head.z = -ang * 0.3;
    TGT.spine.x = -0.20 * (1 - k);
  }
  else if(G.state === 'win'){
    const hop = Math.abs(Math.sin(t * 5.2));
    BTGT.y = hop * 0.20;
    TGT.armL.z = 1.35 + hop * 0.2;
    TGT.armR.z = -1.35 - hop * 0.2;
    TGT.head.x = -0.15;
  }
  else if(G.state === 'lose'){
    BTGT.y = -0.03;
    TGT.head.x = 0.34;
    TGT.spine.x = 0.12;
    TGT.armL.z = 0.12;
    TGT.armR.z = -0.12;
  }
  else {
    // idle：除了呼吸，腿微微弯一点，显得不是僵住
    TGT.legL.z = 0.045;
    TGT.legR.z = -0.045;
  }
}

function applyPose(dt){
  if(!frog) return;
  const a = 1 - Math.exp(-dt * 14);
  for(const k of BONES){
    const p = frog.parts[k];
    if(!p || !TGT[k]) continue;
    p.pose.x += (TGT[k].x - p.pose.x) * a;
    p.pose.y += (TGT[k].y - p.pose.y) * a;
    p.pose.z += (TGT[k].z - p.pose.z) * a;
    p.bone.rotation.set(p.pose.x, p.pose.y, p.pose.z);
  }
  frog.body.rotation.z += (BTGT.rz - frog.body.rotation.z) * a;
  frog.body.rotation.y += (BTGT.ry - frog.body.rotation.y) * a;
  frog.body.position.y += (BTGT.y - frog.body.position.y) * a;
}

// ============================================================
// 第二关：奶蛙上公交（三段式：双指蓄力跳 → 长按抓扶手 → 上滑钻车门）
// ============================================================
const L2 = {
  active: false, done: false, phase: 'charge', phaseT: 0,
  timeLeft: 0, misses: 0, checkpoint: 'charge',
  fx: 0, fy: 0,                 // 奶蛙实际位置
  fromX: 0, fromY: 0, toX: 0, toY: 0,
  down: { L: false, R: false }, downAt: { L: 0, R: 0 },
  bothAt: 0, chargeT: 0,
  railHolding: false, railT: 0,
  swipeY0: null,
  missAngle: 0.9,
  props: null,
  hudCache: '',
};
window.__l2 = L2;   // 方便调试

function buildL2Props(){
  if(L2.props) return L2.props;
  const g = new THREE.Group();
  const C = CONFIG.lvl2;
  // 三级台阶（越往后越高，最后一级顶上站奶蛙）
  for(let i = 0; i < 3; i++){
    const h = 0.46 * (i + 1);
    addBox(0.5, h, 1.4, i % 2 ? 0xd7dde8 : 0xc6cfdf, 7.55 + i * 0.5, h / 2, 0, g);
  }
  // 扶手（竖杆 + 横 handle），立在台阶顶右侧、镜头这一侧
  addBox(0.09, 1.5, 0.09, 0xd9a441, 8.75, 2.2, 1.5, g);
  addBox(0.55, 0.09, 0.09, 0xd9a441, 8.98, 2.95, 1.5, g);
  // 车门：金属门框 + 两扇玻璃 + 黄色门缝（底边略高于台阶顶，避免和台阶穿插）
  addBox(1.42, 1.75, 0.07, 0x9aa8bb, C.doorX, 2.36, 1.36, g);
  addBox(0.58, 1.52, 0.05, 0x1f4a66, C.doorX - 0.32, 2.36, 1.42, g);
  addBox(0.58, 1.52, 0.05, 0x1f4a66, C.doorX + 0.32, 2.36, 1.42, g);
  addBox(0.05, 1.52, 0.06, 0xffd93d, C.doorX, 2.36, 1.44, g);
  // 上车踏面（连着台阶顶和车门）
  addBox(1.35, 0.12, 1.05, 0x9aa8bb, C.doorX - 0.1, 1.44, 0.85, g);
  // 地面引导箭头（指向台阶）
  const arr = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.62, 3),
    new THREE.MeshLambertMaterial({ color: 0xffb400 })
  );
  arr.rotation.z = -Math.PI / 2;
  arr.position.set(6.95, 0.045, 0.35);
  g.add(arr);

  g.visible = false;
  scene.add(g);
  L2.props = g;
  return g;
}

function setL2Phase(p){
  L2.phase = p;
  L2.phaseT = 0;
  if(p === 'charge' || p === 'air'){
    el.railBtn.classList.remove('on', 'hold');
    el.swipeHint.classList.remove('on');
    el.l2Task.textContent = '双指同时按住左右两个按钮蓄力，松手起跳';
  }else if(p === 'rail'){
    el.railBtn.classList.add('on');
    el.swipeHint.classList.remove('on');
    el.l2Task.textContent = '按住中间的「扶手」按钮，坚持 0.6 秒别松手';
  }else if(p === 'swipe'){
    el.railBtn.classList.remove('on', 'hold');
    el.swipeHint.classList.add('on');
    el.l2Task.textContent = '抓住扶手了！手指向上滑动，钻进车门';
  }else if(p === 'enter' || p === 'win'){
    el.railBtn.classList.remove('on', 'hold');
    el.swipeHint.classList.remove('on');
    el.l2Task.textContent = p === 'win' ? '🎉 上车成功' : '正在爬进车门…';
  }else if(p === 'miss'){
    el.railBtn.classList.remove('on', 'hold');
    el.swipeHint.classList.remove('on');
  }
  el.l2ChargeWrap.classList.toggle('on', p === 'charge');
  if(p !== 'charge') el.l2ChargeWrap.classList.remove('on');
}

function startLevel2(){
  const C = CONFIG.lvl2;
  L2.active = true; L2.done = false;
  L2.timeLeft = C.time; L2.misses = 0;
  L2.checkpoint = 'charge';
  L2.fx = C.startX; L2.fy = 0;
  L2.down.L = L2.down.R = false;
  L2.downAt.L = L2.downAt.R = 0;
  L2.bothAt = 0; L2.chargeT = 0;
  L2.railHolding = false; L2.railT = 0;
  L2.swipeY0 = null;
  L2.hudCache = '';

  ring.visible = false;
  for(const p of pads) p.visible = false;
  const props = buildL2Props();
  props.visible = true;

  if(bus) bus.root.position.x = C.busX;
  if(frog){
    frog.root.position.set(C.startX, 0, 0);
    frog.root.rotation.y = CONFIG.frog.yaw;
    frog.body.rotation.set(0, 0, 0);
    frog.body.position.set(0, 0, 0);
    for(const k in frog.parts){
      const p = frog.parts[k];
      p.pose.x = p.pose.y = p.pose.z = 0;
    }
  }
  G.camX = 9.9; G.camZ = CONFIG.cam.z;
  document.body.classList.add('level2');
  if(el.btnL) el.btnL.innerHTML = '<span>←</span>按住';
  if(el.btnR) el.btnR.innerHTML = '<span>→</span>按住';
  setL2Phase('charge');
  updateL2HUD();
}

function setLevel1Scene(){
  document.body.classList.remove('level2');
  L2.active = false; L2.done = false;
  if(L2.props) L2.props.visible = false;
  if(el.btnL) el.btnL.innerHTML = '<span>←</span>左脚';
  if(el.btnR) el.btnR.innerHTML = '<span>→</span>右脚';
  ring.visible = true;
  for(const p of pads) p.visible = true;
}

// ---- 第二步：长按抓扶手 ----
function l2RailDown(){
  if(G.level !== 2 || L2.phase !== 'rail' || L2.railHolding) return;
  L2.railHolding = true; L2.railT = 0;
  el.railBtn.classList.add('hold');
}
function l2RailUp(){
  if(G.level !== 2 || !L2.railHolding) return;
  L2.railHolding = false;
  el.railBtn.classList.remove('hold');
  if(L2.phase === 'rail' && L2.railT < CONFIG.lvl2.railHold) l2Miss('手滑了，没抓住扶手');
}

// ---- 第三步：上滑钻车门 ----
function l2Swipe(){
  if(G.level !== 2 || L2.phase !== 'swipe') return;
  const C = CONFIG.lvl2;
  L2.fromX = L2.fx; L2.fromY = L2.fy;
  L2.toX = C.doorX; L2.toY = C.doorY;
  setL2Phase('enter');
}

function l2ChargeStart(){
  if(G.level !== 2 || L2.phase !== 'charge') return;
  const now = performance.now();
  if(L2.down.L && L2.down.R){
    L2.bothAt = Math.max(L2.downAt.L, L2.downAt.R);
    if(!L2.chargeT) L2.chargeT = (now - L2.bothAt) / 1000;
  }
}

function l2PadDown(side){
  if(G.level !== 2 || !L2.active) return;
  if(L2.phase !== 'charge') return;      // 只有第一阶段才记蓄力，避免别的阶段误按
  L2.down[side] = true;
  L2.downAt[side] = performance.now();
  l2ChargeStart();
}

function l2PadUp(side){
  if(G.level !== 2) return;
  L2.down[side] = false;
  if(L2.phase !== 'charge' || !L2.bothAt) return;
  const held = (performance.now() - L2.bothAt) / 1000;
  L2.bothAt = 0; L2.chargeT = 0;
  l2Jump(held);
}

function l2Jump(held){
  const C = CONFIG.lvl2;
  if(held < C.chargeMin){ l2Miss('蓄力太短，跳不上去'); return; }
  if(held > C.chargeMax){ l2Miss('蓄力过头，脚底一滑'); return; }
  if(held >= C.perfectMin && held <= C.perfectMax){
    L2.timeLeft += 0.5;               // 踩中绿区奖励
    el.l2TimeChip.classList.remove('low');
  }
  L2.fromX = L2.fx; L2.fromY = L2.fy;
  L2.toX = C.stepTopX; L2.toY = C.stepTopY;
  setL2Phase('air');
}

function l2Miss(reason){
  if(!L2.active || L2.done || L2.phase === 'miss') return;
  const C = CONFIG.lvl2;
  L2.misses++;
  L2.timeLeft = Math.max(0, L2.timeLeft - C.missPenalty);
  // 摔向哪边：看你是在台阶上还是地上
  L2.missAngle = (L2.checkpoint === 'rail') ? -0.9 : 0.9;
  setL2Phase('miss');
  el.l2Task.textContent = '失误：' + reason + '（-' + C.missPenalty + ' 秒）';
  updateL2HUD();
  if(L2.timeLeft <= 0) setTimeout(l2Lose, 700);
}

function l2Respawn(){
  const C = CONFIG.lvl2;
  L2.down.L = L2.down.R = false;
  L2.downAt.L = L2.downAt.R = 0;
  L2.bothAt = 0; L2.chargeT = 0;
  L2.railHolding = false; L2.railT = 0;
  if(L2.checkpoint === 'rail'){
    L2.fx = C.stepTopX; L2.fy = C.stepTopY;
    setL2Phase('rail');
  }else{
    L2.fx = C.startX; L2.fy = 0;
    setL2Phase('charge');
  }
  el.l2Task.textContent = L2.phase === 'rail'
    ? '按住中间的「扶手」按钮，坚持 0.6 秒别松手'
    : '双指同时按住左右两个按钮蓄力，松手起跳';
}

function l2Win(){
  if(L2.done) return;
  const C = CONFIG.lvl2;
  L2.done = true; L2.active = false;
  const used = Math.max(0, C.time - L2.timeLeft).toFixed(1);
  setL2Phase('win');
  updateL2HUD();
  setTimeout(()=>{
    showOverlay('🚌 上车成功！',
      '用时 ' + used + ' 秒 · 失误 ' + L2.misses + ' 次', '再玩一次');
  }, 1300);
}

function l2Lose(){
  if(L2.done) return;
  L2.done = true; L2.active = false;
  setL2Phase('miss');
  showOverlay('时间到…', '车门关上了，奶蛙还没上去', '再试一次');
}

// 第二关的姿势
function l2Pose(dt, now){
  const t = now * 0.001;
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };
  const br = Math.sin(t * 2.1);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.035;
  TGT.armL.z = 0.035 + br * 0.03;
  TGT.armR.z = -0.035 - br * 0.03;

  if(L2.phase === 'charge'){
    const c = Math.min(1, L2.chargeT / 1.2);
    BTGT.y = -0.14 * c;
    TGT.legL.z = 0.22 * c;
    TGT.legR.z = -0.22 * c;
    TGT.spine.x = 0.12 * c;
    TGT.armL.z = 0.35 * c;
    TGT.armR.z = -0.35 * c;
  }else if(L2.phase === 'air'){
    TGT.armL.z = 1.25;  TGT.armR.z = -1.25;
    TGT.legL.z = 0.34;  TGT.legR.z = -0.30;
  }else if(L2.phase === 'rail'){
    TGT.armL.z = 1.45;  TGT.armR.z = -1.45;
    TGT.legL.z = 0.22;  TGT.legR.z = -0.18;
    BTGT.y = L2.railHolding ? 0.05 : 0;
  }else if(L2.phase === 'swipe'){
    TGT.armL.z = 1.45;  TGT.armR.z = -1.45;
    TGT.legL.z = -0.12; TGT.legR.z = 0.12;
  }else if(L2.phase === 'enter'){
    TGT.armL.z = 1.30;  TGT.armR.z = -1.30;
    TGT.legL.z = 0.38;  TGT.legR.z = -0.32;
  }else if(L2.phase === 'miss'){
    const k = Math.min(1, L2.phaseT / 0.45);
    BTGT.rz = L2.missAngle * k;
    BTGT.y = -0.06 * k;
    TGT.armL.z = 0.55 * k;
    TGT.armR.z = -0.55 * k;
  }else if(L2.phase === 'win'){
    const hop = Math.abs(Math.sin(t * 5.2));
    BTGT.y = hop * 0.20;
    TGT.armL.z = 1.35 + hop * 0.2;
    TGT.armR.z = -1.35 - hop * 0.2;
    TGT.head.x = -0.15;
  }
  applyPose(dt);
}

function l2Camera(dt){
  const portrait = camera.aspect < 1.15;
  let wantX = 9.9, wantZ = CONFIG.cam.z;
  if(portrait){
    const halfNeed = 5.4;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
    wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), CONFIG.cam.z, 34);
    wantX = 10.3;
  }
  G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * 3));
  G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * 3));
  camera.position.x = G.camX;
  camera.position.y = CONFIG.cam.y;
  camera.position.z = G.camZ;
  camera.lookAt(G.camX, 1.55, 0);
  scene.fog.near = Math.max(26, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 54;
}

function updateL2HUD(){
  const key = L2.timeLeft.toFixed(1) + '/' + L2.misses;
  if(key === L2.hudCache) return;
  L2.hudCache = key;
  el.l2Time.textContent = L2.timeLeft.toFixed(1);
  el.l2Miss.textContent = L2.misses;
  el.l2TimeChip.classList.toggle('low', L2.timeLeft <= 8);
}

function updateLevel2(dt, now){
  L2.phaseT += dt;

  if(L2.active && !L2.done){
    L2.timeLeft -= dt;
    if(L2.timeLeft <= 0){
      L2.timeLeft = 0;
      l2Lose();
    }
  }

  if(L2.phase === 'charge'){
    if(L2.down.L && L2.down.R && L2.bothAt){
      L2.chargeT = (now - L2.bothAt) / 1000;
    }else if(!L2.bothAt){
      L2.chargeT = 0;
    }
    const C = CONFIG.lvl2;
    el.l2ChargeFill.style.width = Math.min(100, (L2.chargeT / C.chargeMax) * 100).toFixed(1) + '%';
    el.l2ChargeWrap.classList.toggle('on', L2.chargeT > 0.02);
  }else if(L2.phase === 'air'){
    const C = CONFIG.lvl2;
    const k = Math.min(1, L2.phaseT / C.jumpT);
    L2.fx = L2.fromX + (L2.toX - L2.fromX) * easeOutCubic(k);
    L2.fy = L2.fromY + (L2.toY - L2.fromY) * easeOutCubic(k) + Math.sin(Math.PI * k) * 0.55;
    if(k >= 1){
      L2.fx = L2.toX; L2.fy = L2.toY;
      L2.checkpoint = 'rail';
      setL2Phase('rail');
    }
  }else if(L2.phase === 'rail'){
    if(L2.railHolding){
      L2.railT += dt;
      if(L2.railT >= CONFIG.lvl2.railHold){
        L2.railHolding = false;
        el.railBtn.classList.remove('hold');
        setL2Phase('swipe');
      }
    }
  }else if(L2.phase === 'enter'){
    const k = Math.min(1, L2.phaseT / 0.5);
    L2.fx = L2.fromX + (L2.toX - L2.fromX) * easeInOutCubic(k);
    L2.fy = L2.fromY + (L2.toY - L2.fromY) * k;
    if(k >= 1) l2Win();
  }else if(L2.phase === 'miss'){
    if(L2.phaseT >= 0.9) l2Respawn();
  }

  if(frog){
    frog.root.position.x = L2.fx;
    frog.root.position.y = L2.fy;
    l2Pose(dt, now);
  }
  if(bus) bus.root.position.y = 0.012 * Math.sin(now * 0.008);

  l2Camera(dt);
  updateL2HUD();
}

// ============================================================
// 每帧更新
// ============================================================
let lastT = performance.now();

function update(dt, now){
  if(G.level === 2){ updateLevel2(dt, now); return; }
  // ---- 节拍器 ----
  if(G.started && !G.over){
    let guard = 0;
    while(now >= G.beatAt && guard++ < 5){
      G.tickCount++;
      Sfx.tick(G.tickCount % 4 === 0);
      G.beatAt += BEAT_MS;
    }
  }

  // ---- 迈步位移 ----
  if(G.state === 'step'){
    G.stepT += dt / CONFIG.step.dur;
    if(G.stepT >= 1){ G.stepT = 1; G.state = 'idle'; }
    G.x = G.stepFrom + (G.stepTo - G.stepFrom) * easeInOutCubic(G.stepT);
  }

  // ---- 摔倒 / 起身计时 ----
  if(G.state === 'fall'){
    G.fallT += dt;
    if(G.fallT >= CONFIG.fall.down){ G.state = 'getup'; G.upT = 0; }
  }
  else if(G.state === 'getup'){
    G.upT += dt;
    if(G.upT >= CONFIG.fall.up){
      G.state = 'idle'; G.upT = 0;
      // 摔倒起身后重新开始：左右脚都可以先出
      G.hasStepped = false; G.lastSide = null;
      G.lastClickAt = now;      // 站起来后重新给玩家一个完整的节拍窗口
    }
  }

  // ---- 发呆太久自动失衡（公交会越跑越远）----
  if(G.started && !G.over && G.hasStepped && (G.state === 'idle' || G.state === 'step')){
    if(now - G.lastClickAt > BEAT_MS * CONFIG.beat.slowRatio + 120) doFall('slow', now, null);
  }

  // ---- 公交车 ----
  if(G.started && !G.over){
    if(G.busSpeed < CONFIG.bus.speed) G.busSpeed = Math.min(CONFIG.bus.speed, G.busSpeed + dt * 6);
    G.busX += G.busSpeed * dt;
  }
  else if(G.over && G.state === 'win'){
    // 终点：刹车停下
    G.busSpeed = Math.max(0, G.busSpeed - dt * 3);
    G.busX += G.busSpeed * dt;
  }
  if(bus){
    bus.root.position.x = G.busX;
    bus.root.position.y = 0.012 * Math.sin(now * 0.008);   // 车身轻微颠动
  }

  // ---- 胜负判定 ----
  if(G.started && !G.over){
    const gap = G.busX - G.x;
    if(gap <= CONFIG.bus.winGap) winGame();
    else if(gap >= CONFIG.bus.loseGap) loseGame();
  }

  // ---- 奶蛙位置 ----
  if(frog){
    frog.root.position.x = G.x;

    buildPoseTargets(now);
    applyPose(dt);
  }

  // ---- 节奏圈 + 落脚提示板 ----
  const since = G.hasStepped ? now - G.lastClickAt : BEAT_MS;
  const inWindow = G.hasStepped && since >= BEAT_MS * CONFIG.beat.fastRatio && since <= BEAT_MS * CONFIG.beat.slowRatio;
  const tooLate = since > BEAT_MS * CONFIG.beat.slowRatio * 0.92;
  ring.material.color.setHex(tooLate ? 0xff9a3d : (inWindow ? 0x3ddc84 : 0x7f8ea8));
  ring.material.opacity = G.over ? 0.25 : (inWindow ? 0.95 : 0.6);
  ring.position.x = G.x;
  const bp = 1 - Math.max(0, (G.beatAt - now) / BEAT_MS);
  ring.scale.setScalar(0.95 + 0.35 * (1 - bp));
  for(let i = 0; i < pads.length; i++){
    pads[i].position.x = G.x + CONFIG.step.dist * (i + 1);
    pads[i].material.opacity = (0.55 - i * 0.075) * (G.over ? 0.5 : 1);
  }

  // ---- 相机跟随 ----
  const portrait = camera.aspect < 1.15;
  if(G.started){
    const gap = Math.max(0, G.busX - G.x);
    let wantX, wantZ;
    if(portrait){
      // 竖屏横向视野很窄：镜头停在奶蛙和公交之间，并按需要的横向范围自动拉远
      wantX = G.x + Math.min(gap * 0.45, 3.4);
      const halfNeed = (gap + CONFIG.bus.length * 0.5) * 0.5;     // 需要看到奶蛙到公交车头的半宽
      const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
      wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), CONFIG.cam.z, 30);
    }else{
      // 公交越拉越远时，镜头稍微往前推，尽量让公交留在画面里
      wantX = G.x + CONFIG.cam.leadX + THREE.MathUtils.clamp((gap - 5.5) * 0.5, 0, 3.4);
      wantZ = CONFIG.cam.z;
    }
    G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * CONFIG.cam.follow));
    G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * CONFIG.cam.follow));
  }
  else if(G.ready){
    // 主页面 / 关卡列表：镜头缓慢漂移，让 Street 有生气
    const gap = Math.max(0, G.busX - G.x);
    let wantX, wantZ;
    if(portrait){
      const halfNeed = (gap + CONFIG.bus.length * 0.5) * 0.5;
      const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
      wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), CONFIG.cam.z, 30);
      wantX = G.x + Math.min(gap * 0.45, 3.4);
    }else{
      wantX = G.x + CONFIG.cam.leadX + 2.0;   // 首页让奶蛙偏左，别被面板挡住
      wantZ = CONFIG.cam.z;
    }
    const drift = Math.sin(now * 0.00045);
    wantX += drift * (portrait ? 0.9 : 1.9);
    wantZ += drift * (portrait ? 0.5 : 0.35);
    G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * 2.2));
    G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * 2.2));
  }
  camera.position.x = G.camX;
  camera.position.y = CONFIG.cam.y;
  camera.position.z = G.camZ;
  camera.lookAt(G.camX, 1.35, 0);
  // 竖屏镜头拉远后，雾也要跟着推远，否则街道会整片发白
  scene.fog.near = Math.max(26, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 54;

  // ---- 完美提示淡出 ----
  if(perfectTimer > 0) perfectTimer -= dt;
  el.perfects.classList.toggle('flash', perfectTimer > 0);

  updateHUD();
}

function updateHUD(){
  const gap = Math.max(0, G.busX - G.x);
  const span = CONFIG.bus.loseGap - CONFIG.bus.winGap;
  const p = THREE.MathUtils.clamp((gap - CONFIG.bus.winGap) / span, 0, 1);
  el.gapFill.style.width = (p * 100).toFixed(1) + '%';
  el.gapText.textContent = Math.max(0, gap - CONFIG.bus.winGap).toFixed(1) + ' m';
  el.falls.textContent = G.falls;
  el.perfects.textContent = G.perfects;
  el.nextFoot.textContent = !G.hasStepped ? '任意' : (G.lastSide === 'L' ? '右脚' : '左脚');
}

function frame(){
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  if(dt > 0.05) dt = 0.05;
  update(dt, now);
  renderer.render(scene, camera);
}

// ============================================================
// 输入
// ============================================================
addEventListener('keydown', e=>{
  if(e.repeat) return;
  const k = e.key.toLowerCase();
  if(G.level === 2){
    if(k === 'arrowleft' || k === 'a'){ e.preventDefault(); l2PadDown('L'); }
    else if(k === 'arrowright' || k === 'd'){ e.preventDefault(); l2PadDown('R'); }
    else if(k === ' ' || k === 's'){ e.preventDefault(); l2RailDown(); }
    else if(k === 'arrowup' || k === 'w'){ e.preventDefault(); l2Swipe(); }
    else if(k === 'r' && G.over) startGame(2);
    return;
  }
  if(k === 'arrowleft' || k === 'a'){ e.preventDefault(); pressFoot('L'); }
  else if(k === 'arrowright' || k === 'd'){ e.preventDefault(); pressFoot('R'); }
  else if(k === 'r' && G.over){ startGame(1); }
});

addEventListener('keyup', e=>{
  if(G.level !== 2) return;
  const k = e.key.toLowerCase();
  if(k === 'arrowleft' || k === 'a') l2PadUp('L');
  else if(k === 'arrowright' || k === 'd') l2PadUp('R');
  else if(k === ' ' || k === 's') l2RailUp();
});

for(const [id, side] of [['btnL', 'L'], ['btnR', 'R']]){
  const node = document.getElementById(id);
  node.addEventListener('pointerdown', e=>{
    e.preventDefault();
    if(G.level === 2) l2PadDown(side);
    else pressFoot(side);
  }, { passive: false });   // 只监听 pointer 事件，避免触摸时重复触发
  node.addEventListener('pointerup', ()=>{ if(G.level === 2) l2PadUp(side); });
  node.addEventListener('pointercancel', ()=>{ if(G.level === 2) l2PadUp(side); });
  node.addEventListener('contextmenu', e=>e.preventDefault());
}

// 第二关：长按扶手
el.railBtn.addEventListener('pointerdown', e=>{ e.preventDefault(); l2RailDown(); }, { passive: false });
el.railBtn.addEventListener('pointerup', ()=>l2RailUp());
el.railBtn.addEventListener('pointercancel', ()=>l2RailUp());
el.railBtn.addEventListener('contextmenu', e=>e.preventDefault());

// 第二关：上滑手势
document.addEventListener('pointerdown', e=>{
  if(G.level !== 2 || L2.phase !== 'swipe') return;
  L2.swipeY0 = e.clientY;
}, { passive: true });
document.addEventListener('pointermove', e=>{
  if(G.level !== 2 || L2.phase !== 'swipe' || L2.swipeY0 === null) return;
  if(L2.swipeY0 - e.clientY >= CONFIG.lvl2.swipeDist){
    L2.swipeY0 = null;
    l2Swipe();
  }
}, { passive: true });
document.addEventListener('pointerup', ()=>{ L2.swipeY0 = null; }, { passive: true });

el.homeBtn.addEventListener('click', ()=>showLevels());
el.backHomeBtn.addEventListener('click', ()=>showHome());
el.lv1.addEventListener('click', ()=>startGame(1));
el.lv2.addEventListener('click', ()=>startGame(2));
el.ovBtn.addEventListener('click', ()=>startGame(G.level || 1));
el.ovHomeBtn.addEventListener('click', ()=>showHome());
el.homeChip.addEventListener('click', ()=>showHome());

function startGame(level){
  if(!G.ready) return;      // 素材还没加载完
  G.level = (level === 2) ? 2 : 1;
  G.screen = 'game';
  el.overlay.classList.remove('show');
  document.body.classList.add('ingame');
  if(G.level === 2) startLevel2();
  else { setLevel1Scene(); resetGame(); }
}

// ============================================================
// 启动
// ============================================================
async function boot(){
  try{
    const [f, b] = await Promise.all([
      loadFrog('assets/rigged.glb', CONFIG.frog.height),
      loadBus(),
    ]);
    frog = f;
    setSkin(frog, CONFIG.frog.head, CONFIG.frog.belly);   // 黄色奶蛙
    frog.root.rotation.y = CONFIG.frog.yaw;              // 转身朝右（前进方向）
    scene.add(frog.root);
    // 脚下的一团软阴影，让人物“踩”在地上
    const shadow = makeShadow(1.15, 0.55);
    shadow.position.y = 0.011;
    frog.root.add(shadow);

    bus = b;
    bus.root.position.x = G.busX;

    G.ready = true;
    el.loading.classList.remove('show');
    showHome();          // 先回主页面，不直接进关卡
    frame();

  }catch(err){
    console.error('加载失败：', err);
    el.loading.textContent = '加载失败：' + err.message;
  }
}

boot();
