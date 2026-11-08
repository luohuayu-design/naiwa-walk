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
  bus  : { url: 'assets/bus.glb', length: 6.0, gapStart: 7.0, winGap: 2.7, loseGap: 14.0, speed: 0.68, flip: true },
  cam  : { leadX: 3.2, y: 3.1, z: 10.5, fov: 45, follow: 4.5 },
  fall : { down: 0.95, up: 0.75 },
  frog : { head: 0xfff08a, belly: 0xffd93d, yaw: 1.35, height: 1.45 },
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

function resetGame(){
  G.started = true; G.over = false; G.state = 'idle';
  G.x = 0; G.stepFrom = 0; G.stepTo = 0; G.stepT = 1; G.stepSide = null;
  G.hasStepped = false; G.lastSide = null; G.lastClickAt = 0;
  G.fallKind = null; G.fallT = 0; G.upT = 0;
  G.steps = 0; G.falls = 0; G.perfects = 0; G.tickCount = 0;
  G.busX = CONFIG.bus.gapStart; G.busSpeed = CONFIG.bus.speed;
  G.camX = CONFIG.cam.leadX;
  G.camZ = CONFIG.cam.z;
  G.beatAt = performance.now() + BEAT_MS;

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
  Sfx.init();
  updateHUD();
}

function showOverlay(title, desc, btnText){
  el.ovTitle.innerHTML = title;
  el.ovDesc.innerHTML = desc;
  el.ovList.style.display = 'none';
  el.ovBtn.textContent = btnText;
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
// 每帧更新
// ============================================================
let lastT = performance.now();

function update(dt, now){
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
  if(k === 'arrowleft' || k === 'a'){ e.preventDefault(); pressFoot('L'); }
  else if(k === 'arrowright' || k === 'd'){ e.preventDefault(); pressFoot('R'); }
  else if(k === 'r' && G.over){ startGame(); }
});

for(const [id, side] of [['btnL', 'L'], ['btnR', 'R']]){
  const node = document.getElementById(id);
  const fire = e=>{ e.preventDefault(); pressFoot(side); };
  node.addEventListener('pointerdown', fire, { passive: false });   // 只监听 pointer 事件，避免触摸时重复触发
  node.addEventListener('contextmenu', e=>e.preventDefault());
}

el.ovBtn.addEventListener('click', ()=>startGame());

function startGame(){
  if(!G.ready) return;      // 素材还没加载完
  el.overlay.classList.remove('show');
  resetGame();
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
    frame();

  }catch(err){
    console.error('加载失败：', err);
    el.loading.textContent = '加载失败：' + err.message;
  }
}

boot();
