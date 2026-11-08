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
  // 第五关：跳房子（雨后的粉笔格子：每一格一套动作序列，按对才跳得过去）
  lvl5 : {
    startX: 1.40, gap: 1.05, steps: 8,
    jumpT: 0.34, jumpH: 0.52,
    camY: 4.15, camZ: 9.35,   // 比其它关稍微俯一点，地上的格子才看得清
    missHold: 0.85,        // 按错之后原地摇晃、序列重置的时长
    busX: 15.5,            // 公交车停在远处的路边
    // 每格的动作序列：HL 左手 / HR 右手 / FL 左脚 / FR 右脚
    // 长度逐格变长：2、2、3、3、3、4、4、4
    seqs: [
      ['HL', 'FR'],
      ['FR', 'HL'],
      ['HL', 'FR', 'HL'],
      ['FR', 'HL', 'FR'],
      ['HL', 'HR', 'FL'],
      ['FR', 'HL', 'HR', 'FL'],
      ['FL', 'FR', 'HL', 'HR'],
      ['HL', 'FR', 'HR', 'FL'],
    ],
  },
  // 第六关：跳绳（绳子转圈扫到脚下时，按发光的脚跳过去，左右脚交替）
  lvl6 : {
    x: 2.0, jumps: 8,
    ropeR: 1.05, handleY: 1.12,   // 绳子的半圆半径 / 把手高度
    period: 1.45,                 // 绳子转一圈
    winA: 0.86,                   // 起跳窗口（离最低点的弧度）
    jumpT: 0.30, jumpH: 0.46,
    missHold: 0.95,
    busX: 15.0,
  },
  // 第七关：蓄力跳台阶（按住任意脚蓄力，松手卡在绿区才跳到下一台）
  lvl7 : {
    startX: 1.20, gap: 1.55, stepY: 0.16, steps: 8,
    chargeUp: 0.95, chargeDown: 0.95,
    jumpT: 0.46, jumpH: 0.58,
    missHold: 0.75,
    // 每一台的绿区（蓄力条 0~1 的区间），越往后越窄
    zones: [
      [0.62, 0.96], [0.56, 0.90], [0.50, 0.84], [0.44, 0.78],
      [0.38, 0.70], [0.32, 0.64], [0.27, 0.57], [0.22, 0.50],
    ],
    busX: 16.5,
  },
  // 第八关：记节奏（先看一遍四个踏板的顺序，再原样复现）
  lvl8 : {
    x: 2.0,
    rounds: 5, lens: [3, 4, 4, 5, 5],
    demoGap: 0.55, roundGap: 0.90, missHold: 0.85,
    busX: 13.5,
  },
  // 第九关：擦车窗（按住圆圈顺着箭头方向画圈，把四扇车窗擦干净）
  lvl9 : {
    busX: 6.2,
    windows: 4, turns: 2.2,
    dirs: [1, -1, 1, -1],   // 1 = 顺时针，-1 = 逆时针
    missCool: 1.6,
    frogDX: 3.7, frogZ: 0.6, camX: 0.7, camHalf: 4.1,
  },
  // 第十关：拍手跺脚（两个动作要一起按，差一点点都算错）
  lvl10 : {
    x: 2.0, beats: 8,
    window: 1.05, gap: 0.50, syncT: 0.24,
    pairs: [
      ['HL', 'FR'], ['HR', 'FL'], ['HL', 'HR'], ['FL', 'FR'],
      ['HL', 'FL'], ['HR', 'FR'], ['HL', 'FR'], ['HL', 'HR'],
    ],
    busX: 13.0,
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
  lv5      : document.getElementById('lv5'),
  lv6      : document.getElementById('lv6'),
  lv7      : document.getElementById('lv7'),
  lv8      : document.getElementById('lv8'),
  lv9      : document.getElementById('lv9'),
  lv10     : document.getElementById('lv10'),
  l5Seq    : document.getElementById('l5Seq'),
  l7Zone   : document.getElementById('l7Zone'),
  l9Zone   : document.getElementById('l9Zone'),
  l9Ring   : document.getElementById('l9Ring'),
  l9Lbl    : document.getElementById('l9Lbl'),
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
  resetAllLevels();
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
  resetAllLevels();
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
  resetAllLevels();
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
  resetAllLevels();
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
// 第五关：跳房子（雨后的粉笔格子）
//
// 地上画着 1~8 格，每一格都有一套固定的动作序列（左手 / 右手 / 左脚 / 右脚）。
// 按顺序按对四个按钮 → 整串做完，奶蛙就跳到下一格；
// 按错 → 记一次失误，这一格的序列从头再按，人原地不动。
// 8 格全部跳完 = 通关。正计时，不设时间限制，结算看「用时 + 失误」。
// ============================================================
const L5_LIMB = { HL: '左手', HR: '右手', FL: '左脚', FR: '右脚' };

const L5 = {
  active: false, done: false, phase: 'play', phaseT: 0,
  tile: 0,                 // 已经跳过的格数（0~8）
  idx: 0,                  // 当前这格已经按对了几步
  jumpT: 1, jumpY: 0, fromX: 0, toX: 0,
  fx: 0, misses: 0, elapsed: 0,
  limb: null, limbT: 0,    // 最近按下的肢体（用来抬一下手脚）
  noteT: 0, missDir: 1,
  props: null, tiles: [], ring: null,
  hudCache: '', taskCache: '', seqCache: '',
};
window.__l5 = L5;   // 方便调试

function l5TileX(i){
  const C = CONFIG.lvl5;
  return C.startX + (i + 1) * C.gap;
}

function l5ChalkTexture(n, accent){
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  // 淡淡的白粉笔底色 + 擦痕
  c.fillStyle = 'rgba(250,248,236,0.14)';
  c.fillRect(0, 0, S, S);
  for(let i = 0; i < 26; i++){
    c.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.10).toFixed(2) + ')';
    c.beginPath();
    c.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 7, 0, Math.PI * 2);
    c.fill();
  }
  // 粉笔双线框
  c.strokeStyle = accent;
  c.lineWidth = 11;
  c.strokeRect(9, 9, S - 18, S - 18);
  c.globalAlpha = 0.45;
  c.lineWidth = 4;
  c.strokeRect(21, 21, S - 42, S - 42);
  c.globalAlpha = 1;
  // 格子号
  c.fillStyle = accent;
  c.font = '900 128px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(n), S / 2, S / 2 + 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildL5Props(){
  if(L5.props) return L5.props;
  const C = CONFIG.lvl5;
  const g = new THREE.Group();
  const ACCENTS = ['#ff9a6c', '#7fe0b4', '#8ec5ff', '#ffe27a'];

  // 起跳线（粉笔横线）
  addBox(0.10, 0.02, 1.9, 0xfff3d6, C.startX, 0.022, 0, g);

  // 1~8 格：直接用粉笔画在地上
  L5.tiles.length = 0;
  for(let i = 0; i < C.steps; i++){
    const mat = new THREE.MeshBasicMaterial({
      map: l5ChalkTexture(i + 1, ACCENTS[i % ACCENTS.length]),
      transparent: true, opacity: 0.96, depthWrite: false,
    });
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), mat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(l5TileX(i), 0.024, 0);
    tile.renderOrder = 2;
    g.add(tile);
    L5.tiles.push(tile);
  }

  // 雨后的小水洼（延续第四关的天气）
  const pudMat = new THREE.MeshLambertMaterial({ color: 0x6f8ea8, transparent: true, opacity: 0.42 });
  for(const [px, pz, s] of [[2.6, 1.5, 1.0], [5.2, -1.6, 1.2], [8.4, 1.7, 0.9]]){
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), pudMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(px, 0.016, pz);
    m.scale.set(s, s * 0.68, 1);
    g.add(m);
  }

  // 目标格的光圈（提示“下一格在这里”）
  const ring5 = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.62, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffd93d, transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring5.rotation.x = -Math.PI / 2;
  ring5.position.set(l5TileX(0), 0.040, 0);
  ring5.visible = false;
  g.add(ring5);
  L5.ring = ring5;

  g.visible = false;
  scene.add(g);
  L5.props = g;
  return g;
}

function l5TaskText(){
  if(L5.done || L5.phase === 'win') return '🎉 8 格全部跳完！';
  if(L5.phase === 'jump') return '跳！';
  if(L5.phase === 'miss') return null;        // 失误文案由 l5Miss 单独写
  const seq = CONFIG.lvl5.seqs[L5.tile];
  if(!seq) return '🎉 8 格全部跳完！';
  return '第 ' + (L5.tile + 1) + ' 格：按顺序点按钮，全对就跳过去';
}

function l5SetTask(txt){
  if(!txt || !el.l2Task) return;
  if(L5.taskCache === txt) return;
  L5.taskCache = txt;
  el.l2Task.textContent = txt;
}

function updateL5Progress(){
  if(el.l2Step) el.l2Step.textContent = L5.tile + '/' + CONFIG.lvl5.steps;
}

// 底部序列条：按对的一步步打勾，当前该按的那个高亮
function l5UpdateSeqBar(){
  if(!el.l5Seq) return;
  const seq = CONFIG.lvl5.seqs[L5.tile];
  const nowIdx = (L5.active && !L5.done && L5.phase === 'play') ? L5.idx : -1;
  const key = L5.tile + '/' + (seq ? seq.join('') : '-') + '/' + nowIdx;
  if(key === L5.seqCache) return;
  L5.seqCache = key;
  if(!seq){ el.l5Seq.innerHTML = ''; return; }
  el.l5Seq.innerHTML = seq.map((code, i)=>{
    let cls = 'l5chip ' + (code[0] === 'H' ? 'hand' : 'foot');
    if(i < L5.idx) cls += ' done';
    if(i === nowIdx) cls += ' now';
    return '<span class="' + cls + '">' + L5_LIMB[code] + '</span>';
  }).join('<i class="l5arrow">→</i>');
}

function l5ApplyHint(){
  const seq = CONFIG.lvl5.seqs[L5.tile];
  const live = L5.active && !L5.done && L5.phase === 'play';
  const need = live && seq ? seq[L5.idx] : null;
  if(el.btnL) el.btnL.classList.toggle('want', need === 'HL');
  if(el.btnR) el.btnR.classList.toggle('want', need === 'HR');
  if(el.footL) el.footL.classList.toggle('want', need === 'FL');
  if(el.footR) el.footR.classList.toggle('want', need === 'FR');
}

function startLevel5(){
  const C = CONFIG.lvl5;
  resetAllLevels();
  L5.active = true; L5.done = false;
  L5.phase = 'play'; L5.phaseT = 0;
  L5.tile = 0; L5.idx = 0;
  L5.jumpT = 1; L5.jumpY = 0;
  L5.fx = C.startX; L5.fromX = C.startX; L5.toX = C.startX;
  L5.misses = 0; L5.elapsed = 0;
  L5.limb = null; L5.limbT = 0;
  L5.noteT = 0; L5.missDir = 1;
  L5.hudCache = ''; L5.taskCache = ''; L5.seqCache = '';

  ring.visible = false;
  for(const p of pads) p.visible = false;
  buildL5Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  if(L2.props) L2.props.visible = false;
  if(L3.props) L3.props.visible = false;
  if(L4.props) L4.props.visible = false;
  if(L4.umb) L4.umb.visible = false;

  document.body.classList.add('level5');
  setSky(0xbfe7ff);

  if(el.l2TimeLbl) el.l2TimeLbl.textContent = '用时';
  if(el.l2StepLbl) el.l2StepLbl.textContent = '格数';
  if(el.l2TimeChip) el.l2TimeChip.classList.remove('low');
  if(el.btnL){ el.btnL.innerHTML = '<span>←</span>左手'; el.btnL.classList.remove('drop'); el.btnL.classList.remove('want'); }
  if(el.btnR){ el.btnR.innerHTML = '<span>→</span>右手'; el.btnR.classList.remove('drop'); el.btnR.classList.remove('want'); }
  if(el.footL){ el.footL.innerHTML = '<span>↓</span>左脚'; el.footL.classList.remove('want'); }
  if(el.footR){ el.footR.innerHTML = '<span>↓</span>右脚'; el.footR.classList.remove('want'); }

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
  G.camX = C.startX + 1.25; G.camZ = C.camZ; G.camY = C.camY;

  updateL5Progress();
  l5SetTask(l5TaskText());
  l5UpdateSeqBar();
  l5ApplyHint();
  updateL5HUD();
  Sfx.init();
}

// 离开第五关：收起格子、恢复天空和标签
function resetL5Scene(){
  document.body.classList.remove('level5');
  L5.active = false; L5.done = false;
  L5.phase = 'play'; L5.phaseT = 0;
  L5.limb = null; L5.limbT = 0;
  if(L5.props) L5.props.visible = false;
  if(L5.ring) L5.ring.visible = false;
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  L5.seqCache = ''; L5.taskCache = '';
  if(el.l2TimeLbl) el.l2TimeLbl.textContent = '剩余';
  if(el.l2StepLbl) el.l2StepLbl.textContent = '台阶';
  if(el.l2TimeChip) el.l2TimeChip.classList.remove('low');
  for(const b of [el.btnL, el.btnR, el.footL, el.footR]) if(b) b.classList.remove('want');
}

// ---- 按下某个肢体：按对就推进，整串按完就跳 ----
function l5Press(code){
  if(G.level !== 5 || !L5.active || L5.done) return;
  if(L5.phase !== 'play') return;
  const seq = CONFIG.lvl5.seqs[L5.tile];
  if(!seq || L5.idx >= seq.length) return;

  L5.limb = code; L5.limbT = 0.001;

  if(code !== seq[L5.idx]){
    l5Miss(code);
    return;
  }
  L5.idx++;
  Sfx.tick(false);
  l5UpdateSeqBar();
  if(L5.idx >= seq.length){
    l5Jump();
  }else{
    l5ApplyHint();
    L5.taskCache = '';
    l5SetTask(l5TaskText());
  }
}

function l5Jump(){
  L5.phase = 'jump'; L5.phaseT = 0;
  L5.fromX = L5.fx;
  L5.toX = l5TileX(L5.tile);
  L5.jumpT = 0; L5.jumpY = 0;
  Sfx.step();
  L5.taskCache = '';
  l5SetTask('跳！');
  l5UpdateSeqBar();
  l5ApplyHint();
}

function l5Miss(code){
  L5.misses++;
  L5.idx = 0;
  L5.phase = 'miss'; L5.phaseT = 0;
  L5.missDir = (code === 'HL' || code === 'FL') ? -1 : 1;
  L5.noteT = CONFIG.lvl5.missHold;
  Sfx.thud();
  L5.taskCache = '';
  if(el.l2Task) el.l2Task.textContent = '按错啦 —— 第 ' + (L5.tile + 1) +
    ' 格从头按（失误 ' + L5.misses + ' 次）';
  updateL5HUD();
  l5UpdateSeqBar();
  l5ApplyHint();
}

function l5Win(){
  if(L5.done) return;
  L5.done = true; L5.active = false;
  L5.phase = 'win'; L5.phaseT = 0;
  L5.jumpT = 1; L5.jumpY = 0;
  Sfx.win();
  updateL5HUD();
  l5UpdateSeqBar();
  l5ApplyHint();
  const used = L5.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏁 跳完 8 格！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L5.misses + '</b> 次', '再跳一次');
  }, 1400);
}

function updateL5HUD(){
  const key = L5.elapsed.toFixed(1) + '/' + L5.misses + '/' + L5.tile;
  if(key === L5.hudCache) return;
  L5.hudCache = key;
  if(el.l2Time) el.l2Time.textContent = L5.elapsed.toFixed(1);
  if(el.l2Miss) el.l2Miss.textContent = L5.misses;
  updateL5Progress();
}

function l5Pose(dt, now){
  const t = now * 0.001;
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };
  const br = Math.sin(t * 2.1);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.035;
  TGT.armL.z = 0.05 + br * 0.02;
  TGT.armR.z = -0.05 - br * 0.02;
  TGT.legL.z = 0.04;
  TGT.legR.z = -0.04;

  if(L5.phase === 'win'){
    const hop = Math.abs(Math.sin(t * 5.2));
    BTGT.y = hop * 0.20;
    TGT.armL.z = 1.30 + hop * 0.18;
    TGT.armR.z = -1.30 - hop * 0.2;
    TGT.head.x = -0.15;
    applyPose(dt);
    return;
  }

  if(L5.phase === 'miss'){
    const k = Math.min(1, L5.phaseT / 0.55);
    const s = Math.sin(k * Math.PI);
    BTGT.rz = L5.missDir * 0.50 * s;
    BTGT.y = -0.03 * s;
    TGT.armL.z = 0.52 * s;
    TGT.armR.z = -0.52 * s;
    TGT.head.z = -BTGT.rz * 0.5;
    TGT.legL.z = 0.16 * s;
    TGT.legR.z = -0.16 * s;
    applyPose(dt);
    return;
  }

  if(L5.phase === 'jump'){
    const s = Math.sin(Math.PI * Math.min(1, L5.jumpT));
    TGT.legL.z = -0.55 * s;
    TGT.legR.z = -0.55 * s;
    TGT.armL.z = 0.75 * s;
    TGT.armR.z = -0.75 * s;
    TGT.spine.x = 0.10 * s;
    TGT.head.x = -0.10 * s;
    applyPose(dt);
    return;
  }

  // play：按对一下，对应的手脚就抬一下
  if(L5.limb && L5.limbT > 0 && L5.limbT < 0.30){
    const p = Math.sin(Math.PI * Math.min(1, L5.limbT / 0.26));
    if(L5.limb === 'HL') TGT.armL.z += 1.05 * p;
    else if(L5.limb === 'HR') TGT.armR.z -= 1.05 * p;
    else if(L5.limb === 'FL'){ TGT.legL.z = -0.55 * p; TGT.legR.z = 0.10 * p; }
    else { TGT.legR.z = -0.55 * p; TGT.legL.z = -0.10 * p; }
    BTGT.y = 0.02 * p;
  }
  applyPose(dt);
}

function l5Camera(dt){
  const C = CONFIG.lvl5;
  const portrait = camera.aspect < 1.15;
  let wantX = L5.fx + 1.25;
  let wantZ = C.camZ;
  let wantY = C.camY;
  if(portrait){
    const halfNeed = 2.10;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
    wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), C.camZ, 32);
    wantX = L5.fx + 0.55;
    wantY = THREE.MathUtils.lerp(C.camY, CONFIG.cam.y, (wantZ - C.camZ) / (32 - C.camZ));
  }
  G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * 3));
  G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * 3));
  G.camY += (wantY - G.camY) * (1 - Math.exp(-dt * 3));
  camera.position.x = G.camX;
  camera.position.y = G.camY;
  camera.position.z = G.camZ;
  camera.lookAt(G.camX, 1.35, 0);
  scene.fog.near = Math.max(24, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 52;
}

function updateLevel5(dt, now){
  const C = CONFIG.lvl5;
  L5.phaseT += dt;
  if(L5.active && !L5.done) L5.elapsed += dt;
  if(L5.noteT > 0) L5.noteT -= dt;
  if(L5.limbT > 0 && L5.limbT < 0.5) L5.limbT += dt;

  if(L5.phase === 'jump'){
    L5.jumpT = Math.min(1, L5.jumpT + dt / C.jumpT);
    L5.fx = L5.fromX + (L5.toX - L5.fromX) * easeInOutCubic(L5.jumpT);
    L5.jumpY = Math.sin(Math.PI * L5.jumpT) * C.jumpH;
    if(L5.jumpT >= 1){
      L5.fx = L5.toX;
      L5.jumpY = 0;
      L5.tile++;
      L5.idx = 0;
      L5.phase = 'play'; L5.phaseT = 0;
      Sfx.tick(true);
      updateL5Progress();
      L5.taskCache = '';
      l5SetTask(l5TaskText());
      l5UpdateSeqBar();
      l5ApplyHint();
      if(L5.tile >= C.steps) l5Win();
    }
  }
  else if(L5.phase === 'miss' && L5.phaseT >= C.missHold){
    L5.phase = 'play'; L5.phaseT = 0;
    L5.taskCache = '';
    l5SetTask(l5TaskText());
    l5UpdateSeqBar();
    l5ApplyHint();
  }

  if(L5.noteT <= 0 && L5.phase === 'play') l5SetTask(l5TaskText());

  // 目标格的光圈
  if(L5.ring){
    const show = L5.tile < C.steps && !L5.done;
    L5.ring.visible = show;
    if(show){
      L5.ring.position.x = l5TileX(L5.tile);
      const k = 0.5 + 0.5 * Math.sin(now * 0.006);
      L5.ring.scale.setScalar(0.94 + 0.10 * k);
      L5.ring.material.opacity = 0.50 + 0.35 * k;
    }
  }
  for(let i = 0; i < L5.tiles.length; i++){
    L5.tiles[i].material.opacity = i < L5.tile ? 0.45 : 0.96;
  }

  if(frog){
    frog.root.position.set(L5.fx, L5.jumpY, 0);
    l5Pose(dt, now);
  }
  l5Camera(dt);
  updateL5HUD();
}

// ============================================================
// 第六关：跳绳
//
// 雨后路边支起一根跳绳，绳子的半圆绕着自己转圈。
// 绳子扫到脚底的一瞬间，按下发光的脚 → 跳过去；左右脚交替。
// 按早了 / 按错脚 / 绳子到脚底还没跳 → 记一次失误，绳子重新荡起来。
// 8 次跳完 = 通关。
// ============================================================
const L6 = {
  active: false, done: false, phase: 'play', phaseT: 0,
  phi: Math.PI, jumps: 0, misses: 0, elapsed: 0,
  jumped: false, jumpT: 1, jumpY: 0,
  props: null, rope: null, ring: null,
  hud: '', task: '', seq: '',
};
window.__l6 = L6;

function l6SetTask(t){
  if(!t || L6.task === t) return;
  L6.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function l6ApplyHint(){
  const C = CONFIG.lvl6;
  const live = L6.active && !L6.done && L6.phase === 'play' && L6.jumpT >= 1;
  const side = L6.jumps % 2 === 0 ? 'L' : 'R';
  if(el.footL) el.footL.classList.toggle('want', live && side === 'L');
  if(el.footR) el.footR.classList.toggle('want', live && side === 'R');
}

function updateL6HUD(){
  const key = L6.elapsed.toFixed(1) + '/' + L6.jumps + '/' + L6.misses;
  if(key === L6.hud) return;
  L6.hud = key;
  if(el.l2Time) el.l2Time.textContent = L6.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L6.jumps + '/' + CONFIG.lvl6.jumps;
  if(el.l2Miss) el.l2Miss.textContent = L6.misses;
}

function buildL6Props(){
  if(L6.props) return L6.props;
  const C = CONFIG.lvl6;
  const g = new THREE.Group();
  // 两根支绳的柱子（在人行道边上）
  for(const px of [C.x - 1.5, C.x + 1.5]){
    addBox(0.14, 1.5, 0.14, 0x8a6a3a, px, 0.75, -0.62, g);
    addBox(0.48, 0.10, 0.48, 0x6f5630, px, 0.05, -0.62, g);
    addBox(0.22, 0.10, 0.22, 0xffd93d, px, 1.52, -0.62, g);
  }
  // 绳子：以把手为圆心的下半圆，整体绕 z 轴转
  const R = C.ropeR;
  const pts = [];
  for(let i = 0; i <= 26; i++){
    const a = Math.PI + (i / 26) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  const rope = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 0.045, 8, false),
    new THREE.MeshLambertMaterial({ color: 0xd94f4f })
  );
  rope.add(tube);
  rope.position.set(C.x, C.handleY, 0.45);
  g.add(rope);
  L6.rope = rope;

  // 脚底下的提示圈：进窗口时亮起
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.40, 0.56, 36),
    new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(C.x, 0.028, 0);
  g.add(ring);
  L6.ring = ring;

  g.visible = false;
  scene.add(g);
  L6.props = g;
  return g;
}

function startLevel6(){
  const C = CONFIG.lvl6;
  resetAllLevels();
  L6.active = true; L6.done = false;
  L6.phase = 'play'; L6.phaseT = 0;
  L6.jumps = 0; L6.misses = 0; L6.elapsed = 0;
  L6.phi = C.winA + 0.06; L6.jumped = false;
  L6.jumpT = 1; L6.jumpY = 0;
  L6.hud = ''; L6.task = '';
  buildL6Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level6');
  setSky(0xbfe7ff);
  setLabels('用时', '跳数');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');

  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.75; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  l6SetTask('等绳子扫到脚底，按发光的脚跳过去');
  l6ApplyHint();
  updateL6HUD();
  Sfx.init();
}

function resetL6Scene(){
  document.body.classList.remove('level6');
  L6.active = false; L6.done = false;
  L6.phase = 'play'; L6.jumpT = 1; L6.jumpY = 0;
  if(L6.props) L6.props.visible = false;
  if(L6.ring) L6.ring.material.opacity = 0;
  L6.hud = ''; L6.task = '';
}

function l6Press(side){
  if(G.level !== 6 || !L6.active || L6.done) return;
  if(L6.phase !== 'play' || L6.jumpT < 1) return;
  const C = CONFIG.lvl6;
  const inWin = L6.phi >= Math.PI * 2 - C.winA || L6.phi <= C.winA;
  const want = L6.jumps % 2 === 0 ? 'L' : 'R';
  if(!inWin){ l6Miss('太早了'); return; }
  if(side !== want){ l6Miss('出错了脚'); return; }
  if(L6.jumped) return;

  L6.jumped = true;
  L6.jumps++;
  L6.jumpT = 0;
  Sfx.step();
  Sfx.tick(true);
  updateL6HUD();
  if(L6.jumps >= C.jumps){ l6Win(); return; }
  l6SetTask('好！绳子又要转过来了');
  l6ApplyHint();
}

function l6Miss(reason){
  if(L6.done) return;
  L6.misses++;
  L6.phase = 'miss'; L6.phaseT = 0;
  L6.jumpT = 1;
  L6.jumped = false;
  Sfx.thud();
  updateL6HUD();
  l6ApplyHint();
  l6SetTask(reason + '，等绳子到脚下再跳');
}

function l6Win(){
  if(L6.done) return;
  L6.done = true; L6.active = false;
  L6.phase = 'win'; L6.phaseT = 0;
  Sfx.win();
  l6ApplyHint();
  l6SetTask('🎉 8 次全跳过去了！');
  const used = L6.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎉 跳完啦！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L6.misses + '</b> 次', '再跳一次');
  }, 1500);
}

function l6Pose(dt, now){
  const C = CONFIG.lvl6;
  baseTargets();
  const br = Math.sin(now * 0.0021);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.03;
  TGT.armL.z = 1.02 + br * 0.03;      // 双手握着绳把手
  TGT.armR.z = -1.02 - br * 0.03;
  TGT.legL.z = 0.05;
  TGT.legR.z = -0.05;
  L6.jumpY = 0;

  if(L6.jumpT < 1){
    const s = Math.sin(Math.PI * L6.jumpT);
    L6.jumpY = s * C.jumpH;
    TGT.legL.z = -0.50 * s;
    TGT.legR.z = -0.50 * s;
    TGT.armL.z += 0.22 * s;
    TGT.armR.z -= 0.22 * s;
    TGT.spine.x = 0.08 * s;
  }else if(L6.phase === 'miss'){
    const k = Math.min(1, L6.phaseT / 0.55);
    const s = Math.sin(k * Math.PI);
    BTGT.rz = 0.42 * s;
    TGT.head.z = -0.2 * s;
    TGT.legL.z = 0.18 * s;
  }else if(L6.phase === 'win'){
    const hop = Math.abs(Math.sin(now * 0.0052));
    L6.jumpY = hop * 0.22;
    TGT.armL.z = 1.55 + hop * 0.15;
    TGT.armR.z = -1.55 - hop * 0.15;
    TGT.head.x = -0.12;
  }
  if(frog) frog.root.position.set(C.x, L6.jumpY, 0);
  applyPose(dt);
}

function l6Camera(dt){
  camFollow(dt, CONFIG.lvl6.x + 0.75, 2.05, 1.35);
}

function updateLevel6(dt, now){
  const C = CONFIG.lvl6;
  L6.phaseT += dt;
  if(L6.active && !L6.done) L6.elapsed += dt;

  if(L6.jumpT < 1){
    L6.jumpT = Math.min(1, L6.jumpT + dt / C.jumpT);
    if(L6.jumpT >= 1 && L6.active && !L6.done) Sfx.tick(false);
  }

  if(L6.phase === 'play' && L6.active){
    const prev = L6.phi;
    L6.phi = (L6.phi + (Math.PI * 2 / C.period) * dt) % (Math.PI * 2);
    if(prev < C.winA && L6.phi >= C.winA){
      if(L6.jumped){ L6.jumped = false; }
      else { l6Miss('绳子扫到脚了'); }
    }
  }else if(L6.phase === 'miss' && L6.phaseT >= C.missHold){
    L6.phase = 'play'; L6.phaseT = 0;
    L6.phi = Math.PI * 1.35;
    L6.jumped = false;
    l6SetTask('按发光的脚跳过绳子');
    l6ApplyHint();
  }

  if(L6.rope) L6.rope.rotation.z = L6.phi;
  if(L6.ring){
    const inWin = L6.phase === 'play' && (L6.phi >= Math.PI * 2 - C.winA || L6.phi <= C.winA);
    L6.ring.material.opacity += ((inWin ? 0.85 : 0) - L6.ring.material.opacity) * (1 - Math.exp(-dt * 12));
  }
  if(L6.phase === 'miss') L6.jumpY = 0;
  updateL6HUD();
  l6Pose(dt, now);
  l6Camera(dt);
}

// ============================================================
// 第七关：蓄力跳台阶
//
// 按住任意一只脚蓄力，蓄力条来回摆动；松手时如果正好卡在绿区，
// 奶蛙就跳到下一级台阶。力气不够 / 跳过头都算失误，人留在原地。
// 8 级台阶跳完 = 通关。
// ============================================================
const L7 = {
  active: false, done: false, phase: 'play', phaseT: 0,
  i: 0, power: 0, dir: 1, charging: false,
  jumpT: 1, fromX: 0, toX: 0, fromY: 0, toY: 0, jumpY: 0,
  misses: 0, elapsed: 0,
  props: null, hud: '', task: '', bar: '',
};
window.__l7 = L7;

function l7SetTask(t){
  if(!t || L7.task === t) return;
  L7.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function l7UpdateBar(){
  const C = CONFIG.lvl7;
  const z = C.zones[Math.min(L7.i, C.steps - 1)];
  if(el.l7Zone && z){
    el.l7Zone.style.display = 'block';
    el.l7Zone.style.left = (z[0] * 100).toFixed(1) + '%';
    el.l7Zone.style.width = ((z[1] - z[0]) * 100).toFixed(1) + '%';
  }
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
}

function updateL7HUD(){
  const key = L7.elapsed.toFixed(1) + '/' + L7.i + '/' + L7.misses;
  if(key === L7.hud) return;
  L7.hud = key;
  if(el.l2Time) el.l2Time.textContent = L7.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L7.i + '/' + CONFIG.lvl7.steps;
  if(el.l2Miss) el.l2Miss.textContent = L7.misses;
}

function buildL7Props(){
  if(L7.props) return L7.props;
  const C = CONFIG.lvl7;
  const g = new THREE.Group();
  // 8 级台阶：越往前越高，台阶之间留一点空
  for(let i = 1; i <= C.steps; i++){
    const top = C.stepY * i;
    const x = C.startX + i * C.gap;
    addBox(1.18, top + 0.22, 1.5, i % 2 ? 0xd7dde8 : 0xc6cfdf, x, (top - 0.22) / 2, 0, g);
    addBox(1.22, 0.08, 1.54, 0xffd93d, x, top + 0.02, 0, g);   // 台面亮边
  }
  // 终点的旗子
  const fx = C.startX + C.steps * C.gap;
  addBox(0.07, 1.7, 0.07, 0x3c4a5e, fx + 0.5, C.stepY * C.steps + 0.85, 0, g);
  addBox(0.62, 0.38, 0.03, 0xd94f4f, fx + 0.19, C.stepY * C.steps + 1.42, 0, g);

  g.visible = false;
  scene.add(g);
  L7.props = g;
  return g;
}

function startLevel7(){
  const C = CONFIG.lvl7;
  resetAllLevels();
  L7.active = true; L7.done = false;
  L7.phase = 'play'; L7.phaseT = 0;
  L7.i = 0; L7.power = 0; L7.dir = 1; L7.charging = false;
  L7.jumpT = 1; L7.jumpY = 0;
  L7.fx = C.startX; L7.fy = 0;
  L7.misses = 0; L7.elapsed = 0;
  L7.hud = ''; L7.task = '';
  buildL7Props().visible = true;
  l7UpdateBar();

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level7');
  setSky(0xbfe7ff);
  setLabels('用时', '台阶');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');

  resetFrogAt(C.startX, 0);
  G.camX = C.startX + 1.4; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  l7SetTask('按住任意脚蓄力，松手卡进绿区就跳上一台');
  updateL7HUD();
  Sfx.init();
}

function resetL7Scene(){
  document.body.classList.remove('level7');
  L7.active = false; L7.done = false;
  L7.phase = 'play'; L7.charging = false; L7.power = 0;
  L7.jumpT = 1; L7.jumpY = 0;
  L7.fx = CONFIG.lvl7.startX; L7.fy = 0;
  if(L7.props) L7.props.visible = false;
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0';
  L7.hud = ''; L7.task = '';
}

function l7Down(){
  if(G.level !== 7 || !L7.active || L7.done) return;
  if(L7.phase !== 'play' || L7.jumpT < 1) return;
  if(L7.charging) return;
  L7.charging = true;
  L7.dir = 1;
  Sfx.tick(false);
  l7SetTask('蓄力中…松手就跳');
}

function l7Up(){
  if(G.level !== 7 || !L7.active || L7.done) return;
  if(!L7.charging) return;
  L7.charging = false;
  const C = CONFIG.lvl7;
  const z = C.zones[L7.i];
  const p = L7.power;
  L7.power = 0; L7.dir = 1;
  if(!z) return;
  if(p >= z[0] && p <= z[1]) l7Jump();
  else l7Miss(p < z[0] ? '力气不够' : '跳过头了');
}

function l7Jump(){
  const C = CONFIG.lvl7;
  L7.phase = 'jump'; L7.phaseT = 0;
  L7.jumpT = 0; L7.jumpY = 0;
  L7.fromX = C.startX + L7.i * C.gap;
  L7.toX = C.startX + (L7.i + 1) * C.gap;
  L7.fromY = C.stepY * L7.i;
  L7.toY = C.stepY * (L7.i + 1);
  Sfx.step();
  l7SetTask('跳！');
}

function l7Miss(reason){
  L7.misses++;
  L7.phase = 'miss'; L7.phaseT = 0;
  L7.jumpT = 1; L7.jumpY = 0;
  Sfx.thud();
  l7SetTask(reason + '，再试一次');
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  updateL7HUD();
}

function l7Win(){
  if(L7.done) return;
  L7.done = true; L7.active = false;
  L7.phase = 'win'; L7.phaseT = 0;
  Sfx.win();
  l7SetTaskSafe('🎉 八级台阶全上来了！');
  const used = L7.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🚩 跳上最后一台！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L7.misses + '</b> 次', '再跳一次');
  }, 1400);
}

function l7Pose(dt, now){
  const C = CONFIG.lvl7;
  baseTargets();
  const br = Math.sin(now * 0.0021);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.03;
  TGT.armL.z = 0.08 + br * 0.02;
  TGT.armR.z = -0.08 - br * 0.02;
  TGT.legL.z = 0.04;
  TGT.legR.z = -0.04;
  L7.jumpY = 0;

  if(L7.phase === 'play' && L7.charging){
    const k = L7.power;
    BTGT.y = -0.14 * k;
    TGT.legL.z = 0.32 * k;
    TGT.legR.z = -0.32 * k;
    TGT.spine.x = 0.20 * k;
    TGT.armL.z = -0.35 * k;
    TGT.armR.z = 0.35 * k;
  }else if(L7.phase === 'jump' && L7.jumpT < 1){
    const s = Math.sin(Math.PI * L7.jumpT);
    L7.jumpY = s * C.jumpH;
    TGT.legL.z = -0.52 * s;
    TGT.legR.z = -0.52 * s;
    TGT.armL.z = 0.55 * s;
    TGT.armR.z = -0.55 * s;
  }else if(L7.phase === 'miss'){
    const k = Math.min(1, L7.phaseT / 0.5);
    const s = Math.sin(k * Math.PI);
    BTGT.rz = 0.38 * s;
    BTGT.y = 0.12 * s;
    TGT.armL.z = 0.45 * s;
    TGT.armR.z = -0.45 * s;
  }else if(L7.phase === 'win'){
    const hop = Math.abs(Math.sin(now * 0.005));
    L7.jumpY = hop * 0.18;
    TGT.armL.z = 1.35;
    TGT.armR.z = -1.35;
  }
  if(frog) frog.root.position.set(L7.fx, L7.fy + L7.jumpY, 0);
  applyPose(dt);
}

function l7Camera(dt){
  camFollow(dt, (L7.fx || CONFIG.lvl7.startX) + 1.35, 2.1, 1.55);
}

function updateLevel7(dt, now){
  const C = CONFIG.lvl7;
  L7.phaseT += dt;
  if(L7.active && !L7.done) L7.elapsed += dt;

  if(L7.charging && L7.phase === 'play'){
    L7.power += (dt / (L7.dir > 0 ? C.chargeUp : C.chargeDown)) * L7.dir;
    if(L7.power >= 1){ L7.power = 1; L7.dir = -1; }
    if(L7.power <= 0){ L7.power = 0; L7.dir = 1; }
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L7.power * 100).toFixed(1) + '%';

  if(L7.phase === 'jump' && L7.jumpT < 1){
    L7.jumpT = Math.min(1, L7.jumpT + dt / C.jumpT);
    const t = L7.jumpT;
    L7.fx = L7.fromX + (L7.toX - L7.fromX) * t;
    L7.fy = L7.fromY + (L7.toY - L7.fromY) * t;
    if(t >= 1){
      L7.i++;
      L7.phase = 'play'; L7.phaseT = 0;
      L7.power = 0; L7.dir = 1;
      Sfx.tick(true);
      updateL7HUD();
      if(L7.i >= C.steps){ l7Win(); }
      else { l7UpdateBar(); l7SetTask('再来！卡进绿区跳下一台'); }
    }
  }else if(L7.phase === 'miss' && L7.phaseT >= C.missHold){
    L7.phase = 'play'; L7.phaseT = 0;
    l7SetTaskSafe();
  }
  updateL7HUD();
  l7Pose(dt, now);
  l7Camera(dt);
}

function l7SetTaskSafe(){
  l7SetTask('按住任意脚蓄力，松手卡进绿区就跳上一台');
}

// ============================================================
// 第八关：记节奏
//
// 四块踏板对应左手 / 右手 / 左脚 / 右脚。每一轮先演示一串动作
// （踏板亮起 + 音效），然后玩家必须原样按出来。
// 按错就重新播放这一轮，5 轮全部复现 = 通关。
// ============================================================
const L8 = {
  active: false, done: false, phase: 'idle', phaseT: 0,
  round: 0, seq: [], idx: 0, demoIdx: -1, demoT: 0,
  misses: 0, elapsed: 0, flash: {},
  props: null, pads: {},
  hud: '', task: '', seqKey: '',
};
window.__l8 = L8;

const L8_COLORS = { HL: 0xffd93d, HR: 0xff9a3d, FL: 0x3ddc84, FR: 0x2a7bd6 };

function l8SetTask(t){
  if(!t || L8.task === t) return;
  L8.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL8HUD(){
  const key = L8.elapsed.toFixed(1) + '/' + L8.round + '/' + L8.misses;
  if(key === L8.hud) return;
  L8.hud = key;
  if(el.l2Time) el.l2Time.textContent = L8.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = Math.min(CONFIG.lvl8.rounds, L8.round + (L8.active ? 1 : 0)) + '/' + CONFIG.lvl8.rounds;
  if(el.l2Miss) el.l2Miss.textContent = L8.misses;
}

function l8RenderSeq(){
  if(!el.l5Seq) return;
  const now = L8.phase === 'demo' ? L8.demoIdx : (L8.phase === 'input' ? L8.idx : -1);
  const key = L8.round + '/' + L8.seq.join('') + '/' + now + '/' + L8.phase;
  if(key === L8.seqKey) return;
  L8.seqKey = key;
  el.l5Seq.innerHTML = seqBarHtml(L8.seq, L8.phase === 'input' ? L8.idx : 0, now, '→');
}

function l8Flash(code, len){
  L8.flash[code] = len || 0.30;
}

function l8PadsUpdate(dt){
  for(const code in L8.pads){
    const pad = L8.pads[code];
    const f = L8.flash[code] || 0;
    L8.flash[code] = Math.max(0, f - dt);
    const k = f > 0 ? 1 : 0.16;
    if(pad.material) pad.material.emissiveIntensity = k;
  }
}

function buildL8Props(){
  if(L8.props) return L8.props;
  const C = CONFIG.lvl8;
  const g = new THREE.Group();
  const offs = { HL: -0.95, FL: -0.32, HR: 0.32, FR: 0.95 };
  for(const code in offs){
    const mat = new THREE.MeshLambertMaterial({
      color: L8_COLORS[code], emissive: L8_COLORS[code], emissiveIntensity: 0.16,
    });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.52), mat);
    pad.position.set(C.x + offs[code], 0.05, -0.72);
    g.add(pad);
    L8.pads[code] = pad;
    // 踏板上的音筒
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.12, 14),
      new THREE.MeshLambertMaterial({ color: 0xf4f1e6 })
    );
    cyl.position.set(C.x + offs[code], 0.16, -0.72);
    g.add(cyl);
  }
  // 一盏小路灯，给踏板打光
  addBox(0.10, 2.2, 0.10, 0x3c4a5e, C.x + 1.5, 1.1, -1.1, g);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
  );
  head.position.set(C.x + 1.5, 2.2, -1.1);
  g.add(head);

  g.visible = false;
  scene.add(g);
  L8.props = g;
  return g;
}

function startLevel8(){
  const C = CONFIG.lvl8;
  resetAllLevels();
  L8.active = true; L8.done = false;
  L8.round = 0; L8.misses = 0; L8.elapsed = 0;
  L8.idx = 0; L8.seq = []; L8.demoIdx = -1; L8.demoT = 0;
  L8.flash = {}; L8.hud = ''; L8.task = ''; L8.seqKey = '';
  buildL8Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level8');
  setSky(0xbfe7ff);
  setLabels('用时', '轮次');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');

  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.95; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  l8StartRound();
  updateL8HUD();
  Sfx.init();
}

function resetL8Scene(){
  document.body.classList.remove('level8');
  L8.active = false; L8.done = false;
  L8.phase = 'idle'; L8.seq = []; L8.idx = 0; L8.demoIdx = -1;
  L8.flash = {}; L8.hud = ''; L8.task = ''; L8.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(L8.props) L8.props.visible = false;
}

function l8NewSeq(n){
  const limbs = ['HL', 'HR', 'FL', 'FR'];
  const out = [];
  for(let i = 0; i < n; i++){
    let c = limbs[Math.floor(Math.random() * limbs.length)];
    if(i > 0 && c === out[i - 1]) c = limbs[(limbs.indexOf(c) + 1) % limbs.length];
    out.push(c);
  }
  return out;
}

function l8StartRound(){
  const C = CONFIG.lvl8;
  L8.seq = l8NewSeq(C.lens[L8.round] || 4);
  L8.idx = 0; L8.demoIdx = -1; L8.demoT = 0.40;
  L8.phase = 'demo'; L8.phaseT = 0;
  l8SetTask('看清楚：一共 ' + L8.seq.length + ' 个动作');
  l8RenderSeq();
  updateL8HUD();
}

function l8Press(code){
  if(G.level !== 8 || !L8.active || L8.done) return;
  if(L8.phase !== 'input') return;
  l8Flash(code, 0.30);
  if(code !== L8.seq[L8.idx]){
    l8Miss();
    return;
  }
  L8.idx++;
  Sfx.tick(false);
  l8RenderSeq();
  if(L8.idx >= L8.seq.length){
    L8.phase = 'gap'; L8.phaseT = 0;
    Sfx.perfect();
    l8SetTask('这一轮过了！');
  }else{
    l8SetTask('继续（' + L8.idx + '/' + L8.seq.length + '）');
  }
}

function l8Miss(){
  L8.misses++;
  L8.phase = 'miss'; L8.phaseT = 0;
  Sfx.thud();
  l8SetTask('按错了，再看一遍');
  L8.idx = 0;
  updateL8HUD();
  l8RenderSeq();
}

function l8CompleteRound(){
  const C = CONFIG.lvl8;
  L8.round++;
  updateL8HUD();
  if(L8.round >= C.rounds){ l8Win(); return; }
  L8.phase = 'pause'; L8.phaseT = 0;
  l8SetTask('第 ' + (L8.round + 1) + ' 轮准备…');
}

function l8Win(){
  if(L8.done) return;
  L8.done = true; L8.active = false;
  L8.phase = 'win'; L8.phaseT = 0;
  Sfx.win();
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  l8SetTask('🎉 五轮节奏全记住了！');
  const used = L8.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎵 节奏全对！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L8.misses + '</b> 次', '再来一轮');
  }, 1400);
}

function l8Pose(dt, now){
  const C = CONFIG.lvl8;
  baseTargets();
  const br = Math.sin(now * 0.0021);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.03;
  TGT.armL.z = 0.10 + br * 0.02;
  TGT.armR.z = -0.10 - br * 0.02;
  TGT.legL.z = 0.05;
  TGT.legR.z = -0.05;
  for(const code in L8.flash){
    if(L8.flash[code] <= 0) continue;
    const p = Math.min(1, L8.flash[code] / 0.30);
    if(code === 'HL') TGT.armL.z += 1.0 * p;
    else if(code === 'HR') TGT.armR.z -= 1.0 * p;
    else if(code === 'FL'){ TGT.legL.z = -0.55 * p; TGT.legR.z = 0.10 * p; }
    else { TGT.legR.z = -0.55 * p; TGT.legL.z = -0.10 * p; }
  }
  if(L8.phase === 'win'){
    BTGT.y = Math.abs(Math.sin(now * 0.0048)) * 0.20;
    TGT.armL.z = 1.3;
    TGT.armR.z = -1.3;
  }else if(L8.phase === 'miss'){
    const k = Math.min(1, L8.phaseT / 0.5);
    BTGT.rz = 0.35 * Math.sin(k * Math.PI);
  }
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l8Camera(dt){
  camFollow(dt, CONFIG.lvl8.x + 0.95, 2.05, 1.35);
}

function updateLevel8(dt, now){
  const C = CONFIG.lvl8;
  L8.phaseT += dt;
  if(L8.active && !L8.done) L8.elapsed += dt;
  l8PadsUpdate(dt);

  if(L8.phase === 'demo' && L8.active){
    L8.demoT -= dt;
    if(L8.demoT <= 0){
      L8.demoIdx++;
      if(L8.demoIdx < L8.seq.length){
        const code = L8.seq[L8.demoIdx];
        l8Flash(code, 0.32);
        Sfx.tick(false);
        l8RenderSeq();
        L8.demoT = C.demoGap;
      }else{
        L8.demoT = 0.55;
        L8.phase = 'input';
        L8.idx = 0;
        L8.demoIdx = -1;
        l8SetTask('轮到你了：按顺序复现');
        l8RenderSeq();
      }
    }
  }else if(L8.phase === 'miss' && L8.phaseT >= C.missHold){
    L8.demoIdx = -1;
    L8.demoT = 0.35;
    L8.idx = 0;
    L8.phase = 'demo'; L8.phaseT = 0;
    l8SetTask('再看一遍');
    l8RenderSeq();
  }else if(L8.phase === 'gap' && L8.phaseT >= 0.55){
    l8CompleteRound();
  }else if(L8.phase === 'pause' && L8.phaseT >= C.roundGap){
    l8StartRound();
  }
  updateL8HUD();
  l8Pose(dt, now);
  l8Camera(dt);
}

// ============================================================
// 第九关：擦车窗
//
// 公交停在路边，四扇车窗糊着泥。按住下面的圆圈，顺着箭头方向画圈，
// 画够圈数那扇窗就擦干净。四扇窗全亮 = 通关。
// ============================================================
const L9 = {
  active: false, done: false, phase: 'play',
  win: 0, turns: 0, misses: 0, elapsed: 0,
  dragging: false, pointerId: null, lastAng: null,
  missCool: 0, badFlash: 0,
  props: null, windows: [], dirt: [], frame: null,
  hud: '', task: '',
};
window.__l9 = L9;

function l9SetTask(t){
  if(!t || L9.task === t) return;
  L9.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL9HUD(){
  const key = L9.elapsed.toFixed(1) + '/' + L9.win + '/' + L9.misses;
  if(key === L9.hud) return;
  L9.hud = key;
  if(el.l2Time) el.l2Time.textContent = L9.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L9.win + '/' + CONFIG.lvl9.windows;
  if(el.l2Miss) el.l2Miss.textContent = L9.misses;
}

function l9DirtTexture(){
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, S, S);
  for(let i = 0; i < 18; i++){
    const r = 10 + Math.random() * 26;
    const x = Math.random() * S, y = Math.random() * S;
    const grd = c.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,104,86,0.72)');
    grd.addColorStop(1, 'rgba(120,104,86,0)');
    c.fillStyle = grd;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = 'rgba(96,84,70,0.35)';
  for(let i = 0; i < 6; i++){
    c.lineWidth = 2 + Math.random() * 4;
    c.beginPath();
    c.moveTo(Math.random() * S, 0);
    c.bezierCurveTo(Math.random() * S, S / 3, Math.random() * S, S * 0.7, Math.random() * S, S);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildL9Props(){
  if(L9.props) return L9.props;
  const C = CONFIG.lvl9;
  const g = new THREE.Group();
  const xs = [-2.25, -0.75, 0.75, 2.25];
  // 车窗贴在公交朝向镜头的那一面：位置由包围盒算出来，不用手调
  const bb = new THREE.Box3().setFromObject(bus.flip);
  const zFace = bb.max.z + 0.015;
  const yWin = bb.max.y - 0.72;
  for(const dx of xs){
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.64),
      new THREE.MeshBasicMaterial({ color: 0xcfe7ff })
    );
    glass.position.set(C.busX + dx, yWin, zFace);
    g.add(glass);
    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.66),
      new THREE.MeshBasicMaterial({ map: l9DirtTexture(), transparent: true, opacity: 0.92, depthWrite: false })
    );
    dirt.position.set(C.busX + dx, yWin, zFace + 0.006);
    g.add(dirt);
    L9.windows.push(glass);
    L9.dirt.push(dirt);
  }
  // 当前正在擦的窗框
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.78),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.75, depthWrite: false })
  );
  frame.position.set(C.busX + xs[0], yWin, zFace + 0.012);
  g.add(frame);
  L9.frame = frame;

  g.visible = false;
  scene.add(g);
  L9.props = g;
  return g;
}

function l9SetDir(){
  const C = CONFIG.lvl9;
  const dir = C.dirs[Math.min(L9.win, C.dirs.length - 1)];
  if(el.l9Lbl) el.l9Lbl.textContent = dir > 0 ? '顺时针画圈' : '逆时针画圈';
  if(el.l9Zone) el.l9Zone.style.setProperty('--p', '0');
  if(el.l9Ring) el.l9Ring.style.transform = dir > 0 ? 'rotate(0deg)' : 'rotate(180deg)';
  if(L9.frame && L9.win < C.windows){
    L9.frame.position.x = C.busX + [-2.25, -0.75, 0.75, 2.25][L9.win];
  }
}

function startLevel9(){
  const C = CONFIG.lvl9;
  resetAllLevels();
  L9.active = true; L9.done = false;
  L9.win = 0; L9.turns = 0; L9.misses = 0; L9.elapsed = 0;
  L9.dragging = false; L9.lastAng = null; L9.missCool = 0; L9.badFlash = 0;
  L9.hud = ''; L9.task = '';
  buildL9Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level9');
  setSky(0xbfe7ff);
  setLabels('用时', '车窗');
  if(el.l9Zone) el.l9Zone.classList.add('show');

  resetFrogAt(C.busX, 0);
  G.camX = C.busX + 1.2; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  l9SetDir();
  l9SetTask('按住圆圈，顺时针画圈擦第 1 扇窗');
  updateL9HUD();
  Sfx.init();
}

function resetL9Scene(){
  document.body.classList.remove('level9');
  L9.active = false; L9.done = false;
  L9.win = 0; L9.turns = 0; L9.dragging = false; L9.lastAng = null;
  L9.hud = ''; L9.task = '';
  if(el.l9Zone) el.l9Zone.classList.remove('show', 'bad');
  if(el.l9Ring) el.l9Ring.style.transform = 'rotate(0deg)';
  if(L9.props) L9.props.visible = false;
}

function l9Down(e){
  if(G.level !== 9 || !L9.active || L9.done) return;
  e.preventDefault();
  L9.dragging = true;
  L9.pointerId = e.pointerId;
  L9.lastAng = null;
  if(el.l9Zone) el.l9Zone.classList.add('show');
}

function l9Move(e){
  if(!L9.dragging || !L9.active || L9.done) return;
  if(e.pointerId !== L9.pointerId) return;
  const C = CONFIG.lvl9;
  const box = el.l9Zone.getBoundingClientRect();
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const a = Math.atan2(e.clientY - cy, e.clientX - cx);
  if(L9.lastAng === null){ L9.lastAng = a; return; }
  let d = a - L9.lastAng;
  if(d > Math.PI) d -= Math.PI * 2;
  if(d < -Math.PI) d += Math.PI * 2;
  L9.lastAng = a;
  if(Math.abs(d) > 0.55) return;      // 抖动/跳变忽略
  const dir = C.dirs[Math.min(L9.win, C.dirs.length - 1)];
  if(Math.sign(d) === dir && Math.abs(d) > 0.02){
    L9.turns += Math.abs(d);
    L9.badFlash = 0;
    if(el.l9Ring) el.l9Ring.style.transform = dir > 0 ? 'rotate(0deg)' : 'rotate(180deg)';
    if(el.l9Zone) el.l9Zone.style.setProperty('--p', Math.min(1, L9.turns / (C.turns * Math.PI * 2)).toFixed(3));
    if(L9.turns >= C.turns * Math.PI * 2) l9CleanDone();
  }else if(Math.abs(d) > 0.05){
    L9.badFlash = 0.35;
    if(el.l9Zone) el.l9Zone.classList.add('bad');
    if(L9.missCool <= 0){
      L9.misses++;
      L9.missCool = C.missCool;
      l9SetTask(dir > 0 ? '方向反了，要顺时针画' : '方向反了，要逆时针画');
      updateL9HUD();
    }
  }
}

function l9Up(e){
  if(e && e.pointerId !== undefined && e.pointerId !== L9.pointerId) return;
  L9.dragging = false;
  L9.lastAng = null;
}

function l9CleanDone(){
  const C = CONFIG.lvl9;
  L9.dirt[L9.win].material.opacity = 0;
  L9.win++;
  L9.turns = 0;
  L9.lastAng = null;
  Sfx.perfect();
  updateL9HUD();
  if(L9.win >= C.windows){ l9Win(); return; }
  l9SetDir();
  l9SetTask('擦干净了！继续擦第 ' + (L9.win + 1) + ' 扇窗');
}

function l9Win(){
  if(L9.done) return;
  L9.done = true; L9.active = false;
  L9.dragging = false;
  L9.phase = 'win';
  Sfx.win();
  if(el.l9Zone) el.l9Zone.classList.remove('show', 'bad');
  l9SetTask('🎉 四扇窗全擦亮了！');
  const used = L9.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('✨ 车窗亮晶晶！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L9.misses + '</b> 次', '再擦一遍');
  }, 1300);
}

function l9Pose(dt, now){
  baseTargets();
  const br = Math.sin(now * 0.0021);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.03;
  TGT.armL.z = 0.08 + br * 0.02;
  TGT.armR.z = -0.08 - br * 0.02;
  TGT.legL.z = 0.05;
  TGT.legR.z = -0.05;
  if(L9.dragging){
    // 擦窗时右手抬起来画圈
    TGT.armR.z = -1.25;
    TGT.armR.y = Math.sin(now * 0.008) * 0.25;
    TGT.spine.x = 0.06;
    TGT.head.z = Math.sin(now * 0.008) * 0.06;
  }
  if(L9.done){
    BTGT.y = Math.abs(Math.sin(now * 0.005)) * 0.18;
    TGT.armL.z = 1.3;
    TGT.armR.z = -1.3;
  }
  if(frog) frog.root.position.set(CONFIG.lvl9.busX + CONFIG.lvl9.frogDX, 0, CONFIG.lvl9.frogZ);
  applyPose(dt);
}

function l9Camera(dt){
  camFollow(dt, CONFIG.lvl9.busX + CONFIG.lvl9.camX, CONFIG.lvl9.camHalf, 1.9);
}

function updateLevel9(dt, now){
  const C = CONFIG.lvl9;
  if(L9.active && !L9.done) L9.elapsed += dt;
  if(L9.missCool > 0) L9.missCool -= dt;
  if(L9.badFlash > 0){ L9.badFlash -= dt; if(L9.badFlash <= 0 && el.l9Zone) el.l9Zone.classList.remove('bad'); }

  for(let i = 0; i < L9.dirt.length; i++){
    const m = L9.dirt[i].material;
    const target = i < L9.win ? 0 : 0.92;
    m.opacity += (target - m.opacity) * (1 - Math.exp(-dt * 6));
  }
  if(L9.frame && L9.win < C.windows){
    const k = 0.5 + 0.5 * Math.sin(now * 0.007);
    L9.frame.material.opacity = 0.45 + 0.35 * k;
    L9.frame.visible = true;
  }else if(L9.frame){
    L9.frame.visible = false;
  }
  updateL9HUD();
  l9Pose(dt, now);
  l9Camera(dt);
}

// ============================================================
// 第十关：拍手跺脚
//
// 每一拍要「同时」按下两个部位（例如 左手 + 右脚），两只手差超过
// 0.24 秒 / 多按了别的部位 / 整个窗口都没按完，都算失误。
// 8 拍全对 = 通关。
// ============================================================
const L10 = {
  active: false, done: false, phase: 'gap', phaseT: 0,
  idx: 0, hits: 0, misses: 0, elapsed: 0,
  beatT: 0, down: {}, downAt: {}, clock: 0,
  oneDownT: 0, flash: {},
  props: null, pads: {},
  hud: '', task: '', seqKey: '',
};
window.__l10 = L10;

function l10Pair(){
  const C = CONFIG.lvl10;
  return C.pairs[Math.min(L10.idx, C.pairs.length - 1)];
}

function l10SetTask(t){
  if(!t || L10.task === t) return;
  L10.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL10HUD(){
  const key = L10.elapsed.toFixed(1) + '/' + L10.hits + '/' + L10.misses;
  if(key === L10.hud) return;
  L10.hud = key;
  if(el.l2Time) el.l2Time.textContent = L10.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L10.hits + '/' + CONFIG.lvl10.beats;
  if(el.l2Miss) el.l2Miss.textContent = L10.misses;
}

function l10RenderSeq(){
  if(!el.l5Seq) return;
  const pair = l10Pair();
  const key = L10.idx + '/' + pair.join('') + '/' + L10.phase + '/' + L10.hits;
  if(key === L10.seqKey) return;
  L10.seqKey = key;
  if(L10.done){ el.l5Seq.innerHTML = ''; return; }
  el.l5Seq.innerHTML = seqBarHtml(pair, 0, -1, '+');
}

function l10ApplyHint(){
  const pair = l10Pair();
  const live = L10.active && !L10.done && L10.phase === 'beat';
  for(const [code, node] of [['HL', el.btnL], ['HR', el.btnR], ['FL', el.footL], ['FR', el.footR]]){
    if(node) node.classList.toggle('want', live && pair.indexOf(code) !== -1);
  }
}

function l10Flash(code){
  L10.flash[code] = 0.28;
}

function l10PadsUpdate(dt){
  for(const code in L10.pads){
    const f = L10.flash[code] || 0;
    L10.flash[code] = Math.max(0, f - dt);
    const m = L10.pads[code].material;
    if(m) m.emissiveIntensity = f > 0 ? 1 : 0.14;
  }
}

function buildL10Props(){
  if(L10.props) return L10.props;
  const C = CONFIG.lvl10;
  const g = new THREE.Group();
  const offs = { HL: -0.95, FL: -0.32, HR: 0.32, FR: 0.95 };
  for(const code in offs){
    const mat = new THREE.MeshLambertMaterial({
      color: L8_COLORS[code], emissive: L8_COLORS[code], emissiveIntensity: 0.14,
    });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.52), mat);
    pad.position.set(C.x + offs[code], 0.05, -0.72);
    g.add(pad);
    L10.pads[code] = pad;
  }
  g.visible = false;
  scene.add(g);
  L10.props = g;
  return g;
}

function startLevel10(){
  const C = CONFIG.lvl10;
  resetAllLevels();
  L10.active = true; L10.done = false;
  L10.idx = 0; L10.hits = 0; L10.misses = 0; L10.elapsed = 0;
  L10.phase = 'gap'; L10.phaseT = 0; L10.beatT = 0;
  L10.down = {}; L10.downAt = {}; L10.clock = 0; L10.oneDownT = 0;
  L10.flash = {}; L10.hud = ''; L10.task = ''; L10.seqKey = '';
  buildL10Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level10');
  setSky(0xbfe7ff);
  setLabels('用时', '拍数');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');

  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.95; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  l10RenderSeq();
  l10SetTask('两个动作要一起按，差一点点都不算');
  updateL10HUD();

  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  L10.phase = 'gap'; L10.phaseT = 0.2;
  Sfx.init();
}

function resetL10Scene(){
  document.body.classList.remove('level10');
  L10.active = false; L10.done = false;
  L10.phase = 'gap'; L10.down = {}; L10.downAt = {}; L10.flash = {};
  L10.hud = ''; L10.task = ''; L10.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0';
  if(L10.props) L10.props.visible = false;
}

function l10StartBeat(){
  const C = CONFIG.lvl10;
  L10.phase = 'beat'; L10.phaseT = 0;
  L10.beatT = C.window;
  L10.down = {}; L10.downAt = {};
  L10.oneDownT = 0;
  L10.seqKey = '';
  l10RenderSeq();
  l10ApplyHint();
  l10SetTask('同时按下 ' + (l10Pair().map(c=>L5_LIMB[c]).join(' + ')));
}

function l10Down(code){
  if(G.level !== 10 || !L10.active || L10.done) return;
  if(code in L10.down) return;
  L10.down[code] = true;
  L10.downAt[code] = L10.clock;
  l10Flash(code);
  if(L10.phase !== 'beat') return;
  const pair = l10Pair();
  const extra = Object.keys(L10.down).find(k=>pair.indexOf(k) === -1);
  if(extra){ l10Resolve(false, '多按了 ' + L5_LIMB[extra]); return; }
  if(pair.every(k=>L10.down[k]) && Math.abs(L10.downAt[pair[0]] - L10.downAt[pair[1]]) <= CONFIG.lvl10.syncT){
    l10Resolve(true);
  }
}

function l10Up(code){
  if(code in L10.down) delete L10.down[code];
  if(code in L10.downAt) delete L10.downAt[code];
}

function l10Resolve(ok, reason){
  const C = CONFIG.lvl10;
  L10ApplyHintClear();
  if(ok){
    L10.hits++;
    L10.idx++;
    Sfx.perfect();
    L10.phase = 'gap'; L10.phaseT = 0;
    updateL10HUD();
    if(L10.hits >= C.beats){ l10Win(); return; }
    l10RenderSeq();
  }else{
    L10.misses++;
    Sfx.thud();
    L10.phase = 'gap'; L10.phaseT = 0;
    updateL10HUD();
    l10SetTask((reason || '没跟上') + '，下一拍');
    L10.idx = Math.min(C.beats - 1, L10.idx + 1);
    L10.seqKey = '';
    l10RenderSeq();
  }
}

function L10ApplyHintClear(){
  for(const node of [el.btnL, el.btnR, el.footL, el.footR]) if(node) node.classList.remove('want');
}

function l10Win(){
  if(L10.done) return;
  L10.done = true; L10.active = false;
  L10.phase = 'win'; L10.phaseT = 0;
  Sfx.win();
  L10ApplyHintClear();
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l10SetTask('🎉 八拍全对！');
  const used = L10.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('👏 节奏大师！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L10.misses + '</b> 次', '再来一遍');
  }, 1400);
}

function l10Pose(dt, now){
  const C = CONFIG.lvl10;
  baseTargets();
  const br = Math.sin(now * 0.0021);
  TGT.spine.x = br * 0.02;
  TGT.head.x = br * 0.03;
  TGT.armL.z = 0.09 + br * 0.02;
  TGT.armR.z = -0.09 - br * 0.02;
  TGT.legL.z = 0.05;
  TGT.legR.z = -0.05;
  for(const code in L10.flash){
    if(L10.flash[code] <= 0) continue;
    const p = Math.min(1, L10.flash[code] / 0.28);
    if(code === 'HL') TGT.armL.z += 1.0 * p;
    else if(code === 'HR') TGT.armR.z -= 1.0 * p;
    else if(code === 'FL'){ TGT.legL.z = -0.5 * p; TGT.legR.z = 0.08 * p; }
    else { TGT.legR.z = -0.5 * p; TGT.legL.z = -0.08 * p; }
  }
  if(L10.phase === 'win'){
    BTGT.y = Math.abs(Math.sin(now * 0.005)) * 0.20;
    TGT.armL.z = 1.3;
    TGT.armR.z = -1.3;
  }else if(L10.phase === 'gap' && L10.phaseT < 0.2){
    BTGT.y = 0.04;
  }
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l10Camera(dt){
  camFollow(dt, CONFIG.lvl10.x + 0.95, 2.05, 1.35);
}

function updateLevel10(dt, now){
  const C = CONFIG.lvl10;
  L10.phaseT += dt;
  L10.clock += dt;
  if(L10.active && !L10.done) L10.elapsed += dt;
  l10PadsUpdate(dt);

  if(L10.phase === 'beat' && L10.active){
    L10.beatT -= dt;
    if(el.l2ProgFill) el.l2ProgFill.style.width = Math.max(0, (L10.beatT / C.window) * 100).toFixed(1) + '%';
    const pair = l10Pair();
    if(pair.some(k=>L10.down[k])){
      L10.oneDownT += dt;
      if(L10.oneDownT > C.syncT && !pair.every(k=>L10.down[k])){
        l10Resolve(false, '慢了半拍');
      }
    }
    if(L10.beatT <= 0 && L10.phase === 'beat'){ l10Resolve(false, '没跟上'); }
  }else{
    if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
    if(L10.phase === 'gap' && L10.phaseT >= C.gap){
      L10.idx = Math.min(L10.idx, C.beats - 1);
      l10StartBeat();
    }
  }
  updateL10HUD();
  l10Pose(dt, now);
  l10Camera(dt);
}

// ---- 各关共用的小工具 ----
function baseTargets(){
  TGT = {};
  for(const k of BONES) TGT[k] = { x: 0, y: 0, z: 0 };
  BTGT = { rz: 0, ry: 0, y: 0 };
}

function seqBarHtml(seq, doneCount, nowIdx, arrow){
  if(!seq || !seq.length) return '';
  return seq.map((code, i)=>{
    let cls = 'l5chip ' + (code[0] === 'H' ? 'hand' : 'foot');
    if(i < doneCount) cls += ' done';
    if(i === nowIdx) cls += ' now';
    return '<span class="' + cls + '">' + L5_LIMB[code] + '</span>';
  }).join('<i class="l5arrow">' + arrow + '</i>');
}

function setLabels(a, b){
  if(el.l2TimeLbl) el.l2TimeLbl.textContent = a;
  if(el.l2StepLbl) el.l2StepLbl.textContent = b;
  if(el.l2TimeChip) el.l2TimeChip.classList.remove('low');
}

function setBtnText(node, icon, text){
  if(node) node.innerHTML = '<span>' + icon + '</span>' + text;
}

function resetFrogAt(x, y){
  if(!frog) return;
  frog.root.position.set(x, y || 0, 0);
  frog.root.rotation.y = CONFIG.frog.yaw;
  frog.body.rotation.set(0, 0, 0);
  frog.body.position.set(0, 0, 0);
  for(const k in frog.parts){
    const p = frog.parts[k];
    p.pose.x = p.pose.y = p.pose.z = 0;
  }
}

function camFollow(dt, wantX, halfNeed, lookY){
  const portrait = camera.aspect < 1.15;
  let wantZ = CONFIG.cam.z;
  if(portrait){
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.cam.fov) * 0.5) * camera.aspect);
    wantZ = THREE.MathUtils.clamp(halfNeed / Math.tan(hFov * 0.5), CONFIG.cam.z, 32);
  }
  G.camX += (wantX - G.camX) * (1 - Math.exp(-dt * 3));
  G.camZ += (wantZ - G.camZ) * (1 - Math.exp(-dt * 3));
  G.camY += (CONFIG.cam.y - G.camY) * (1 - Math.exp(-dt * 3));
  camera.position.set(G.camX, G.camY, G.camZ);
  camera.lookAt(G.camX, lookY || 1.45, 0);
  scene.fog.near = Math.max(24, camera.position.z + 6);
  scene.fog.far = scene.fog.near + 52;
}

function resetAllLevels(){
  if(ring) ring.visible = false;
  for(const p of pads) p.visible = false;
  if(L2.props) L2.props.visible = false;
  if(L3.props) L3.props.visible = false;
  resetL4Scene();
  resetL5Scene();
  resetL6Scene();
  resetL7Scene();
  resetL8Scene();
  resetL9Scene();
  resetL10Scene();
  document.body.classList.remove('level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'level8', 'level9', 'level10');
  setLabels('剩余', '台阶');
  for(const b of [el.btnL, el.btnR, el.footL, el.footR]) if(b) b.classList.remove('want', 'drop');
}

// ============================================================
// 每帧更新
// ============================================================
let lastT = performance.now();

function update(dt, now){
  if(G.level === 10){ updateLevel10(dt, now); return; }
  if(G.level === 9){ updateLevel9(dt, now); return; }
  if(G.level === 8){ updateLevel8(dt, now); return; }
  if(G.level === 7){ updateLevel7(dt, now); return; }
  if(G.level === 6){ updateLevel6(dt, now); return; }
  if(G.level === 5){ updateLevel5(dt, now); return; }
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
  if(G.level === 10){
    // A / D 左手右手，J / K 左脚右脚：同一拍要同时按两个
    if(k === 'a'){ e.preventDefault(); l10Down('HL'); }
    else if(k === 'd'){ e.preventDefault(); l10Down('HR'); }
    else if(k === 'j'){ e.preventDefault(); l10Down('FL'); }
    else if(k === 'k'){ e.preventDefault(); l10Down('FR'); }
    else if(k === 'r' && L10.done) startGame(10);
    return;
  }
  if(G.level === 8){
    // A / D 手，J / K 脚，按演示顺序复现
    if(k === 'a'){ e.preventDefault(); l8Press('HL'); }
    else if(k === 'd'){ e.preventDefault(); l8Press('HR'); }
    else if(k === 'j'){ e.preventDefault(); l8Press('FL'); }
    else if(k === 'k'){ e.preventDefault(); l8Press('FR'); }
    else if(k === 'r' && L8.done) startGame(8);
    return;
  }
  if(G.level === 7){
    // J / K 按住蓄力，松开就跳（keyup 里处理）
    if(k === 'j' || k === 'k'){ e.preventDefault(); l7Down(); }
    else if(k === 'r' && L7.done) startGame(7);
    return;
  }
  if(G.level === 6){
    // J / K 左右脚
    if(k === 'j'){ e.preventDefault(); l6Press('L'); }
    else if(k === 'k'){ e.preventDefault(); l6Press('R'); }
    else if(k === 'r' && L6.done) startGame(6);
    return;
  }
  if(G.level === 5){
    // A / D 左右手，J / K 左右脚
    if(k === 'a'){ e.preventDefault(); l5Press('HL'); }
    else if(k === 'd'){ e.preventDefault(); l5Press('HR'); }
    else if(k === 'j'){ e.preventDefault(); l5Press('FL'); }
    else if(k === 'k'){ e.preventDefault(); l5Press('FR'); }
    else if(k === 'r' && L5.done) startGame(5);
    return;
  }
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
  if(G.level === 10){
    if(k === 'a') l10Up('HL');
    else if(k === 'd') l10Up('HR');
    else if(k === 'j') l10Up('FL');
    else if(k === 'k') l10Up('FR');
    return;
  }
  if(G.level === 7){
    if(k === 'j' || k === 'k') l7Up();
    return;
  }
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
    if(G.level === 10) l10Down(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 8) l8Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 7) l7Down();
    else if(G.level === 5) l5Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 4) l4PadDown();
    else if(G.level === 3) l3HandDown(side);
    else if(G.level === 2) l2PadDown(side);
    else if(G.level === 1) pressFoot(side);
  }, { passive: false });   // 只监听 pointer 事件，避免触摸时重复触发
  node.addEventListener('pointerup', ()=>{
    if(G.level === 10) l10Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 7) l7Up();
    else if(G.level === 4) l4PadUp();
    else if(G.level === 3) l3HandUp(side);
    else if(G.level === 2) l2PadUp(side);
  });
  node.addEventListener('pointercancel', ()=>{
    if(G.level === 10) l10Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 7) l7Up();
    else if(G.level === 4) l4PadUp();
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
    if(G.level === 10) l10Down(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 8) l8Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 7) l7Down();
    else if(G.level === 6) l6Press(side);
    else if(G.level === 5) l5Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 4) l4FootTap(side);
    else if(G.level === 3) l3FootTap(side);
  }, { passive: false });
  node.addEventListener('pointerup', ()=>{
    if(G.level === 10) l10Up(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 7) l7Up();
  });
  node.addEventListener('pointercancel', ()=>{
    if(G.level === 10) l10Up(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 7) l7Up();
  });
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

// 第九关：在圆形手势区按住画圈（顺时针 / 逆时针）
(function(){
  const zone = document.getElementById('l9Zone');
  if(!zone) return;
  zone.addEventListener('pointerdown', e=>{
    if(G.level !== 9 || !L9.active || L9.done) return;
    try{ zone.setPointerCapture(e.pointerId); }catch(_){}
    l9Down(e);
  }, { passive: false });
  zone.addEventListener('pointermove', e=>{
    if(G.level !== 9) return;
    l9Move(e);
  }, { passive: false });
  zone.addEventListener('pointerup', e=>l9Up(e));
  zone.addEventListener('pointercancel', e=>l9Up(e));
  zone.addEventListener('contextmenu', e=>e.preventDefault());
})();

// 主页面 / 关卡列表按钮
el.homeBtn.addEventListener('click', ()=>showLevels());
el.backHomeBtn.addEventListener('click', ()=>showHome());
el.lv1.addEventListener('click', ()=>startGame(1));
el.lv2.addEventListener('click', ()=>startGame(2));
el.lv3.addEventListener('click', ()=>startGame(3));
el.lv4.addEventListener('click', ()=>startGame(4));
el.lv5.addEventListener('click', ()=>startGame(5));
el.lv6.addEventListener('click', ()=>startGame(6));
el.lv7.addEventListener('click', ()=>startGame(7));
el.lv8.addEventListener('click', ()=>startGame(8));
el.lv9.addEventListener('click', ()=>startGame(9));
el.lv10.addEventListener('click', ()=>startGame(10));
el.ovBtn.addEventListener('click', ()=>startGame(G.level || 1));
el.ovHomeBtn.addEventListener('click', ()=>showHome());
el.homeChip.addEventListener('click', ()=>showHome());

function startGame(level){
  if(!G.ready) return;      // 素材还没加载完
  const lv = Math.max(1, Math.min(10, Math.round(level || 1)));
  G.level = lv;
  G.screen = 'game';
  el.overlay.classList.remove('show');
  document.body.classList.add('ingame');
  if(lv === 10) startLevel10();
  else if(lv === 9) startLevel9();
  else if(lv === 8) startLevel8();
  else if(lv === 7) startLevel7();
  else if(lv === 6) startLevel6();
  else if(lv === 5) startLevel5();
  else if(lv === 4) startLevel4();
  else if(lv === 3) startLevel3();
  else if(lv === 2) startLevel2();
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
