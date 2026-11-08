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
  // 第二关：上公交车（双手同时协作：双指按住 → 左右交替单手短松蹬台阶）
  lvl2 : {
    time: 30, missPenalty: 3,
    settle: 0.30,          // 每次蹬腿后必须双手按住稳住这么久，才能再松手
    releaseWindow: 0.55,   // 单手最多松开这么久，超时就算脱手摔倒
    climbT: 0.32,          // 蹬上一级台阶的动画时长
    startX: 6.3, busX: 12.3,
    doorX: 10.15, doorY: 1.44,
    // 攀爬路线：地面 → 三级台阶顶 → 车门口，共 4 步
    points: [[6.3, 0], [7.55, 0.46], [8.05, 0.92], [8.55, 1.38], [9.05, 1.44]],
  },
  // 第三关：下车（手脚对角配合：松一只手 → 踩同侧的脚，撑住的手正好在对角）
  lvl3 : {
    time: 30, missPenalty: 3,
    settle: 0.25,          // 双手扶稳这么久，才提示可以松手
    releaseWindow: 0.60,   // 松手后必须在这么久内踩下台阶，否则撑不住
    stepT: 0.34,           // 下一级台阶的动画时长
    busX: 12.3,
    grabX: 9.30,           // 门框边上的抓手位置
    // 下车路线：车门踏面 → 三级台阶 → 地面，共 4 步
    points: [[9.05, 1.44], [8.55, 1.38], [8.05, 0.92], [7.55, 0.46], [6.60, 0]],
  },
  // 第四关：撑伞过马路（三指协调：左手长按撑伞 · 右手滑屏扶正 · 左右脚交替点地）
  lvl4 : {
    startX: 1.45, stepLen: 0.75, steps: 8, stepT: 0.26,
    // 风力分三段逐渐变强：[振幅, 周期(秒)]
    windPhases: [[0.30, 2.6], [0.48, 2.1], [0.64, 1.7]],
    leanGain: 0.92,        // 风力作用到伞的倾斜系数
    leanTau: 0.72,         // 按住伞时被风带歪的速度
    leanTauLoose: 0.24,    // 没按住伞时歪得更快
    missLean: 0.76,        // 倾斜超过这个 → 伞被吹翻
    stepLean: 0.52,        // 倾斜必须小于这个才踩得动（对应量表绿区）
    dragK: 0.0032,         // 滑动 1px 能扶正多少
    leanClamp: 1.15,
    gripGrace: 0.55,       // 松开伞最多能空这么久
    missHold: 1.0,         // 摔倒后原地起身的时长
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
  lv3      : document.getElementById('lv3'),
  lv4      : document.getElementById('lv4'),
  swipeZone: document.getElementById('swipeZone'),
  l4WindNeedle: document.getElementById('l4WindNeedle'),
  l4WindArrow : document.getElementById('l4WindArrow'),
  l4WindLv    : document.getElementById('l4WindLv'),
  l2TimeLbl : document.getElementById('l2TimeLbl'),
  l2StepLbl : document.getElementById('l2StepLbl'),
  l2Time   : document.getElementById('l2Time'),
  l2Miss   : document.getElementById('l2Miss'),
  l2TimeChip: document.getElementById('l2TimeChip'),
  l2Task   : document.getElementById('l2Task'),
  l2Step   : document.getElementById('l2Step'),
  l2ProgWrap: document.getElementById('l2ProgWrap'),
  l2ProgFill: document.getElementById('l2ProgFill'),
  btnL     : document.getElementById('btnL'),
  btnR     : document.getElementById('btnR'),
  footL    : document.getElementById('footL'),
  footR    : document.getElementById('footR'),
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
// 第二关：奶蛙上公交（一体化协调）
//
// 规则只有一条，但两只手必须同时在做事：
//   1) 双指同时按住左右把手，才算稳住身体；
//   2) 想蹬上一级台阶，必须「松开一只手 → 立刻再按住」，
//      松开的那只手 ≤ 0.55 秒，另一只手必须一直撑住；
//   3) 蹬完要双手按住稳 0.3 秒才能松下一次，而且左右手必须交替。
//   任何一刻两只手同时离开 → 摔；支撑手在松手期间松开 → 摔。
//   4 次交替 = 三级台阶 + 钻进车门。
// ============================================================
const L2 = {
  active: false, done: false, phase: 'ready', phaseT: 0,
  timeLeft: 0, misses: 0,
  fx: 0, fy: 0,                 // 奶蛙实际位置
  fromX: 0, fromY: 0, toX: 0, toY: 0, climbT: 0,
  step: 0,                      // 已完成的蹬腿次数
  down: { L: false, R: false },
  relSide: null, relT: 0,       // 当前松开的那只手 / 已松开多久
  settleT: 0,                   // 双手按住稳住的累计时间
  lastLift: null,               // 上一步松的是哪只手（下一步必须换手）
  beatAt: 0,
  noteT: 0,                     // 临时提示的剩余显示时间
  missAngle: 0.9,
  props: null,
  hudCache: '', taskCache: '',
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
  // 扶手（竖杆 + 横 handle）：左右各一根，奶蛙双手分别抓着往上蹬
  addBox(0.09, 1.6, 0.09, 0xd9a441, 8.6, 2.2, 0.8, g);
  addBox(0.55, 0.09, 0.09, 0xd9a441, 8.38, 3.0, 0.8, g);
  addBox(0.09, 1.6, 0.09, 0xd9a441, 8.6, 2.2, -0.8, g);
  addBox(0.55, 0.09, 0.09, 0xd9a441, 8.38, 3.0, -0.8, g);
  // 车门：开在车身靠车尾这一侧（金属门框 + 两扇玻璃 + 黄色门缝）
  addBox(1.42, 1.75, 0.07, 0x9aa8bb, C.doorX, 2.36, 1.36, g);
  addBox(0.58, 1.52, 0.05, 0x1f4a66, C.doorX - 0.32, 2.36, 1.42, g);
  addBox(0.58, 1.52, 0.05, 0x1f4a66, C.doorX + 0.32, 2.36, 1.42, g);
  addBox(0.05, 1.52, 0.06, 0xffd93d, C.doorX, 2.36, 1.44, g);
  // 上车踏面（连着台阶顶和车门，延伸到画面这一侧，奶蛙才踩得实）
  addBox(1.55, 0.12, 1.6, 0x9aa8bb, C.doorX - 0.75, 1.44, 0.55, g);
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

// 当前该松/该按哪只手：'L' | 'R' | 'both' | null
function l2HintSide(){
  if(!L2.active || L2.done) return null;
  if(L2.phase === 'ready') return 'both';
  if(L2.phase !== 'grip') return null;
  if(L2.relSide) return L2.relSide;                       // 松手了，提示快按回这只
  if(L2.settleT < CONFIG.lvl2.settle) return null;        // 还在稳住
  return L2.lastLift === 'L' ? 'R' : 'L';                 // 必须换另一只手
}

function l2TaskText(){
  const C = CONFIG.lvl2;
  if(L2.phase === 'ready') return '双指同时按住左右两个把手，稳住身体';
  if(L2.phase === 'climb') return '蹬！';
  if(L2.phase === 'grip'){
    if(L2.relSide) return '快按住「' + (L2.relSide === 'L' ? '左' : '右') + '手」！';
    if(L2.settleT < C.settle) return '双手按住，稳住…';
    if(!L2.lastLift) return '松开任意一只手，另一只手撑住，再按住';
    const s = L2.lastLift === 'L' ? '右' : '左';
    return '松开「' + s + '手」，另一只手撑住，再按住';
  }
  if(L2.phase === 'win') return '🎉 上车成功';
  return null;      // miss 的文案由 l2Miss 单独写
}

function l2SetTask(txt){
  if(!txt || !el.l2Task) return;
  if(L2.taskCache === txt) return;
  L2.taskCache = txt;
  el.l2Task.textContent = txt;
}

function l2ApplyHint(){
  const h = l2HintSide();
  if(el.btnL) el.btnL.classList.toggle('want', h === 'both' || h === 'L');
  if(el.btnR) el.btnR.classList.toggle('want', h === 'both' || h === 'R');
}

function setL2Phase(p){
  L2.phase = p;
  L2.phaseT = 0;
  const showBar = (p === 'ready' || p === 'grip' || p === 'climb');
  if(el.l2ProgWrap) el.l2ProgWrap.classList.toggle('on', showBar);
  if(p !== 'miss') l2SetTask(l2TaskText());
  l2ApplyHint();
}

function updateL2Progress(){
  const total = CONFIG.lvl2.points.length - 1;
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L2.step / total * 100).toFixed(1) + '%';
  if(el.l2Step) el.l2Step.textContent = L2.step + '/' + total;
}

function startLevel2(){
  const C = CONFIG.lvl2;
  resetL4Scene();
  L2.active = true; L2.done = false;
  L2.timeLeft = C.time; L2.misses = 0;
  L2.fx = C.startX; L2.fy = 0;
  L2.step = 0; L2.climbT = 0;
  L2.down.L = L2.down.R = false;
  L2.relSide = null; L2.relT = 0;
  L2.settleT = 0; L2.lastLift = null;
  L2.beatAt = performance.now() + BEAT_MS;
  L2.hudCache = ''; L2.taskCache = '';

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
  document.body.classList.remove('level3');
  document.body.classList.add('level2');
  if(L3.props) L3.props.visible = false;
  if(el.btnL){ el.btnL.classList.remove('drop'); el.btnL.classList.remove('want'); }
  if(el.btnR){ el.btnR.classList.remove('drop'); el.btnR.classList.remove('want'); }
  if(el.btnL) el.btnL.innerHTML = '<span>←</span>左手';
  if(el.btnR) el.btnR.innerHTML = '<span>→</span>右手';
  updateL2Progress();
  setL2Phase('ready');
  updateL2HUD();
  Sfx.init();
}

function setLevel1Scene(){
  resetL4Scene();
  document.body.classList.remove('level2');
  document.body.classList.remove('level3');
  L2.active = false; L2.done = false;
  L3.active = false; L3.done = false;
  if(L2.props) L2.props.visible = false;
  if(L3.props) L3.props.visible = false;
  if(el.btnL){
    el.btnL.innerHTML = '<span>←</span>左脚';
    el.btnL.classList.remove('want');
    el.btnL.classList.remove('drop');
  }
  if(el.btnR){
    el.btnR.innerHTML = '<span>→</span>右脚';
    el.btnR.classList.remove('want');
    el.btnR.classList.remove('drop');
  }
  if(el.footL) el.footL.classList.remove('want');
  if(el.footR) el.footR.classList.remove('want');
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  ring.visible = true;
  for(const p of pads) p.visible = true;
}

// ---- 两手输入：按住 = 抓稳，松开 = 蹬腿 ----
function l2PadDown(side){
  if(G.level !== 2 || !L2.active || L2.done) return;
  if(L2.phase === 'miss' || L2.phase === 'win') return;
  L2.down[side] = true;
  if(L2.phase === 'climb') return;      // 蹬腿动画中只记录手的状态

  if(L2.phase === 'ready'){
    if(L2.down.L && L2.down.R){
      L2.settleT = 0;
      setL2Phase('grip');               // 两只手都抓住了，开始攀爬
    }
    return;
  }

  if(L2.phase === 'grip' && L2.relSide === side){
    // 松开的那只手按回来了 → 这一级蹬上去
    const okSettle = L2.relSettleOk;
    L2.relSide = null; L2.relT = 0;
    if(!okSettle) return;               // 松得太急（还没稳住），这次不算
    if(L2.down.L && L2.down.R){
      if(side === L2.lastLift){
        L2.noteT = 0.9;
        l2SetTask('换另一只手上，左右交替才能往上蹬');
      }else{
        l2Climb(side);
      }
    }
  }
}

function l2PadUp(side){
  if(G.level !== 2 || !L2.active) return;
  L2.down[side] = false;
  if(L2.phase !== 'grip') return;

  if(L2.relSide && L2.relSide !== side){
    l2Miss('支撑的手也松了，摔下去了');
    return;
  }
  if(!L2.down.L && !L2.down.R){
    l2Miss('两只手同时松开，身体失去支撑');
    return;
  }
  if(!L2.relSide){
    L2.relSide = side;
    L2.relT = 0;
    L2.relSettleOk = (L2.settleT >= CONFIG.lvl2.settle);   // 没稳住就松手 = 白松
    L2.settleT = 0;
    l2SetTask(l2TaskText());
    l2ApplyHint();
  }
}

function l2Climb(side){
  const C = CONFIG.lvl2;
  const P = C.points;
  L2.lastLift = side;
  L2.step = Math.min(L2.step + 1, P.length - 1);
  L2.fromX = L2.fx; L2.fromY = L2.fy;
  L2.toX = P[L2.step][0];
  L2.toY = P[L2.step][1];
  L2.climbT = 0;
  L2.settleT = 0;
  L2.beatAt = performance.now() + BEAT_MS;
  Sfx.step();
  setL2Phase('climb');
  updateL2Progress();
}

function l2Miss(reason){
  if(!L2.active || L2.done || L2.phase === 'miss') return;
  const C = CONFIG.lvl2;
  L2.misses++;
  L2.timeLeft = Math.max(0, L2.timeLeft - C.missPenalty);
  L2.missAngle = L2.fy > 0.5 ? -0.9 : 0.9;   // 台阶上往后仰，地面上往前扑
  L2.relSide = null; L2.relT = 0; L2.relSettleOk = false;
  L2.settleT = 0;
  Sfx.thud();
  setL2Phase('miss');
  l2SetTask('失误：' + reason + '（-' + C.missPenalty + ' 秒）');
  updateL2HUD();
  if(L2.timeLeft <= 0) setTimeout(l2Lose, 700);
}

function l2Respawn(){
  const C = CONFIG.lvl2;
  const p = C.points[Math.min(L2.step, C.points.length - 1)];
  L2.fx = p[0]; L2.fy = p[1];
  L2.relSide = null; L2.relT = 0; L2.relSettleOk = false;
  L2.settleT = 0; L2.lastLift = null;
  L2.beatAt = performance.now() + BEAT_MS;
  if(L2.down.L && L2.down.R) setL2Phase('grip');
  else setL2Phase('ready');
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
  l2SetTask('时间到，车门关上了');
  showOverlay('时间到…', '车门关上了，奶蛙还没上去', '再试一次');
}

// 第二关的姿势：双手抓把手，松哪只手就抬哪条腿
function l2Pose(dt, now){
  const t = now * 0.001;
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };
  const br = Math.sin(t * 2.1);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.035;

  if(L2.phase === 'ready'){
    TGT.armL.z = 0.55 + br * 0.04;
    TGT.armR.z = -0.55 - br * 0.04;
    TGT.legL.z = 0.06;
    TGT.legR.z = -0.06;
  }else if(L2.phase === 'grip'){
    // 双手抓稳；正在松的那只手对应的腿抬起去蹬，另一条腿支撑
    TGT.armL.z = (L2.relSide === 'L') ? 0.85 : 1.30;
    TGT.armR.z = (L2.relSide === 'R') ? -0.85 : -1.30;
    TGT.spine.x = -0.05;
    const lift = L2.relSide === 'L' ? 1 : (L2.relSide === 'R' ? -1 : 0);
    TGT.legL.z = 0.10 + (lift > 0 ? 0.42 : 0);
    TGT.legR.z = -0.10 - (lift < 0 ? 0.42 : 0);
    BTGT.rz = lift * 0.10;
    BTGT.y = (L2.relSide ? 0.04 : 0) + br * 0.01;
  }else if(L2.phase === 'climb'){
    const k = Math.min(1, L2.climbT / CONFIG.lvl2.climbT);
    const s = Math.sin(Math.PI * k);
    TGT.armL.z = 1.30 - 0.22 * s;
    TGT.armR.z = -1.30 + 0.22 * s;
    TGT.legL.z = 0.34 * s;
    TGT.legR.z = -0.30 * s;
    TGT.spine.x = 0.10 * s;
  }else if(L2.phase === 'miss'){
    const k = Math.min(1, L2.phaseT / 0.45);
    BTGT.rz = L2.missAngle * k;
    BTGT.y = -0.06 * k;
    TGT.armL.z = 0.55 * k;
    TGT.armR.z = -0.55 * k;
    TGT.legL.z = 0.25 * k;
    TGT.legR.z = -0.20 * k;
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
  camera.position.y = CONFIG.cam.y + L2.fy * 0.45;
  camera.position.z = G.camZ;
  camera.lookAt(G.camX, 1.5 + L2.fy * 0.45, 0);
  scene.fog.near = Math.max(26, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 54;
}

function updateL2HUD(){
  const key = L2.timeLeft.toFixed(1) + '/' + L2.misses + '/' + L2.step;
  if(key === L2.hudCache) return;
  L2.hudCache = key;
  el.l2Time.textContent = L2.timeLeft.toFixed(1);
  el.l2Miss.textContent = L2.misses;
  el.l2TimeChip.classList.toggle('low', L2.timeLeft <= 8);
  updateL2Progress();
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
  if(L2.noteT > 0) L2.noteT -= dt;

  if(L2.phase === 'ready'){
    if(L2.down.L && L2.down.R){
      L2.settleT = 0;
      setL2Phase('grip');
    }
  }else if(L2.phase === 'grip'){
    const C = CONFIG.lvl2;
    if(L2.relSide){
      L2.relT += dt;
      if(L2.relT > C.releaseWindow){
        l2Miss('松手太久，另一只手撑不住');
      }
    }else if(L2.down.L && L2.down.R){
      L2.settleT += dt;
    }
    if(L2.phase === 'grip' && L2.noteT <= 0) l2SetTask(l2TaskText());
    // 节拍提示音：稳住之后每拍轻响一声，提示该换手了
    if(now - L2.beatAt > BEAT_MS * 4) L2.beatAt = now + BEAT_MS;
    else if(now >= L2.beatAt){
      L2.beatAt += BEAT_MS;
      if(!L2.relSide && L2.settleT >= C.settle) Sfx.tick(false);
    }
  }else if(L2.phase === 'climb'){
    const C = CONFIG.lvl2;
    L2.climbT += dt;
    const k = Math.min(1, L2.climbT / C.climbT);
    L2.fx = L2.fromX + (L2.toX - L2.fromX) * easeInOutCubic(k);
    L2.fy = L2.fromY + (L2.toY - L2.fromY) * easeInOutCubic(k) + Math.sin(Math.PI * k) * 0.18;
    if(k >= 1){
      L2.fx = L2.toX;
      L2.fy = L2.toY;
      if(L2.step >= C.points.length - 1) l2Win();
      else setL2Phase('grip');
    }
  }else if(L2.phase === 'miss'){
    if(L2.phaseT >= 0.9) l2Respawn();
  }

  if(frog){
    frog.root.position.x = L2.fx;
    frog.root.position.y = L2.fy;
    l2Pose(dt, now);
  }
  if(bus) bus.root.position.y = 0.012 * Math.sin(now * 0.008);

  l2ApplyHint();
  l2Camera(dt);
  updateL2HUD();
}

// ============================================================
// 第三关：奶蛙下车（手脚对角）
//
// 下车时一只脚离开台阶的瞬间全靠一只手撑着，所以四根手指都要用上：
//   1) 双手同时扶住门框 → 站稳；
//   2) 松开一只手，靠另一只手撑住；
//   3) 0.6 秒内踩下与松开的手同侧的脚 ——「撑着的手」和「踩下去的脚」正好在身体对角；
//   4) 下一级必须换另一只手撑住，左右交替。
//   两只手同时松 / 踩错脚 / 松手太久 → 摔，扣 3 秒；4 步踩到地面 = 下车成功。
// ============================================================
const L3 = {
  active: false, done: false, phase: 'ready', phaseT: 0,
  timeLeft: 0, misses: 0,
  fx: 0, fy: 0,
  fromX: 0, fromY: 0, toX: 0, toY: 0, stepT: 0, step: 0, stepFoot: null,
  down: { L: false, R: false },
  releaseSide: null, releaseT: 0,       // 当前松开的那只手 / 已松开多久
  settleT: 0,                           // 双手扶住的累计时间
  lastSupport: null,                    // 上一步是哪只手撑住的（下一步必须换边）
  noteT: 0,                             // 临时提示剩余显示时间
  missAngle: 0.9,
  props: null,
  hudCache: '', taskCache: '',
};
window.__l3 = L3;   // 方便调试

function buildL3Props(){
  if(L3.props) return L3.props;
  const g = new THREE.Group();
  const C = CONFIG.lvl3;
  const y = C.points[0][1];    // 车门踏面高度
  // 门框边上的抓手：两根立杆 + 一根横杆
  addBox(0.07, 1.22, 0.07, 0xd9a441, C.grabX, y + 0.61, 0.62, g);
  addBox(0.07, 1.22, 0.07, 0xd9a441, C.grabX, y + 0.61, -0.62, g);
  addBox(0.07, 0.07, 1.31, 0xd9a441, C.grabX, y + 1.22, 0, g);
  // 地面箭头：指向下车方向（画面左边）
  const arr = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.62, 3),
    new THREE.MeshLambertMaterial({ color: 0x3ddc84 })
  );
  arr.rotation.z = Math.PI / 2;
  arr.position.set(6.1, 0.045, 0.35);
  g.add(arr);

  g.visible = false;
  scene.add(g);
  L3.props = g;
  return g;
}

// 该松哪只手：上一级是左手撑住，这一级就得让右手撑住 → 松左手
function l3NextReleaseHand(){
  return L3.lastSupport || null;         // 第一级：左右都行
}

function l3TaskText(){
  const C = CONFIG.lvl3;
  if(L3.phase === 'ready') return '双手同时按住门框上的抓手，站稳';
  if(L3.phase === 'step') return '下！';
  if(L3.phase === 'both'){
    if(!L3.down.L || !L3.down.R) return '把「' + (L3.down.L ? '右手' : '左手') + '」扶回抓手';
    if(L3.settleT < C.settle) return '扶稳了…';
    const rel = l3NextReleaseHand();
    if(rel === 'L') return '松开「左手」，靠右手撑住，再踩左脚（对角）';
    if(rel === 'R') return '松开「右手」，靠左手撑住，再踩右脚（对角）';
    return '松开任意一只手，靠另一只手撑住';
  }
  if(L3.phase === 'one'){
    const f = L3.releaseSide === 'L' ? '左脚' : '右脚';
    const s = L3.releaseSide === 'L' ? '右手' : '左手';
    return '踩「' + f + '」下台阶（' + s + '撑住 · 对角配合）';
  }
  if(L3.phase === 'win') return '🎉 下车成功';
  return null;      // miss 的文案由 l3Miss 单独写
}

function l3SetTask(txt){
  if(!txt || !el.l2Task) return;
  if(L3.taskCache === txt) return;
  L3.taskCache = txt;
  el.l2Task.textContent = txt;
}

// 提示：ready 时双手高亮；该松手时那只手红闪；one 时该踩的脚绿闪
function l3HintRelease(){
  if(!L3.active || L3.done || L3.phase !== 'both') return null;
  if(!L3.down.L || !L3.down.R) return null;
  if(L3.settleT < CONFIG.lvl3.settle) return null;
  return L3.lastSupport || 'both';
}

function l3ApplyHint(){
  const rel = l3HintRelease();
  if(el.btnL) el.btnL.classList.toggle('drop', rel === 'L' || rel === 'both');
  if(el.btnR) el.btnR.classList.toggle('drop', rel === 'R' || rel === 'both');
  const wantHand = (L3.active && !L3.done && L3.phase === 'ready');
  if(el.btnL) el.btnL.classList.toggle('want', wantHand);
  if(el.btnR) el.btnR.classList.toggle('want', wantHand);
  const foot = (L3.active && !L3.done && L3.phase === 'one') ? L3.releaseSide : null;
  if(el.footL) el.footL.classList.toggle('want', foot === 'L');
  if(el.footR) el.footR.classList.toggle('want', foot === 'R');
}

function setL3Phase(p){
  L3.phase = p;
  L3.phaseT = 0;
  const showBar = (p === 'ready' || p === 'both' || p === 'one' || p === 'step');
  if(el.l2ProgWrap) el.l2ProgWrap.classList.toggle('on', showBar);
  if(p !== 'miss') l3SetTask(l3TaskText());
  l3ApplyHint();
}

function updateL3Progress(){
  const total = CONFIG.lvl3.points.length - 1;
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L3.step / total * 100).toFixed(1) + '%';
  if(el.l2Step) el.l2Step.textContent = L3.step + '/' + total;
}

function startLevel3(){
  const C = CONFIG.lvl3;
  resetL4Scene();
  L3.active = true; L3.done = false;
  L3.timeLeft = C.time; L3.misses = 0;
  L3.step = 0; L3.stepT = 0; L3.stepFoot = null;
  L3.fx = C.points[0][0]; L3.fy = C.points[0][1];
  L3.down.L = L3.down.R = false;
  L3.releaseSide = null; L3.releaseT = 0;
  L3.settleT = 0; L3.lastSupport = null; L3.noteT = 0;
  L3.hudCache = ''; L3.taskCache = '';

  ring.visible = false;
  for(const p of pads) p.visible = false;
  buildL2Props().visible = true;      // 下车走的还是那三级台阶和车门
  buildL3Props().visible = true;

  if(bus) bus.root.position.x = C.busX;
  if(frog){
    frog.root.position.set(L3.fx, L3.fy, 0);
    frog.root.rotation.y = CONFIG.frog.yaw;
    frog.body.rotation.set(0, 0, 0);
    frog.body.position.set(0, 0, 0);
    for(const k in frog.parts){
      const p = frog.parts[k];
      p.pose.x = p.pose.y = p.pose.z = 0;
    }
  }
  G.camX = 8.8; G.camZ = CONFIG.cam.z;
  document.body.classList.remove('level2');
  document.body.classList.add('level3');
  if(el.btnL) el.btnL.innerHTML = '<span>←</span>左手';
  if(el.btnR) el.btnR.innerHTML = '<span>→</span>右手';
  if(el.footL) el.footL.innerHTML = '<span>↓</span>左脚';
  if(el.footR) el.footR.innerHTML = '<span>↓</span>右脚';
  updateL3Progress();
  setL3Phase('ready');
  updateL3HUD();
  Sfx.init();
}

// ---- 手：按住 = 扶住，松开 = 准备踩台阶 ----
function l3HandDown(side){
  if(G.level !== 3 || !L3.active || L3.done) return;
  if(L3.phase === 'miss' || L3.phase === 'win') return;
  L3.down[side] = true;

  if(L3.phase === 'step'){                 // 下落动画中只记录手的状态
    if(L3.releaseSide === side){ L3.releaseSide = null; L3.releaseT = 0; }
    return;
  }
  if(L3.phase === 'ready'){
    if(L3.down.L && L3.down.R){
      L3.settleT = 0;
      setL3Phase('both');
    }
    return;
  }
  if(L3.phase === 'one' && L3.releaseSide === side){
    // 松开的这只手又扶回来了 → 回到双手扶稳，重新开始
    L3.releaseSide = null; L3.releaseT = 0; L3.settleT = 0;
    setL3Phase('both');
    return;
  }
  if(L3.phase === 'both' && L3.releaseSide === side){
    L3.releaseSide = null; L3.releaseT = 0;
    l3ApplyHint();
  }
}

function l3HandUp(side){
  if(G.level !== 3 || !L3.active || L3.done) return;
  L3.down[side] = false;
  if(L3.phase === 'step') return;          // 下落过程中松手不打断这一级
  if(L3.phase === 'one'){
    if(!L3.down.L && !L3.down.R) l3Miss('两只手都松开了，身体失去支撑');
    return;
  }
  if(L3.phase !== 'both') return;
  if(!L3.down.L && !L3.down.R){
    l3Miss('两只手同时松开，身体失去支撑');
    return;
  }
  L3.releaseSide = side;
  L3.releaseT = 0;
  L3.settleT = 0;
  setL3Phase('one');
}

// ---- 脚：踩一下 = 下一级台阶 ----
function l3FootTap(side){
  if(G.level !== 3 || !L3.active || L3.done) return;
  if(L3.phase === 'miss' || L3.phase === 'win' || L3.phase === 'step') return;

  if(L3.phase === 'ready' || L3.phase === 'both'){
    L3.noteT = 1.0;
    l3SetTask('先松开一只手，靠另一只手撑住，脚才踩得下去');
    return;
  }
  // one：撑着的手和这只脚必须在对角
  const support = L3.releaseSide === 'L' ? 'R' : 'L';
  if(side !== L3.releaseSide){
    l3Miss('踩错脚了，撑住的手和脚要在一个对角线上');
    return;
  }
  if(L3.lastSupport === support){
    L3.noteT = 1.0;
    L3.releaseT = 0;                       // 给回换手的时间
    l3SetTask('换另一只手撑住，两级台阶要换边');
    return;
  }
  l3StepDown();
}

function l3StepDown(){
  const C = CONFIG.lvl3;
  const P = C.points;
  const foot = L3.releaseSide;
  L3.lastSupport = (foot === 'L') ? 'R' : 'L';   // 撑住的是对侧那只手
  L3.stepFoot = foot;
  L3.step = Math.min(L3.step + 1, P.length - 1);
  L3.fromX = L3.fx; L3.fromY = L3.fy;
  L3.toX = P[L3.step][0]; L3.toY = P[L3.step][1];
  L3.stepT = 0;
  L3.settleT = 0;
  L3.noteT = 0;
  Sfx.step();
  setL3Phase('step');
  updateL3Progress();
}

function l3Miss(reason){
  if(!L3.active || L3.done || L3.phase === 'miss') return;
  const C = CONFIG.lvl3;
  L3.misses++;
  L3.timeLeft = Math.max(0, L3.timeLeft - C.missPenalty);
  L3.missAngle = L3.fy > 0.5 ? -0.9 : 0.9;
  L3.releaseSide = null; L3.releaseT = 0;
  L3.settleT = 0;
  Sfx.thud();
  setL3Phase('miss');
  l3SetTask('失误：' + reason + '（-' + C.missPenalty + ' 秒）');
  updateL3HUD();
  if(L3.timeLeft <= 0) setTimeout(l3Lose, 700);
}

function l3Respawn(){
  const C = CONFIG.lvl3;
  const p = C.points[Math.min(L3.step, C.points.length - 1)];
  L3.fx = p[0]; L3.fy = p[1];
  L3.releaseSide = null; L3.releaseT = 0;
  L3.settleT = 0; L3.lastSupport = null;
  if(L3.down.L && L3.down.R) setL3Phase('both');
  else setL3Phase('ready');
}

function l3Win(){
  if(L3.done) return;
  const C = CONFIG.lvl3;
  L3.done = true; L3.active = false;
  const used = Math.max(0, C.time - L3.timeLeft).toFixed(1);
  setL3Phase('win');
  l3ApplyHint();
  updateL3HUD();
  setTimeout(()=>{
    showOverlay('🚪 下车成功！',
      '用时 ' + used + ' 秒 · 失误 ' + L3.misses + ' 次', '再玩一次');
  }, 1300);
}

function l3Lose(){
  if(L3.done) return;
  L3.done = true; L3.active = false;
  setL3Phase('miss');
  l3ApplyHint();
  l3SetTask('时间到，车门关上了');
  showOverlay('时间到…', '车门关上了，奶蛙还卡在台阶上', '再试一次');
}

// 第三关的姿势：一只手撑住，另一只手松开 + 同侧脚往下探
function l3Pose(dt, now){
  const t = now * 0.001;
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };
  const br = Math.sin(t * 2.1);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.035;

  const rel = L3.releaseSide;
  const sup = rel ? (rel === 'L' ? 'R' : 'L') : null;

  if(L3.phase === 'ready'){
    TGT.armL.z = 0.55 + br * 0.04;
    TGT.armR.z = -0.55 - br * 0.04;
    TGT.legL.z = 0.06;
    TGT.legR.z = -0.06;
  }else if(L3.phase === 'both'){
    // 双手扶住抓手
    TGT.armL.z = L3.down.L ? 1.26 : 0.45;
    TGT.armR.z = L3.down.R ? -1.26 : -0.45;
    TGT.spine.x = -0.04;
    TGT.legL.z = 0.06;
    TGT.legR.z = -0.06;
    BTGT.y = br * 0.008;
  }else if(L3.phase === 'one'){
    // 撑着的手抓紧；松开的手下垂，同侧的腿抬起来准备踩
    TGT.armL.z = (sup === 'L') ? 1.30 : 0.18;
    TGT.armR.z = (sup === 'R') ? -1.30 : -0.18;
    TGT.spine.x = -0.02;
    const lift = (rel === 'L') ? 1 : -1;
    TGT.legL.z = 0.08 + (lift > 0 ? 0.40 : 0);
    TGT.legR.z = -0.08 - (lift < 0 ? 0.40 : 0);
    BTGT.rz = -lift * 0.08;
    BTGT.y = br * 0.01;
  }else if(L3.phase === 'step'){
    // 撑住的手一直不放，踩下去的腿伸直往下探
    const k = Math.min(1, L3.stepT / CONFIG.lvl3.stepT);
    const s = Math.sin(Math.PI * k);
    TGT.armL.z = (L3.lastSupport === 'L') ? 1.30 : 0.25 * s;
    TGT.armR.z = (L3.lastSupport === 'R') ? -1.30 : -0.25 * s;
    TGT.legL.z = (L3.stepFoot === 'L') ? 0.26 * s : -0.10 * s;
    TGT.legR.z = (L3.stepFoot === 'R') ? -0.26 * s : 0.10 * s;
    TGT.spine.x = 0.06 * s;
    BTGT.y = -0.02 * s;
  }else if(L3.phase === 'miss'){
    const k = Math.min(1, L3.phaseT / 0.45);
    BTGT.rz = L3.missAngle * k;
    BTGT.y = -0.06 * k;
    TGT.armL.z = 0.55 * k;
    TGT.armR.z = -0.55 * k;
    TGT.legL.z = 0.25 * k;
    TGT.legR.z = -0.20 * k;
  }else if(L3.phase === 'win'){
    const hop = Math.abs(Math.sin(t * 5.2));
    BTGT.y = hop * 0.20;
    TGT.armL.z = 1.35 + hop * 0.2;
    TGT.armR.z = -1.35 - hop * 0.2;
    TGT.head.x = -0.15;
  }
  applyPose(dt);
}

function l3Camera(dt){
  const portrait = camera.aspect < 1.15;
  let wantX = THREE.MathUtils.clamp(L3.fx + 0.9, 7.3, 9.5);
  let wantZ = CONFIG.cam.z;
  if(portrait){
    const halfNeed = 4.2;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
    wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), CONFIG.cam.z, 34);
    wantX = THREE.MathUtils.clamp(L3.fx + 0.5, 7.1, 9.3);
  }
  G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * 3));
  G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * 3));
  camera.position.x = G.camX;
  camera.position.y = CONFIG.cam.y + L3.fy * 0.40;
  camera.position.z = G.camZ;
  camera.lookAt(G.camX, 1.5 + L3.fy * 0.40, 0);
  scene.fog.near = Math.max(26, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 54;
}

function updateL3HUD(){
  const key = L3.timeLeft.toFixed(1) + '/' + L3.misses + '/' + L3.step;
  if(key === L3.hudCache) return;
  L3.hudCache = key;
  el.l2Time.textContent = L3.timeLeft.toFixed(1);
  el.l2Miss.textContent = L3.misses;
  el.l2TimeChip.classList.toggle('low', L3.timeLeft <= 8);
  updateL3Progress();
}

function updateLevel3(dt, now){
  L3.phaseT += dt;

  if(L3.active && !L3.done){
    L3.timeLeft -= dt;
    if(L3.timeLeft <= 0){
      L3.timeLeft = 0;
      l3Lose();
    }
  }
  if(L3.noteT > 0) L3.noteT -= dt;

  if(L3.phase === 'both'){
    if(L3.down.L && L3.down.R) L3.settleT += dt;
  }else if(L3.phase === 'one'){
    L3.releaseT += dt;
    if(L3.releaseT > CONFIG.lvl3.releaseWindow){
      l3Miss('松手太久，一只手撑不住');
    }
  }else if(L3.phase === 'step'){
    L3.stepT += dt;
    const k = Math.min(1, L3.stepT / CONFIG.lvl3.stepT);
    L3.fx = L3.fromX + (L3.toX - L3.fromX) * easeInOutCubic(k);
    L3.fy = L3.fromY + (L3.toY - L3.fromY) * easeInOutCubic(k) + Math.sin(Math.PI * k) * 0.10;
    if(k >= 1){
      L3.fx = L3.toX;
      L3.fy = L3.toY;
      if(L3.step >= CONFIG.lvl3.points.length - 1) l3Win();
      else if(!L3.down.L && !L3.down.R) l3Miss('落地时两只手都没扶住');
      else setL3Phase('both');
    }
  }else if(L3.phase === 'miss'){
    if(L3.phaseT >= 0.9) l3Respawn();
  }

  if(L3.noteT <= 0 && (L3.phase === 'both' || L3.phase === 'ready')) l3SetTask(l3TaskText());

  if(frog){
    frog.root.position.x = L3.fx;
    frog.root.position.y = L3.fy;
    l3Pose(dt, now);
  }
  if(bus) bus.root.position.y = 0.012 * Math.sin(now * 0.008);

  l3ApplyHint();
  l3Camera(dt);
  updateL3HUD();
}

// ============================================================
// 第四关：奶蛙撑伞过马路（三根手指同时配合）
//
// 雨很大，风一直在吹。三个动作必须同时成立，少一个都过不去：
//   1) 左手长按「撑伞」——一松手，伞就被风掀走（0.55 秒宽限）；
//   2) 右手在滑动区左右滑，把被风吹歪的伞扶正（量表回到绿区）；
//   3) 只有伞正着（|倾斜| ≤ 0.52），脚才踩得动，左右脚交替点地往前走。
// 伞歪过头 / 松手太久 → 摔倒（只记失误，不倒扣时间），原地起身继续。
// 8 步踩完斑马线 = 过马路成功，结算显示用时和失误次数。
// ============================================================
const L4 = {
  active: false, done: false, phase: 'play', phaseT: 0,
  step: 0, stepT: 1, stepFoot: null, nextFoot: null,
  fx: 0, fromX: 0, toX: 0,
  grip: false, gripT: 0, everGrip: false,
  lean: 0, wind: 0, windLv: 1,
  misses: 0, elapsed: 0,
  dragging: false, dragId: null, lastX: 0,
  noteT: 0, missDir: 1,
  props: null, umb: null, drops: null, rainArr: null, rainGeo: null,
  hudCache: '', taskCache: '',
};
window.__l4 = L4;   // 方便调试

function setSky(hex){
  scene.background.setHex(hex);
  scene.fog.color.setHex(hex);
}

function buildL4Props(){
  if(L4.props) return L4.props;
  const g = new THREE.Group();
  const C = CONFIG.lvl4;

  // 斑马线（横跨整条路，奶蛙沿着 +x 方向走过去）
  for(let i = 0; i < 10; i++){
    addBox(0.38, 0.02, 5.2, 0xeff3f8, 1.22 + i * 0.72, 0.018, 0, g);
  }
  // 雨后的水洼
  const pudMat = new THREE.MeshLambertMaterial({ color: 0x5b7a95, transparent: true, opacity: 0.5 });
  for(const [px, pz, s] of [[2.2, -1.1, 1.2], [4.0, 0.9, 0.9], [5.6, -0.6, 1.4], [1.1, 1.2, 0.8]]){
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), pudMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(px, 0.015, pz);
    m.scale.set(s, s * 0.7, 1);
    g.add(m);
  }
  // 雨（LineSegments：每滴两段点，跟着风斜着落）
  const N = 160;
  const arr = new Float32Array(N * 6);
  const drops = [];
  for(let i = 0; i < N; i++){
    drops.push({
      x: C.startX + Math.random() * 12 - 6,
      y: Math.random() * 8,
      z: Math.random() * 6 - 3,
      vy: 9 + Math.random() * 4,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xbcd6ee, transparent: true, opacity: 0.62,
  }));
  rain.frustumCulled = false;
  g.add(rain);
  L4.rainGeo = geo; L4.rainArr = arr; L4.drops = drops;

  // 伞：以“握伞的手”为轴，整体倾斜
  const umb = new THREE.Group();
  const shaftMat = new THREE.MeshLambertMaterial({ color: 0x4a4f5a });
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.80, 0.34, 16), new THREE.MeshLambertMaterial({ color: 0xd94f4f }));
  canopy.position.y = 0.70;
  umb.add(canopy);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.035, 8, 22), new THREE.MeshLambertMaterial({ color: 0xb83c3c }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.54;
  umb.add(rim);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.80, 8), shaftMat);
  shaft.position.y = 0.16;
  umb.add(shaft);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), shaftMat);
  knob.position.y = -0.24;
  umb.add(knob);
  umb.visible = false;
  g.add(umb);
  L4.umb = umb;

  g.visible = false;
  scene.add(g);
  L4.props = g;
  return g;
}

function l4TaskText(){
  const C = CONFIG.lvl4;
  if(L4.phase === 'win') return '🎉 过马路成功';
  if(L4.phase === 'miss') return null;          // miss 的文案由 l4Miss 单独写
  if(!L4.grip) return '按住左边的「☂ 撑伞」，别松手';
  if(L4.stepT < 1) return '抬脚…';
  if(Math.abs(L4.lean) > C.stepLean){
    return L4.lean > 0 ? '伞往右歪了 —— 往左滑把它扶正' : '伞往左歪了 —— 往右滑把它扶正';
  }
  const f = L4.nextFoot === 'L' ? '左脚' : (L4.nextFoot === 'R' ? '右脚' : '任意一只脚');
  return '伞正了 —— 踩「' + f + '」向前一步';
}

function l4SetTask(txt){
  if(!txt || !el.l2Task) return;
  if(L4.taskCache === txt) return;
  L4.taskCache = txt;
  el.l2Task.textContent = txt;
}

function updateL4Progress(){
  if(el.l2Step) el.l2Step.textContent = L4.step + '/' + CONFIG.lvl4.steps;
}

function l4ApplyHint(){
  const C = CONFIG.lvl4;
  const playing = L4.active && !L4.done && L4.phase === 'play';
  const canStep = playing && L4.grip && L4.stepT >= 1 && Math.abs(L4.lean) <= C.stepLean;
  if(el.footL) el.footL.classList.toggle('want', canStep && (L4.nextFoot === 'L' || !L4.nextFoot));
  if(el.footR) el.footR.classList.toggle('want', canStep && (L4.nextFoot === 'R' || !L4.nextFoot));
  if(el.btnL) el.btnL.classList.toggle('drop', playing && !L4.grip);
  if(el.swipeZone) el.swipeZone.classList.toggle('bad', playing && Math.abs(L4.lean) > C.stepLean);
}

function startLevel4(){
  const C = CONFIG.lvl4;
  L4.active = true; L4.done = false;
  L4.phase = 'play'; L4.phaseT = 0;
  L4.step = 0; L4.stepT = 1; L4.stepFoot = null; L4.nextFoot = null;
  L4.fx = C.startX; L4.fromX = C.startX; L4.toX = C.startX;
  L4.grip = false; L4.gripT = 0; L4.everGrip = false;
  L4.lean = 0; L4.wind = 0; L4.windLv = 1;
  L4.misses = 0; L4.elapsed = 0;
  L4.dragging = false; L4.dragId = null;
  L4.noteT = 0; L4.missDir = 1;
  L4.hudCache = ''; L4.taskCache = '';

  ring.visible = false;
  for(const p of pads) p.visible = false;
  const props = buildL4Props();
  props.visible = true;
  if(L4.umb) L4.umb.visible = true;
  if(bus) bus.root.visible = false;
  if(L2.props) L2.props.visible = false;
  if(L3.props) L3.props.visible = false;

  document.body.classList.remove('level2');
  document.body.classList.remove('level3');
  document.body.classList.add('level4');
  setSky(0x93a7ba);

  if(el.l2TimeLbl) el.l2TimeLbl.textContent = '用时';
  if(el.l2StepLbl) el.l2StepLbl.textContent = '步数';
  if(el.l2TimeChip) el.l2TimeChip.classList.remove('low');
  if(el.btnL){
    el.btnL.innerHTML = '<span>☂</span>撑伞';
    el.btnL.classList.remove('drop');
    el.btnL.classList.remove('want');
  }
  if(el.btnR){ el.btnR.classList.remove('drop'); el.btnR.classList.remove('want'); }
  if(el.footL){ el.footL.innerHTML = '<span>↓</span>左脚'; el.footL.classList.remove('want'); }
  if(el.footR){ el.footR.innerHTML = '<span>↓</span>右脚'; el.footR.classList.remove('want'); }
  if(el.swipeZone) el.swipeZone.classList.remove('bad');

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
  // 雨滴重新撒一遍
  if(L4.drops){
    for(const d of L4.drops){
      d.x = C.startX + Math.random() * 12 - 6;
      d.y = Math.random() * 8;
      d.z = Math.random() * 6 - 3;
    }
  }
  G.camX = C.startX + 1.25; G.camZ = CONFIG.cam.z;

  updateL4Progress();
  l4SetTask(l4TaskText());
  updateL4HUD();
  l4ApplyHint();
  Sfx.init();
}

// 离开第四关：恢复天空色、公交、标签和外层类名
function resetL4Scene(){
  document.body.classList.remove('level4');
  L4.active = false; L4.done = false;
  L4.grip = false; L4.dragging = false;
  if(L4.props) L4.props.visible = false;
  if(L4.umb) L4.umb.visible = false;
  if(bus) bus.root.visible = true;
  setSky(0x9fd8ff);
  if(el.l2TimeLbl) el.l2TimeLbl.textContent = '剩余';
  if(el.l2StepLbl) el.l2StepLbl.textContent = '台阶';
  if(el.l2TimeChip) el.l2TimeChip.classList.remove('low');
  if(el.swipeZone) el.swipeZone.classList.remove('bad');
  if(el.l4WindNeedle) el.l4WindNeedle.classList.remove('bad');
  if(el.footL) el.footL.classList.remove('want');
  if(el.footR) el.footR.classList.remove('want');
  if(el.btnL){ el.btnL.classList.remove('drop'); el.btnL.classList.remove('want'); }
}

// ---- 左手：按住 = 撑伞 ----
function l4PadDown(){
  if(G.level !== 4 || !L4.active || L4.done || L4.phase !== 'play') return;
  L4.grip = true; L4.gripT = 0; L4.everGrip = true;
  l4SetTask(l4TaskText());
  l4ApplyHint();
}
function l4PadUp(){
  if(G.level !== 4 || !L4.active) return;
  L4.grip = false;
  l4ApplyHint();
}

// ---- 右手：滑动扶伞（dx 为手指移动的像素）----
function l4Drag(dx){
  if(G.level !== 4 || !L4.active || L4.done || L4.phase !== 'play') return;
  const C = CONFIG.lvl4;
  L4.lean = THREE.MathUtils.clamp(L4.lean + dx * C.dragK, -C.leanClamp, C.leanClamp);
  if(Math.abs(L4.lean) > C.missLean) l4Miss('滑过头，伞被你推翻了');
}

// ---- 脚：伞正着才踩得动，左右交替 ----
function l4FootTap(side){
  if(G.level !== 4 || !L4.active || L4.done || L4.phase !== 'play') return;
  const C = CONFIG.lvl4;
  if(!L4.grip){
    L4.noteT = 1.0;
    l4SetTask('先按住左边的伞，脚才踩得动');
    return;
  }
  if(L4.stepT < 1) return;
  if(Math.abs(L4.lean) > C.stepLean){
    L4.noteT = 1.0;
    l4SetTask('伞还没扶正 —— 先滑回绿区再迈步');
    return;
  }
  if(L4.nextFoot && side !== L4.nextFoot){
    L4.noteT = 1.0;
    l4SetTask('左右脚要交替 —— 这一步该踩「' + (L4.nextFoot === 'L' ? '左脚' : '右脚') + '」');
    return;
  }
  l4Step(side);
}

function l4Step(foot){
  const C = CONFIG.lvl4;
  L4.stepFoot = foot;
  L4.nextFoot = foot === 'L' ? 'R' : 'L';
  L4.step++;
  L4.fromX = L4.fx;
  L4.toX = L4.fx + C.stepLen;
  L4.stepT = 0;
  L4.noteT = 0;
  Sfx.step();
  updateL4Progress();
  l4SetTask(l4TaskText());
  l4ApplyHint();
}

function l4Miss(reason){
  if(!L4.active || L4.done || L4.phase !== 'play') return;
  L4.misses++;
  L4.missDir = L4.lean >= 0 ? 1 : -1;
  L4.phase = 'miss'; L4.phaseT = 0;
  L4.grip = false;
  L4.taskCache = '';
  Sfx.thud();
  if(el.l2Task) el.l2Task.textContent = '失误：' + reason + '（已记录 ' + L4.misses + ' 次）';
  updateL4HUD();
  l4ApplyHint();
}

function l4Respawn(){
  const C = CONFIG.lvl4;
  L4.fx = C.startX + L4.step * C.stepLen;
  L4.fromX = L4.toX = L4.fx;
  L4.stepT = 1;
  L4.lean = 0; L4.grip = false; L4.gripT = 0; L4.everGrip = false;
  L4.phase = 'play'; L4.phaseT = 0;
  L4.taskCache = '';
  l4SetTask(l4TaskText());
  l4ApplyHint();
}

function l4Win(){
  if(L4.done) return;
  L4.done = true; L4.active = false;
  L4.phase = 'win'; L4.phaseT = 0;
  L4.stepT = 1;
  Sfx.win();
  updateL4HUD();
  const used = L4.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🌂 过马路成功！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L4.misses + '</b> 次', '再玩一次');
  }, 1400);
}

function updateL4Rain(dt){
  if(!L4.rainGeo) return;
  const arr = L4.rainArr, drops = L4.drops, N = drops.length;
  for(let i = 0; i < N; i++){
    const d = drops[i];
    d.y -= d.vy * dt;
    d.x += L4.wind * 0.6 * dt;
    if(d.y < 0.05 || Math.abs(d.x - L4.fx) > 7){
      d.x = L4.fx + (Math.random() * 12 - 6);
      d.y = d.y < 0.05 ? 7.6 + Math.random() * 1.6 : d.y;
      d.z = Math.random() * 6 - 3;
    }
    const j = i * 6;
    arr[j] = d.x;                    arr[j + 1] = d.y;                    arr[j + 2] = d.z;
    arr[j + 3] = d.x - L4.wind * 0.28; arr[j + 4] = d.y + 0.34;           arr[j + 5] = d.z;
  }
  L4.rainGeo.attributes.position.needsUpdate = true;
}

function l4Pose(dt, now){
  const C = CONFIG.lvl4;
  const t = now * 0.001;
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };
  const br = Math.sin(t * 2.1);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.035;

  if(L4.phase === 'win'){
    const hop = Math.abs(Math.sin(t * 5.2));
    BTGT.y = hop * 0.20;
    TGT.armL.z = 1.28 + hop * 0.18;
    TGT.armR.z = -1.30 - hop * 0.2;
    TGT.head.x = -0.15;
    applyPose(dt);
    return;
  }

  if(L4.phase === 'miss'){
    const k = Math.min(1, L4.phaseT / 0.5);
    BTGT.rz = 0.9 * k;
    BTGT.y = -0.08 * k;
    TGT.armL.z = 0.9 * (1 - k * 0.35);
    TGT.armR.z = -0.7 * k;
    TGT.legL.z = 0.26 * k;
    TGT.legR.z = -0.22 * k;
    TGT.spine.x = -0.12 * k;
    applyPose(dt);
    return;
  }

  // play：左臂举伞，右臂横着顶风，身体往伞的反方向压
  const s = L4.stepT < 1 ? Math.sin(Math.PI * L4.stepT) : 0;
  const leftStep = L4.stepFoot === 'L';
  TGT.armL.z = L4.grip ? (1.28 + br * 0.03) : (0.40 + br * 0.03);
  TGT.armR.z = -0.34 - Math.abs(L4.lean) * 0.6;
  BTGT.rz = L4.lean * 0.24;
  BTGT.y = br * 0.012 + 0.07 * s;
  TGT.spine.x = 0.03;
  TGT.head.z = -BTGT.rz * 0.45;
  if(L4.stepT < 1){
    TGT[leftStep ? 'legL' : 'legR'].z = -0.42 * s;
    TGT[leftStep ? 'legR' : 'legL'].z = 0.16 * s;
  }else{
    TGT.legL.z = 0.05;
    TGT.legR.z = -0.05;
  }
  applyPose(dt);
}

function l4Camera(dt){
  const portrait = camera.aspect < 1.15;
  let wantX = L4.fx + 1.25;
  let wantZ = CONFIG.cam.z;
  if(portrait){
    const halfNeed = 2.05;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
    wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), CONFIG.cam.z, 32);
    wantX = L4.fx + 0.6;
  }
  G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * 3));
  G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * 3));
  camera.position.x = G.camX;
  camera.position.y = CONFIG.cam.y;
  camera.position.z = G.camZ;
  camera.lookAt(G.camX, 1.45, 0);
  scene.fog.near = Math.max(24, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 52;
}

function updateL4HUD(){
  const key = L4.elapsed.toFixed(1) + '/' + L4.misses + '/' + L4.step;
  if(key === L4.hudCache) return;
  L4.hudCache = key;
  if(el.l2Time) el.l2Time.textContent = L4.elapsed.toFixed(1);
  if(el.l2Miss) el.l2Miss.textContent = L4.misses;
  updateL4Progress();
}

function updateL4Meter(){
  if(el.l4WindNeedle){
    const l = THREE.MathUtils.clamp(L4.lean, -0.9, 0.9);
    el.l4WindNeedle.style.left = (50 + l / 0.9 * 50).toFixed(1) + '%';
    el.l4WindNeedle.classList.toggle('bad', Math.abs(L4.lean) > 0.62);
  }
  if(el.l4WindArrow) el.l4WindArrow.textContent = L4.wind >= 0 ? '→' : '←';
  if(el.l4WindLv) el.l4WindLv.textContent = L4.windLv;
}

function updateLevel4(dt, now){
  const C = CONFIG.lvl4;
  L4.phaseT += dt;

  // 正计时：只记录用时，不逼玩家
  if(L4.active && !L4.done) L4.elapsed += dt;
  if(L4.noteT > 0) L4.noteT -= dt;

  // 风力：走得越远风越大（三段）
  const prog = Math.min(1, L4.step / C.steps);
  const pi = prog < 0.34 ? 0 : (prog < 0.67 ? 1 : 2);
  const amp = C.windPhases[pi][0], per = C.windPhases[pi][1];
  const w = 2 * Math.PI * (now * 0.001) / per;
  L4.wind = amp * (0.88 * Math.sin(w) + 0.12 * Math.sin(2.33 * w + 1.1));
  L4.windLv = pi + 1;

  if(L4.phase === 'play'){
    // 松手太久 → 伞被风掀走（第一次按伞之前不计时，给玩家准备时间）
    if(L4.grip){
      L4.gripT = 0;
    }else if(L4.everGrip){
      L4.gripT += dt;
      if(L4.gripT > C.gripGrace) l4Miss('松手太久，伞被风掀走了');
    }
    // 伞被风吹歪；松手时歪得更快
    if(L4.phase === 'play'){
      const loosen = !L4.everGrip ? 1 : (L4.grip ? 1 : 1.8);
      const target = L4.wind * C.leanGain * loosen;
      const tau = (L4.grip || !L4.everGrip) ? C.leanTau : C.leanTauLoose;
      L4.lean += (target - L4.lean) * (1 - Math.exp(-dt / tau));
      if(Math.abs(L4.lean) > C.missLean) l4Miss('伞歪过头，被风吹翻了');
    }
  }

  // 迈步动画
  if(L4.phase === 'play' && L4.stepT < 1){
    L4.stepT = Math.min(1, L4.stepT + dt / C.stepT);
    L4.fx = L4.fromX + (L4.toX - L4.fromX) * easeInOutCubic(L4.stepT);
    if(L4.stepT >= 1){
      L4.fx = L4.toX;
      if(L4.step >= C.steps) l4Win();
    }
  }else if(L4.phase === 'miss'){
    if(L4.phaseT >= C.missHold) l4Respawn();
  }

  if(L4.noteT <= 0 && (L4.phase === 'play' || L4.phase === 'win')) l4SetTask(l4TaskText());

  updateL4Rain(dt);

  // 伞：以握把为轴倾斜；摔倒时翻过去
  if(L4.umb){
    const dropY = L4.grip ? 1.30 : 1.20;
    L4.umb.position.set(L4.fx + 0.06, dropY, 0.06);
    let tilt = L4.lean * 0.85;
    if(L4.phase === 'miss'){
      tilt = (0.76 * L4.missDir) + Math.min(1, L4.phaseT / 0.5) * 0.5 * L4.missDir;
    }
    L4.umb.rotation.z = -tilt;
    L4.umb.visible = !(L4.phase === 'miss' && L4.phaseT > 0.85);
  }

  if(frog){
    frog.root.position.x = L4.fx;
    frog.root.position.y = 0;
    l4Pose(dt, now);
  }

  l4ApplyHint();
  l4Camera(dt);
  updateL4Meter();
  updateL4HUD();
}

// ============================================================
// 每帧更新
// ============================================================
let lastT = performance.now();

function update(dt, now){
  if(G.level === 4){ updateLevel4(dt, now); return; }
  if(G.level === 3){ updateLevel3(dt, now); return; }
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
  if(G.level === 4){
    // 按住 A 撑伞，← / → 滑动扶伞，J / K 踩左右脚
    if(k === 'a'){ e.preventDefault(); l4PadDown(); }
    else if(k === 'arrowleft'){ e.preventDefault(); l4Drag(-50); }
    else if(k === 'arrowright'){ e.preventDefault(); l4Drag(50); }
    else if(k === 'j'){ e.preventDefault(); l4FootTap('L'); }
    else if(k === 'k'){ e.preventDefault(); l4FootTap('R'); }
    else if(k === 'r' && G.over) startGame(4);
    return;
  }
  if(G.level === 3){
    // A / D 按住左右手，← / → 踩左右脚
    if(k === 'a'){ e.preventDefault(); l3HandDown('L'); }
    else if(k === 'd'){ e.preventDefault(); l3HandDown('R'); }
    else if(k === 'arrowleft'){ e.preventDefault(); l3FootTap('L'); }
    else if(k === 'arrowright'){ e.preventDefault(); l3FootTap('R'); }
    return;
  }
  if(G.level === 2){
    if(k === 'arrowleft' || k === 'a'){ e.preventDefault(); l2PadDown('L'); }
    else if(k === 'arrowright' || k === 'd'){ e.preventDefault(); l2PadDown('R'); }
    else if(k === 'r' && G.over) startGame(2);
    return;
  }
  if(k === 'arrowleft' || k === 'a'){ e.preventDefault(); pressFoot('L'); }
  else if(k === 'arrowright' || k === 'd'){ e.preventDefault(); pressFoot('R'); }
  else if(k === 'r' && G.over){ startGame(1); }
});

addEventListener('keyup', e=>{
  const k = e.key.toLowerCase();
  if(G.level === 4){
    if(k === 'a') l4PadUp();
    return;
  }
  if(G.level === 3){
    if(k === 'a') l3HandUp('L');
    else if(k === 'd') l3HandUp('R');
    return;
  }
  if(G.level !== 2) return;
  if(k === 'arrowleft' || k === 'a') l2PadUp('L');
  else if(k === 'arrowright' || k === 'd') l2PadUp('R');
});

for(const [id, side] of [['btnL', 'L'], ['btnR', 'R']]){
  const node = document.getElementById(id);
  node.addEventListener('pointerdown', e=>{
    e.preventDefault();
    if(G.level === 4) l4PadDown();
    else if(G.level === 3) l3HandDown(side);
    else if(G.level === 2) l2PadDown(side);
    else pressFoot(side);
  }, { passive: false });   // 只监听 pointer 事件，避免触摸时重复触发
  node.addEventListener('pointerup', ()=>{
    if(G.level === 4) l4PadUp();
    else if(G.level === 3) l3HandUp(side);
    else if(G.level === 2) l2PadUp(side);
  });
  node.addEventListener('pointercancel', ()=>{
    if(G.level === 4) l4PadUp();
    else if(G.level === 3) l3HandUp(side);
    else if(G.level === 2) l2PadUp(side);
  });
  node.addEventListener('contextmenu', e=>e.preventDefault());
}

// 第三关的两个脚按钮：点一下 = 踩下一级台阶
for(const [id, side] of [['footL', 'L'], ['footR', 'R']]){
  const node = document.getElementById(id);
  node.addEventListener('pointerdown', e=>{
    e.preventDefault();
    if(G.level === 4) l4FootTap(side);
    else if(G.level === 3) l3FootTap(side);
  }, { passive: false });
  node.addEventListener('contextmenu', e=>e.preventDefault());
}

// 第四关：右手在滑动区左右滑，把被风吹歪的伞扶正
(function(){
  const zone = document.getElementById('swipeZone');
  if(!zone) return;
  zone.addEventListener('pointerdown', e=>{
    e.preventDefault();
    if(G.level !== 4 || !L4.active || L4.done) return;
    L4.dragging = true; L4.dragId = e.pointerId; L4.lastX = e.clientX;
    try{ zone.setPointerCapture(e.pointerId); }catch(_){}
  }, { passive: false });
  zone.addEventListener('pointermove', e=>{
    if(!L4.dragging || e.pointerId !== L4.dragId) return;
    e.preventDefault();
    const dx = e.clientX - L4.lastX;
    L4.lastX = e.clientX;
    l4Drag(dx);
  }, { passive: false });
  const stop = e=>{
    if(e.pointerId !== L4.dragId) return;
    L4.dragging = false; L4.dragId = null;
  };
  zone.addEventListener('pointerup', stop);
  zone.addEventListener('pointercancel', stop);
  zone.addEventListener('contextmenu', e=>e.preventDefault());
})();

// 第二关：两只手各自一个按钮，按住/松开由 pointerdown / pointerup 驱动
el.homeBtn.addEventListener('click', ()=>showLevels());
el.backHomeBtn.addEventListener('click', ()=>showHome());
el.lv1.addEventListener('click', ()=>startGame(1));
el.lv2.addEventListener('click', ()=>startGame(2));
el.lv3.addEventListener('click', ()=>startGame(3));
el.lv4.addEventListener('click', ()=>startGame(4));
el.ovBtn.addEventListener('click', ()=>startGame(G.level || 1));
el.ovHomeBtn.addEventListener('click', ()=>showHome());
el.homeChip.addEventListener('click', ()=>showHome());

function startGame(level){
  if(!G.ready) return;      // 素材还没加载完
  G.level = (level === 4) ? 4 : ((level === 3) ? 3 : ((level === 2) ? 2 : 1));
  G.screen = 'game';
  el.overlay.classList.remove('show');
  document.body.classList.add('ingame');
  if(G.level === 4) startLevel4();
  else if(G.level === 3) startLevel3();
  else if(G.level === 2) startLevel2();
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
