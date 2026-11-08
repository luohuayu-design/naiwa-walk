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
  // 第十一关：按路灯（灯灭前按对应手脚）
  lvl11 : {
    x: 2.0, rounds: 10,
    win0: 1.30, win1: 0.78, gap: 0.55,
    busX: 14.5,
  },
  // 第十二关：顶气球
  lvl12 : {
    x: 2.0, hits: 10,
    g: 3.2, kick: 2.7, startY: 1.30,
    busX: 13.5,
  },
  // 第十三关：跨栏（自动小跑，栏前按脚跳）
  lvl13 : {
    x: 1.4, gap: 1.55, hurdles: 8,
    speed: 1.75, jumpT: 0.38, jumpH: 0.62, missHold: 0.90,
    busX: 18.5,
  },
  // 第十四关：推购物车（绿区按脚，左右轮流）
  lvl14 : {
    x: 2.0, pushes: 8,
    cycle: 0.95, winW: 0.42, step: 0.45, missHold: 0.70,
    cartDX: 1.15, busX: 14.8,
  },
  // 第十五关：走独木桥（按住手平衡 8 秒）
  lvl15 : {
    x: 2.0, time: 8.0, push: 1.20, limit: 1.0,
    busX: 12.0,
  },
  // 第十六关：过红绿灯（绿灯走、黄灯准备、红灯不许动）
  lvl16 : {
    x: 1.9, steps: 8, stepLen: 0.58, hopT: 0.26,
    green: 1.45, yellow: 0.40, red: 1.05,
    lightX: 7.9,
    busX: 16.0,
  },
  // 第十七关：踩石头过河（左右脚选择对应方向的石头）
  lvl17 : {
    x: 1.9, stones: 9, gap: 0.95,
    jumpT: 0.32, jumpH: 0.40,
    zSide: 0.62, busX: 17.0,
  },
  // 第十八关：接泡泡（泡泡飘到面前时按对应侧的手）
  lvl18 : {
    x: 2.0, bubbles: 10,
    spawnDX: 4.4, speed0: 0.85, speed1: 1.35,
    zSide: 0.62, reach: 1.60,
    busX: 15.5,
  },
  // 第十九关：投篮（按住脚蓄力，松手卡进绿区）
  lvl19 : {
    x: 2.2, shots: 5, hoopX: 5.8, hoopY: 2.30,
    chargeUp: 0.95, chargeDown: 0.95,
    zones: [
      [0.58, 0.86], [0.54, 0.82], [0.50, 0.78], [0.46, 0.74], [0.42, 0.70],
    ],
    busX: 16.5,
  },
  // 第二十关：毕业大挑战（单按 / 同时按 / 两连按，共 12 轮）
  lvl20 : {
    x: 2.0, rounds: 12,
    win0: 1.25, win1: 0.80, gap: 0.55, pairSync: 0.25,
    busX: 18.0,
  },
  // 第二十一关：躲滚球（跳过滚过来的球，共 8 个）
  lvl21 : {
    x: 2.0, balls: 8, speed0: 2.5, speed1: 3.3,
    spawnX: 8.4, jumpT: 0.55, jumpH: 0.55, gap: 0.55,
    busX: 16.0,
  },
  // 第二十二关：放风筝（双手把风筝稳在绿框里 12 秒）
  lvl22 : {
    x: 2.0, time: 12.0, center: 5.1, drift: 1.35, push: 1.9, zone: 0.52,
    busX: 15.0,
  },
  // 第二十三关：过闸机（灯亮哪边，就按哪边的脚，共 8 道）
  lvl23 : {
    x: 2.0, gates: 8, gap: 1.15, stepT: 0.40, busX: 17.0,
  },
  // 第二十四关：冲刺赛跑（左右脚交替猛踩，20 步冲线）
  lvl24 : {
    x: 1.6, steps: 20, stepLen: 0.50, hopT: 0.16, stumble: 0.40,
    busX: 18.0,
  },
  // 第二十五关：摆毕业照（同时按住指定部位，保持 1.25 秒，共 6 个姿势）
  lvl25 : {
    x: 2.0, poses: 6, hold: 1.25, gap: 0.65, busX: 16.0,
  },
  // 第二十六关：打灯笼夜行（双手举灯，左右脚交替走 10 步）
  lvl26 : {
    x: 2.0, steps: 10, stepLen: 0.55, hopT: 0.26, busX: 16.0,
  },
  // 第二十七关：跳房子（黄格左脚、蓝格右脚、绿格双脚同时）
  lvl27 : {
    x: 2.0, squares: 10, gap: 0.62, hopT: 0.34, sync: 0.26, busX: 16.5,
  },
  // 第二十八关：敲鼓节奏（光标到绿区，按对应手敲一下，共 12 拍）
  lvl28 : {
    x: 2.0, beats: 12, cycle0: 1.25, cycle1: 0.90,
    winW: 0.30, missHold: 0.45, busX: 15.0,
  },
  // 第二十九关：跳绳（绳子落到脚边时按脚跳，连续 15 次）
  lvl29 : {
    x: 2.0, jumps: 15, cycle0: 1.35, cycle1: 0.75,
    window: 0.22, jumpT: 0.30, busX: 16.0,
  },
  // 第三十关：走钢丝（双手保持平衡，在高空走完 12 秒）
  lvl30 : {
    x: 2.0, time: 12.0, push: 1.15, limit: 1.0, walk: 4.6,
    ropeY: 1.18, busX: 16.0,
  },
  // 第三十一关：按灯开门（随机亮起部位灯，按对应手脚，共 12 盏）
  lvl31 : {
    x: 2.0, cues: 12, busX: 16.0,
  },
  // 第三十二关：抓萤火虫（高处黄灯举手、低处绿灯跳脚，共 10 只）
  lvl32 : {
    x: 2.0, flies: 10, life: 2.1, busX: 16.5,
  },
  // 第三十三关：照镜子（镜子里的动作要按相反的手脚，共 8 轮）
  lvl33 : {
    x: 2.0, rounds: 8, busX: 16.0,
  },
  // 第三十四关：记动作（先看组合，再凭记忆按住，共 8 轮）
  lvl34 : {
    x: 2.0, rounds: 8, show: 0.90, gap: 0.45, busX: 16.0,
  },
  // 第三十五关：放烟花（按住双手蓄力，松手卡进绿区，共 5 发）
  lvl35 : {
    x: 2.0, fireworks: 5, charge: 1.35, z0: 0.52, z1: 0.80,
    gap: 0.60, busX: 16.0,
  },
  // 第三十六关：跳早操（四拍一轮，跟着节拍按，越来越快）
  lvl36 : {
    x: 2.0, beats: 24, beat0: 0.95, beat1: 0.62, busX: 16.0,
  },
  // 第三十七关：踩高跷（用双脚压平衡，撑过 10 秒）
  lvl37 : {
    x: 2.0, time: 10.0, push: 1.50, limit: 1.0, walk: 3.6,
    stiltY: 0.55, busX: 16.0,
  },
  // 第三十八关：捡豆子（四方位取豆，共 10 颗）
  lvl38 : {
    x: 2.0, beans: 10, life: 1.9, busX: 16.5,
  },
  // 第三十九关：拍皮球（左右手交替，在绿带里拍到，共 12 拍）
  lvl39 : {
    x: 2.0, bounces: 12, band0: 0.10, band1: 0.62,
    speed0: 2.10, speed1: 3.10, busX: 16.0,
  },
  // 第四十关：毕业典礼（16 个限时指令，完成后放礼花）
  lvl40 : {
    x: 2.0, cues: 16, t0: 1.90, t1: 1.05, busX: 16.0,
  },
  // 第四十一关：荡秋千（最低点按脚加力，共 8 次）
  lvl41 : {
    x: 2.0, pushes: 8, energy: 0.62, pivotY: 3.20, len: 1.90, busX: 16.0,
  },
  // 第四十二关：顶杯子（按住左手顶稳，交替脚走 10 步）
  lvl42 : {
    x: 2.0, steps: 10, stepLen: 0.55, hopT: 0.26, busX: 16.0,
  },
  // 第四十三关：闪灯记忆（动作只闪一下，凭记忆按对，共 16 个）
  lvl43 : {
    x: 2.0, cues: 16, show: 0.42, t0: 1.30, t1: 0.95, busX: 16.0,
  },
  // 第四十四关：搬砖（每单按次数搬砖，左右脚交替，共 8 单）
  lvl44 : {
    x: 2.0, rounds: 8, busX: 16.0,
  },
  // 第四十五关：接力赛（双手按住 → 交替脚 → 交替手 → 双脚齐跳）
  lvl45 : {
    x: 2.0, holdTime: 2.0, steps: 8, claps: 8, jumps: 4, busX: 16.0,
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

const hemi = new THREE.HemisphereLight(0xdff1ff, 0x8a7460, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.position.set(6, 14, 9);
scene.add(sun);

// 夜景模式（第二十六关）：把环境光和阳光压暗，灯笼与路灯就成了主光
function setNight(on){
  hemi.intensity = on ? 0.18 : 1.0;
  sun.intensity = on ? 0.11 : 1.15;
}

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
  lv11     : document.getElementById('lv11'),
  lv12     : document.getElementById('lv12'),
  lv13     : document.getElementById('lv13'),
  lv14     : document.getElementById('lv14'),
  lv15     : document.getElementById('lv15'),
  lv16     : document.getElementById('lv16'),
  lv17     : document.getElementById('lv17'),
  lv18     : document.getElementById('lv18'),
  lv19     : document.getElementById('lv19'),
  lv20     : document.getElementById('lv20'),
  lv21     : document.getElementById('lv21'),
  lv22     : document.getElementById('lv22'),
  lv23     : document.getElementById('lv23'),
  lv24     : document.getElementById('lv24'),
  lv25     : document.getElementById('lv25'),
  lv26     : document.getElementById('lv26'),
  lv27     : document.getElementById('lv27'),
  lv28     : document.getElementById('lv28'),
  lv29     : document.getElementById('lv29'),
  lv30     : document.getElementById('lv30'),
  lv31     : document.getElementById('lv31'),
  lv32     : document.getElementById('lv32'),
  lv33     : document.getElementById('lv33'),
  lv34     : document.getElementById('lv34'),
  lv35     : document.getElementById('lv35'),
  lv36     : document.getElementById('lv36'),
  lv37     : document.getElementById('lv37'),
  lv38     : document.getElementById('lv38'),
  lv39     : document.getElementById('lv39'),
  lv40     : document.getElementById('lv40'),
  lv41     : document.getElementById('lv41'),
  lv42     : document.getElementById('lv42'),
  lv43     : document.getElementById('lv43'),
  lv44     : document.getElementById('lv44'),
  lv45     : document.getElementById('lv45'),
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

// ============================================================
// 第十一关：按路灯
//
// 四块踏板对应两只手两只脚，路灯随机亮起一块。
// 灯灭之前按下对应部位；按错 / 灯灭了 → 记一次失误。
// 按对 10 次 = 通关，越往后灯亮的时间越短。
// ============================================================
const L11 = {
  active: false, done: false, phase: 'show', phaseT: 0,
  round: 0, misses: 0, elapsed: 0, win: 1.3, code: '', last: '',
  props: null, pads: {}, bulb: null, flash: {}, hud: '', task: '', seqKey: '',
};
window.__l11 = L11;

function l11SetTask(t){
  if(!t || L11.task === t) return;
  L11.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL11HUD(){
  const key = L11.elapsed.toFixed(1) + '/' + L11.round + '/' + L11.misses;
  if(key === L11.hud) return;
  L11.hud = key;
  if(el.l2Time) el.l2Time.textContent = L11.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L11.round + '/' + CONFIG.lvl11.rounds;
  if(el.l2Miss) el.l2Miss.textContent = L11.misses;
}

function l11RenderSeq(){
  if(!el.l5Seq) return;
  const key = L11.phase + '/' + L11.code + '/' + L11.round;
  if(key === L11.seqKey) return;
  L11.seqKey = key;
  if(L11.phase === 'show' && L11.code){
    el.l5Seq.innerHTML = '<span class="l5chip ' + (L11.code[0] === 'H' ? 'hand' : 'foot') + ' now">' + L5_LIMB[L11.code] + '</span>';
  }else{
    el.l5Seq.innerHTML = '<span class="l5chip now">下一个…</span>';
  }
}

function l11Flash(code){
  L11.flash[code] = 0.45;
  const pad = L11.pads[code];
  if(pad) pad.material.emissiveIntensity = 1.0;
}

function buildL11Props(){
  if(L11.props) return L11.props;
  const C = CONFIG.lvl11;
  const g = new THREE.Group();
  const offs = { HL: -1.30, FL: -0.45, HR: 0.45, FR: 1.30 };
  for(const code in offs){
    const mat = new THREE.MeshLambertMaterial({ color: L8_COLORS[code], emissive: L8_COLORS[code], emissiveIntensity: 0.10 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.52), mat);
    pad.position.set(C.x + offs[code], 0.05, -0.80);
    g.add(pad);
    L11.pads[code] = pad;
    L11.flash[code] = 0;
  }
  // 路边的小路灯，亮灯时灯泡一起闪
  addBox(0.10, 2.45, 0.10, 0x3c4a5e, C.x + 1.55, 1.22, -1.1, g);
  addBox(0.34, 0.10, 0.34, 0x2c3646, C.x + 1.55, 2.46, -1.1, g);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.20, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3bb })
  );
  bulb.position.set(C.x + 1.55, 2.58, -1.1);
  g.add(bulb);
  L11.bulb = bulb;
  g.visible = false;
  scene.add(g);
  L11.props = g;
  return g;
}

function l11Pick(){
  const C = CONFIG.lvl11;
  const codes = ['HL', 'HR', 'FL', 'FR'];
  let code = codes[Math.floor(Math.random() * codes.length)];
  if(code === L11.last) code = codes[(codes.indexOf(code) + 1) % codes.length];
  L11.code = code;
  L11.last = code;
  L11.phase = 'show';
  L11.phaseT = 0;
  L11.win = C.win0 + (C.win1 - C.win0) * (L11.round / Math.max(1, C.rounds - 1));
  l11Flash(code);
  l11RenderSeq();
  l11SetTask('按 ' + L5_LIMB[code] + '！');
}

function startLevel11(){
  const C = CONFIG.lvl11;
  resetAllLevels();
  L11.active = true; L11.done = false;
  L11.phase = 'show'; L11.phaseT = 0;
  L11.round = 0; L11.misses = 0; L11.elapsed = 0;
  L11.code = ''; L11.last = '';
  L11.hud = ''; L11.task = ''; L11.seqKey = '';
  for(const code in L11.flash) L11.flash[code] = 0;
  buildL11Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level11');
  setSky(0xd6ecff);
  setLabels('用时', '灯数');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.75; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  l11Pick();
  updateL11HUD();
  Sfx.init();
}

function resetL11Scene(){
  document.body.classList.remove('level11');
  L11.active = false; L11.done = false;
  if(L11.props) L11.props.visible = false;
  for(const code in L11.flash){
    L11.flash[code] = 0;
    if(L11.pads[code]) L11.pads[code].material.emissiveIntensity = 0.10;
  }
  L11.hud = ''; L11.task = ''; L11.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
}

function l11Press(code){
  if(G.level !== 11 || !L11.active || L11.done) return;
  if(L11.phase !== 'show') return;
  if(code === L11.code){
    L11.round++;
    Sfx.perfect();
    l11Flash(code);
    updateL11HUD();
    if(L11.round >= CONFIG.lvl11.rounds){ l11Win(); return; }
    L11.phase = 'gap'; L11.phaseT = 0;
    l11RenderSeq();
    l11SetTask('漂亮！等下一盏灯');
  }else{
    l11Miss('按错了');
  }
}

function l11Miss(reason){
  if(L11.done) return;
  L11.misses++;
  L11.phase = 'gap'; L11.phaseT = 0;
  Sfx.thud();
  updateL11HUD();
  l11RenderSeq();
  l11SetTask(reason + '，看下一盏灯');
}

function l11Win(){
  if(L11.done) return;
  L11.done = true; L11.active = false;
  L11.phase = 'win'; L11.phaseT = 0;
  Sfx.win();
  l11SetTask('🎉 10 盏灯全按亮了！');
  const used = L11.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🔔 路灯全亮啦！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L11.misses + '</b> 次', '再按一次');
  }, 1500);
}

function l11Pose(dt, now){
  const C = CONFIG.lvl11;
  baseTargets();
  const t = now * 0.002;
  TGT.spine.x = Math.sin(t) * 0.03;
  TGT.head.z = Math.sin(t * 1.4) * 0.10;
  TGT.armL.z = 0.16 + Math.sin(t) * 0.10;
  TGT.armR.z = -0.16 - Math.sin(t) * 0.10;
  TGT.head.x = -0.05;
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l11Camera(dt){
  camFollow(dt, CONFIG.lvl11.x + 0.75, 2.05, 1.30);
}

function updateLevel11(dt, now){
  const C = CONFIG.lvl11;
  if(L11.active && !L11.done) L11.elapsed += dt;
  L11.phaseT += dt;

  for(const code in L11.pads){
    const f = Math.max(0, (L11.flash[code] || 0) - dt);
    L11.flash[code] = f;
    L11.pads[code].material.emissiveIntensity = f > 0 ? 1.0 : 0.10;
  }
  if(L11.bulb) L11.bulb.material.color.setHex(0xfff3bb);

  if(L11.phase === 'show' && L11.active && !L11.done){
    L11.win -= dt;
    if(el.l2ProgFill) el.l2ProgFill.style.width = Math.max(0, L11.win / C.win0 * 100).toFixed(1) + '%';
    if(L11.win <= 0) l11Miss('灯灭了');
  }else if(L11.phase === 'gap' && L11.phaseT >= C.gap){
    l11Pick();
  }
  updateL11HUD();
  l11Pose(dt, now);
  l11Camera(dt);
}

// ============================================================
// 第十二关：顶气球
//
// 一只红气球从头顶落下来，在它落到脚边之前用脚把它顶回去。
// 顶太高够不着、放着不管落地 → 记一次失误。
// 连续顶 10 次 = 通关。
// ============================================================
const L12 = {
  active: false, done: false, phase: 'play', phaseT: 0,
  y: 1.3, vy: 0, hits: 0, misses: 0, elapsed: 0, flash: 0,
  props: null, ball: null, hud: '', task: '',
};
window.__l12 = L12;

function l12SetTask(t){
  if(!t || L12.task === t) return;
  L12.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL12HUD(){
  const key = L12.elapsed.toFixed(1) + '/' + L12.hits + '/' + L12.misses;
  if(key === L12.hud) return;
  L12.hud = key;
  if(el.l2Time) el.l2Time.textContent = L12.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L12.hits + '/' + CONFIG.lvl12.hits;
  if(el.l2Miss) el.l2Miss.textContent = L12.misses;
}

function buildL12Props(){
  if(L12.props) return L12.props;
  const C = CONFIG.lvl12;
  const g = new THREE.Group();
  const ball = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 14),
    new THREE.MeshLambertMaterial({ color: 0xe8505a })
  );
  body.position.y = 0.24;
  ball.add(body);
  const knot = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xffd93d })
  );
  ball.add(knot);
  const str = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.40, 6),
    new THREE.MeshLambertMaterial({ color: 0xf0ead8 })
  );
  str.position.y = -0.22;
  ball.add(str);
  ball.position.set(C.x + 0.36, L12.y, 0.55);
  g.add(ball);
  L12.ball = ball;

  // 路边的路灯，给个小背景
  addBox(0.10, 2.3, 0.10, 0x3c4a5e, C.x + 1.6, 1.15, -1.1, g);
  addBox(0.30, 0.08, 0.30, 0x2c3646, C.x + 1.6, 2.32, -1.1, g);
  g.visible = false;
  scene.add(g);
  L12.props = g;
  return g;
}

function startLevel12(){
  const C = CONFIG.lvl12;
  resetAllLevels();
  L12.active = true; L12.done = false;
  L12.phase = 'play'; L12.phaseT = 0;
  L12.y = C.startY; L12.vy = 0;
  L12.hits = 0; L12.misses = 0; L12.elapsed = 0; L12.flash = 0;
  L12.hud = ''; L12.task = '';
  buildL12Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level12');
  setSky(0xbfe7ff);
  setLabels('用时', '弹起');
  setBtnText(el.footL, '↑', '左脚');
  setBtnText(el.footR, '↑', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.6; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  l12SetTask('气球落到脚边时，按任意一只脚把它顶起来');
  updateL12HUD();
  Sfx.init();
}

function resetL12Scene(){
  document.body.classList.remove('level12');
  L12.active = false; L12.done = false;
  if(L12.props) L12.props.visible = false;
  L12.hud = ''; L12.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
}

function l12Miss(reason){
  if(L12.done) return;
  L12.misses++;
  L12.y = 1.35; L12.vy = 0;
  Sfx.thud();
  updateL12HUD();
  l12SetTask(reason + '，重新来');
}

function l12Kick(side){
  if(G.level !== 12 || !L12.active || L12.done) return;
  const C = CONFIG.lvl12;
  if(L12.y > 2.05){ l12Miss('顶太高了，等它落下来'); return; }
  if(L12.y < 0.30){ l12Miss('气球落地了'); return; }
  L12.vy = C.kick;
  L12.hits++;
  L12.flash = 0.35;
  Sfx.step();
  Sfx.tick(true);
  updateL12HUD();
  if(L12.hits >= C.hits){ l12Win(); return; }
  l12SetTask('好球！继续');
}

function l12Win(){
  if(L12.done) return;
  L12.done = true; L12.active = false;
  L12.phase = 'win'; L12.phaseT = 0;
  Sfx.win();
  l12SetTask('🎉 气球一次都没落地！');
  const used = L12.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎈 顶住啦！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L12.misses + '</b> 次', '再顶一次');
  }, 1500);
}

function l12Pose(dt, now){
  const C = CONFIG.lvl12;
  baseTargets();
  const bob = Math.sin(now * 0.0026);
  TGT.spine.x = -0.06 + bob * 0.02;
  TGT.head.x = -0.22 + bob * 0.03;
  TGT.armL.z = 0.55 + bob * 0.12;
  TGT.armR.z = -0.55 - bob * 0.12;
  TGT.legL.z = 0.05;
  TGT.legR.z = -0.05;
  if(L12.flash > 0){
    const s = Math.sin(Math.PI * Math.min(1, L12.flash / 0.35));
    TGT.legL.z = -0.45 * s;
    TGT.legR.z = -0.45 * s;
    TGT.spine.x = 0.10 * s;
  }
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l12Camera(dt){
  camFollow(dt, CONFIG.lvl12.x + 0.55, 2.0, 1.45);
}

function updateLevel12(dt, now){
  const C = CONFIG.lvl12;
  L12.phaseT += dt;
  if(L12.active && !L12.done){
    L12.elapsed += dt;
    L12.y += L12.vy * dt;
    L12.vy -= C.g * dt;
    if(L12.y > 2.75){ L12.y = 2.75; L12.vy = Math.min(0, L12.vy); }
    if(L12.y < 0.34){
      L12.misses++;
      L12.y = 1.35; L12.vy = 0;
      Sfx.thud();
      updateL12HUD();
      l12SetTask('气球落地了，重新来');
    }
  }
  L12.flash = Math.max(0, L12.flash - dt);
  if(L12.ball){
    L12.ball.position.set(C.x + 0.36 + Math.sin(now * 0.0032) * 0.18, L12.y, 0.55);
    L12.ball.rotation.z = Math.sin(now * 0.002) * 0.25;
  }
  updateL12HUD();
  l12Pose(dt, now);
  l12Camera(dt);
}

// ============================================================
// 第十三关：跨栏
//
// 奶蛙在马路上一路小跑，前面立着一排小栏架。
// 跑到栏架前面按脚跳过去；没跳就撞上，退回一点重来。
// 跨过 8 个栏架 = 通关。
// ============================================================
const L13 = {
  active: false, done: false, phase: 'run', phaseT: 0,
  x: 1.4, i: 0, misses: 0, elapsed: 0,
  jumpT: 1, jumpY: 0, props: null, hurdles: [], hud: '', task: '',
};
window.__l13 = L13;

function l13SetTask(t){
  if(!t || L13.task === t) return;
  L13.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL13HUD(){
  const key = L13.elapsed.toFixed(1) + '/' + L13.i + '/' + L13.misses;
  if(key === L13.hud) return;
  L13.hud = key;
  if(el.l2Time) el.l2Time.textContent = L13.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L13.i + '/' + CONFIG.lvl13.hurdles;
  if(el.l2Miss) el.l2Miss.textContent = L13.misses;
}

function buildL13Props(){
  if(L13.props) return L13.props;
  const C = CONFIG.lvl13;
  const g = new THREE.Group();
  L13.hurdles = [];
  for(let k = 0; k < C.hurdles; k++){
    const hx = C.x + (k + 1) * C.gap;
    const h = new THREE.Group();
    addBox(0.10, 0.58, 0.10, 0xe8eef5, -0.34, 0.29, 0, h);
    addBox(0.10, 0.58, 0.10, 0xe8eef5, 0.34, 0.29, 0, h);
    addBox(0.88, 0.12, 0.10, 0xff6b6b, 0, 0.60, 0, h);
    addBox(0.88, 0.05, 0.12, 0xffffff, 0, 0.60, 0, h);
    h.position.set(hx, 0, 0);
    g.add(h);
    L13.hurdles.push(h);
  }
  // 终点小旗
  addBox(0.08, 1.1, 0.08, 0x3c4a5e, C.x + (C.hurdles + 1) * C.gap, 0.55, 0, g);
  addBox(0.46, 0.30, 0.05, 0x3ddc84, C.x + (C.hurdles + 1) * C.gap + 0.24, 0.92, 0, g);
  g.visible = false;
  scene.add(g);
  L13.props = g;
  return g;
}

function startLevel13(){
  const C = CONFIG.lvl13;
  resetAllLevels();
  L13.active = true; L13.done = false;
  L13.phase = 'run'; L13.phaseT = 0;
  L13.x = C.x; L13.i = 0; L13.misses = 0; L13.elapsed = 0;
  L13.jumpT = 1; L13.jumpY = 0;
  L13.hud = ''; L13.task = '';
  buildL13Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level13');
  setSky(0xbfe7ff);
  setLabels('用时', '栏数');
  setBtnText(el.footL, '↑', '左脚');
  setBtnText(el.footR, '↑', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.4; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  l13SetTask('跑到栏架前按脚跳过去');
  updateL13HUD();
  Sfx.init();
}

function resetL13Scene(){
  document.body.classList.remove('level13');
  L13.active = false; L13.done = false;
  if(L13.props) L13.props.visible = false;
  L13.hud = ''; L13.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
}

function l13Jump(){
  if(G.level !== 13 || !L13.active || L13.done) return;
  if(L13.phase !== 'run' || L13.jumpT < 1) return;
  L13.jumpT = 0;
  Sfx.step();
}

function l13Miss(){
  if(L13.done) return;
  L13.misses++;
  L13.phase = 'miss'; L13.phaseT = 0;
  L13.jumpT = 1; L13.jumpY = 0;
  L13.x = CONFIG.lvl13.x + L13.i * CONFIG.lvl13.gap + 0.45;
  Sfx.thud();
  updateL13HUD();
  l13SetTask('撞到栏架了，退回来再跳');
}

function l13Win(){
  if(L13.done) return;
  L13.done = true; L13.active = false;
  L13.phase = 'win'; L13.phaseT = 0;
  Sfx.win();
  l13SetTask('🎉 8 个栏架全跨过去了！');
  const used = L13.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏃 跨栏成功！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L13.misses + '</b> 次', '再跑一次');
  }, 1500);
}

function l13Pose(dt, now){
  const C = CONFIG.lvl13;
  baseTargets();
  const run = Math.sin(now * 0.0055);
  TGT.spine.x = 0.10;
  TGT.head.x = 0.05;
  TGT.armL.z = 0.55 * run;
  TGT.armR.z = -0.55 * run;
  TGT.legL.z = 0.48 * run;
  TGT.legR.z = -0.48 * run;
  if(L13.jumpT < 1){
    const s = Math.sin(Math.PI * L13.jumpT);
    L13.jumpY = s * C.jumpH;
    TGT.legL.z = -0.42 * s;
    TGT.legR.z = -0.42 * s;
    TGT.armL.z = 0.75 * s;
    TGT.armR.z = -0.75 * s;
    TGT.spine.x = 0.06;
  }else{
    L13.jumpY = 0;
  }
  if(L13.phase === 'miss'){
    const k = Math.min(1, L13.phaseT / C.missHold);
    const s = Math.sin(k * Math.PI);
    BTGT.rz = 0.40 * s;
    TGT.head.z = -0.18 * s;
  }
  if(frog) frog.root.position.set(L13.x, L13.jumpY, 0);
  applyPose(dt);
}

function l13Camera(dt){
  camFollow(dt, L13.x + 1.35, 2.55, 1.45);
}

function updateLevel13(dt, now){
  const C = CONFIG.lvl13;
  if(L13.active && !L13.done) L13.elapsed += dt;
  L13.phaseT += dt;

  if(L13.active && !L13.done){
    if(L13.phase === 'run'){
      if(L13.jumpT < 1) L13.jumpT = Math.min(1, L13.jumpT + dt / C.jumpT);
      L13.x += C.speed * dt;
      const hx = C.x + (L13.i + 1) * C.gap;
      if(L13.x >= hx - 0.06){
        const air = L13.jumpT < 1 && Math.sin(Math.PI * L13.jumpT) > 0.30;
        if(air){
          L13.i++;
          Sfx.perfect();
          updateL13HUD();
          if(L13.i >= C.hurdles){ l13Win(); }
          else l13SetTask('第 ' + (L13.i + 1) + ' 个栏架');
        }else{
          l13Miss();
        }
      }
    }else if(L13.phase === 'miss' && L13.phaseT >= C.missHold){
      L13.phase = 'run'; L13.phaseT = 0;
      L13.jumpT = 1;
    }
  }
  updateL13HUD();
  l13Pose(dt, now);
  l13Camera(dt);
}

// ============================================================
// 第十四关：推购物车
//
// 奶蛙帮超市把购物车推回去。光标在绿区时按脚推一下，
// 而且要左右脚轮流推；错过绿区 / 推错脚 → 记一次失误。
// 推满 8 次 = 通关。
// ============================================================
const L14 = {
  active: false, done: false, phase: 'push', phaseT: 0,
  t: 0, pushed: 0, misses: 0, elapsed: 0,
  props: null, cart: null, hud: '', task: '', bar: {},
};
window.__l14 = L14;

function l14SetTask(t){
  if(!t || L14.task === t) return;
  L14.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL14HUD(){
  const key = L14.elapsed.toFixed(1) + '/' + L14.pushed + '/' + L14.misses;
  if(key === L14.hud) return;
  L14.hud = key;
  if(el.l2Time) el.l2Time.textContent = L14.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L14.pushed + '/' + CONFIG.lvl14.pushes;
  if(el.l2Miss) el.l2Miss.textContent = L14.misses;
}

function l14UpdateBar(){
  const C = CONFIG.lvl14;
  if(el.l7Zone){
    el.l7Zone.style.display = 'block';
    el.l7Zone.style.left = ((0.5 - C.winW / 2) * 100).toFixed(1) + '%';
    el.l7Zone.style.width = (C.winW * 100).toFixed(1) + '%';
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (Math.min(1, L14.t) * 100).toFixed(1) + '%';
}

function buildL14Props(){
  if(L14.props) return L14.props;
  const C = CONFIG.lvl14;
  const g = new THREE.Group();
  const cart = new THREE.Group();
  const metal = 0xd9e2ea, dark = 0x5b6773;
  addBox(0.94, 0.14, 0.54, metal, 0, 0.30, 0, cart);
  addBox(0.94, 0.40, 0.05, metal, 0, 0.52, -0.24, cart);
  addBox(0.94, 0.40, 0.05, metal, 0, 0.52, 0.24, cart);
  addBox(0.05, 0.40, 0.54, metal, -0.45, 0.52, 0, cart);
  addBox(0.05, 0.40, 0.54, metal, 0.45, 0.52, 0, cart);
  addBox(0.46, 0.06, 0.06, dark, 0.72, 0.70, 0, cart);
  // 车里放一袋红色的东西，让购物车在灰马路上更显眼
  addBox(0.58, 0.26, 0.38, 0xe8505a, 0, 0.50, 0, cart);
  addBox(0.34, 0.14, 0.30, 0xffd93d, 0.10, 0.70, 0, cart);
  for(const wx of [-0.30, 0.30]){
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.07, 14),
      new THREE.MeshLambertMaterial({ color: dark })
    );
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.16, 0.24);
    cart.add(wheel);
  }
  cart.position.set(C.x + C.cartDX, 0, 0);
  cart.scale.set(1.3, 1.3, 1.3);
  g.add(cart);
  L14.cart = cart;
  g.visible = false;
  scene.add(g);
  L14.props = g;
  return g;
}

function startLevel14(){
  const C = CONFIG.lvl14;
  resetAllLevels();
  L14.active = true; L14.done = false;
  L14.phase = 'push'; L14.phaseT = 0;
  L14.t = 0; L14.pushed = 0; L14.misses = 0; L14.elapsed = 0;
  L14.hud = ''; L14.task = '';
  buildL14Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level14');
  setSky(0xbfe7ff);
  setLabels('用时', '推动');
  setBtnText(el.footL, '→', '左脚');
  setBtnText(el.footR, '→', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.9; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l14UpdateBar();
  l14SetTask('光标到绿区时按脚推，左脚右脚轮流');
  updateL14HUD();
  Sfx.init();
}

function resetL14Scene(){
  document.body.classList.remove('level14');
  L14.active = false; L14.done = false;
  if(L14.props) L14.props.visible = false;
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  L14.hud = ''; L14.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
}

function l14Miss(reason){
  if(L14.done) return;
  L14.misses++;
  L14.phase = 'miss'; L14.phaseT = 0;
  L14.t = 0;
  Sfx.thud();
  updateL14HUD();
  l14UpdateBar();
  l14SetTask(reason + '，再来一次');
}

function l14Press(side){
  if(G.level !== 14 || !L14.active || L14.done) return;
  const C = CONFIG.lvl14;
  if(L14.phase !== 'push') return;
  const inWin = Math.abs(L14.t - 0.5) <= C.winW / 2;
  const want = L14.pushed % 2 === 0 ? 'L' : 'R';
  if(!inWin){ l14Miss('没卡进绿区'); return; }
  if(side !== want){ l14Miss('要换另一只脚'); return; }
  L14.pushed++;
  L14.t = 0;
  L14.phase = 'gap'; L14.phaseT = 0;
  Sfx.step();
  Sfx.tick(true);
  updateL14HUD();
  l14UpdateBar();
  if(L14.pushed >= C.pushes){ l14Win(); return; }
  l14SetTask('推一下！再换脚');
}

function l14Win(){
  if(L14.done) return;
  L14.done = true; L14.active = false;
  L14.phase = 'win'; L14.phaseT = 0;
  Sfx.win();
  l14SetTask('🎉 购物车推回超市啦！');
  const used = L14.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🛒 推动成功！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L14.misses + '</b> 次', '再推一次');
  }, 1500);
}

function l14Pose(dt, now){
  const C = CONFIG.lvl14;
  baseTargets();
  const fx = C.x + L14.pushed * C.step;
  const step = Math.sin(now * 0.0045);
  TGT.spine.x = 0.14;
  TGT.head.x = 0.10;
  TGT.armL.z = 0.90 + step * 0.08;
  TGT.armR.z = -0.90 - step * 0.08;
  TGT.legL.z = 0.20 * step;
  TGT.legR.z = -0.20 * step;
  if(L14.phase === 'gap'){
    const k = Math.min(1, L14.phaseT / 0.32);
    const s = Math.sin(k * Math.PI);
    TGT.armL.z += 0.30 * s;
    TGT.armR.z -= 0.30 * s;
    TGT.spine.x += 0.10 * s;
  }
  if(frog) frog.root.position.set(fx, 0, 0);
  if(L14.cart) L14.cart.position.x = fx + C.cartDX;
  applyPose(dt);
}

function l14Camera(dt){
  camFollow(dt, CONFIG.lvl14.x + L14.pushed * CONFIG.lvl14.step + 1.1, 2.2, 1.30);
}

function updateLevel14(dt, now){
  const C = CONFIG.lvl14;
  if(L14.active && !L14.done) L14.elapsed += dt;
  L14.phaseT += dt;

  if(L14.active && !L14.done){
    if(L14.phase === 'push'){
      L14.t += dt / C.cycle;
      if(L14.t >= 1){ l14Miss('没推动'); }
    }else if(L14.phase === 'gap' && L14.phaseT >= 0.32){
      L14.phase = 'push'; L14.phaseT = 0; L14.t = 0;
    }else if(L14.phase === 'miss' && L14.phaseT >= C.missHold){
      L14.phase = 'push'; L14.phaseT = 0; L14.t = 0;
    }
  }
  l14UpdateBar();
  updateL14HUD();
  l14Pose(dt, now);
  l14Camera(dt);
}

// ============================================================
// 第十五关：走独木桥
//
// 奶蛙走过架在水坑上的木板，木板会慢慢左右倾斜。
// 按住左手 / 右手把身体压回来，撑住 8 秒 = 通关。
// 歪太多掉下去 → 记一次失误，重新开始计时。
// ============================================================
const L15 = {
  active: false, done: false, phase: 'walk', phaseT: 0,
  tilt: 0, handL: false, handR: false,
  elapsed: 0, misses: 0, props: null, hud: '', task: '', walked: 0,
};
window.__l15 = L15;

function l15SetTask(t){
  if(!t || L15.task === t) return;
  L15.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL15HUD(){
  const C = CONFIG.lvl15;
  const key = L15.elapsed.toFixed(1) + '/' + L15.misses;
  if(key === L15.hud) return;
  L15.hud = key;
  if(el.l2Time) el.l2Time.textContent = L15.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = Math.max(0, C.time - L15.elapsed).toFixed(1) + 's';
  if(el.l2Miss) el.l2Miss.textContent = L15.misses;
}

function buildL15Props(){
  if(L15.props) return L15.props;
  const C = CONFIG.lvl15;
  const g = new THREE.Group();
  // 水坑
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 0.03, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x5cb4e6, transparent: true, opacity: 0.8 })
  );
  water.position.set(C.x, 0.05, 0);
  g.add(water);
  // 两端的石头河岸
  for(const dx of [-2.3, 2.3]){
    addBox(0.90, 0.34, 0.82, 0x8d979f, C.x + dx, 0.17, 0, g);
    addBox(0.74, 0.26, 0.66, 0xa8b2ba, C.x + dx, 0.47, 0, g);
  }
  // 木板
  addBox(4.4, 0.12, 0.62, 0xc89b63, C.x, 0.56, 0, g);
  addBox(4.42, 0.03, 0.66, 0xdfb27a, C.x, 0.64, 0, g);
  g.visible = false;
  scene.add(g);
  L15.props = g;
  return g;
}

function startLevel15(){
  const C = CONFIG.lvl15;
  resetAllLevels();
  L15.active = true; L15.done = false;
  L15.phase = 'walk'; L15.phaseT = 0;
  L15.tilt = 0; L15.handL = false; L15.handR = false;
  L15.elapsed = 0; L15.misses = 0;
  L15.hud = ''; L15.task = '';
  buildL15Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level15');
  setSky(0xdff0ff);
  setLabels('用时', '剩余');
  setBtnText(el.btnL, '←', '压左');
  setBtnText(el.btnR, '→', '压右');
  resetFrogAt(C.x, 0.64);
  G.camX = C.x + 0.2; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '50%';
  l15SetTask('木板歪的时候，按住相反方向的手');
  updateL15HUD();
  Sfx.init();
}

function resetL15Scene(){
  document.body.classList.remove('level15');
  L15.active = false; L15.done = false;
  L15.handL = false; L15.handR = false;
  if(L15.props) L15.props.visible = false;
  L15.hud = ''; L15.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
}

function l15Hand(side, down){
  if(G.level !== 15 || !L15.active || L15.done) return;
  if(side === 'L') L15.handL = !!down;
  else L15.handR = !!down;
}

function l15Miss(){
  if(L15.done) return;
  L15.misses++;
  L15.phase = 'miss'; L15.phaseT = 0;
  L15.tilt = 0; L15.elapsed = 0;
  L15.handL = false; L15.handR = false;
  Sfx.thud();
  updateL15HUD();
  l15SetTask('掉进水坑了，重新计时');
}

function l15Win(){
  if(L15.done) return;
  L15.done = true; L15.active = false;
  L15.phase = 'win'; L15.phaseT = 0;
  Sfx.win();
  l15SetTask('🎉 稳稳走过独木桥！');
  setTimeout(()=>{
    showOverlay('🌉 走过去啦！',
      '撑住 <b>8.0</b> 秒 · 掉下去 <b>' + L15.misses + '</b> 次', '再走一次');
  }, 1500);
}

function l15Pose(dt, now){
  const C = CONFIG.lvl15;
  baseTargets();
  const sway = Math.sin(now * 0.0032);
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.95 + sway * 0.10;
  TGT.armR.z = -0.95 - sway * 0.10;
  TGT.legL.z = 0.06;
  TGT.legR.z = -0.06;
  BTGT.rz = -L15.tilt * 0.34;
  TGT.head.z = L15.tilt * 0.10;
  if(L15.phase === 'miss'){
    const k = Math.min(1, L15.phaseT / 0.7);
    const s = Math.sin(k * Math.PI);
    BTGT.rz = 0.70 * s;
    TGT.head.z = -0.22 * s;
  }
  if(frog) frog.root.position.set(C.x, 0.64, 0);
  applyPose(dt);
}

function l15Camera(dt){
  camFollow(dt, CONFIG.lvl15.x + 0.2, 2.55, 0.95);
}

function updateLevel15(dt, now){
  const C = CONFIG.lvl15;
  L15.phaseT += dt;
  if(L15.active && !L15.done){
    if(L15.phase === 'walk'){
      L15.elapsed += dt;
      L15.tilt += (Math.sin(now * 0.0011) * 0.48 + Math.sin(now * 0.0029) * 0.24) * dt * 0.85;
      if(L15.handL) L15.tilt -= C.push * dt;
      if(L15.handR) L15.tilt += C.push * dt;
      L15.tilt = Math.max(-1.25, Math.min(1.25, L15.tilt));
      if(Math.abs(L15.tilt) >= C.limit){ l15Miss(); }
      else if(L15.elapsed >= C.time){ l15Win(); }
    }else if(L15.phase === 'miss' && L15.phaseT >= 0.7){
      L15.phase = 'walk'; L15.phaseT = 0;
      L15.tilt = 0;
    }
  }
  if(el.l2ProgFill){
    el.l2ProgFill.style.width = ((L15.tilt + 1) / 2 * 100).toFixed(1) + '%';
    el.l2ProgFill.style.background = Math.abs(L15.tilt) > 0.72 ? '#ff7b6b' : '';
  }
  updateL15HUD();
  l15Pose(dt, now);
  l15Camera(dt);
}

// ============================================================
// 第十六关：过红绿灯
//
// 斑马线前的红绿灯会依次切换 绿 → 黄 → 红。
// 只有绿灯亮时才能迈步，左右脚交替，走完 8 步过马路。
// 黄灯 / 红灯时按脚 = 抢灯，记一次失误，退回红灯状态。
// ============================================================
const L16 = {
  active: false, done: false, phase: 'green', phaseT: 0,
  steps: 0, fx: 0, fromX: 0, toX: 0, hopT: 1,
  misses: 0, elapsed: 0, props: null, lights: {},
  hud: '', task: '',
};
window.__l16 = L16;

const L16_ON  = { green: 0x3ddc84, yellow: 0xffd93d, red: 0xff5a4a };
const L16_OFF = { green: 0x224432, yellow: 0x4d4420, red: 0x4d2420 };

function l16SetTask(t){
  if(!t || L16.task === t) return;
  L16.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function l16TaskText(){
  const want = L16.steps % 2 === 0 ? 'L' : 'R';
  if(L16.phase === 'green') return '绿灯：按' + (want === 'L' ? '左脚' : '右脚') + '，走一步';
  if(L16.phase === 'yellow') return '黄灯了：收脚，等红灯';
  return '红灯：站好别动';
}

function updateL16HUD(){
  const key = L16.elapsed.toFixed(1) + '/' + L16.steps + '/' + L16.misses;
  if(key === L16.hud) return;
  L16.hud = key;
  if(el.l2Time) el.l2Time.textContent = L16.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L16.steps + '/' + CONFIG.lvl16.steps;
  if(el.l2Miss) el.l2Miss.textContent = L16.misses;
}

function buildL16Props(){
  if(L16.props) return L16.props;
  const C = CONFIG.lvl16;
  const g = new THREE.Group();
  // 斑马线
  for(let i = 0; i < 9; i++){
    addBox(0.40, 0.02, 4.2, 0xeff3f8, C.x - 0.55 + i * 0.72, 0.018, 0, g);
  }
  // 红绿灯杆
  addBox(0.10, 2.30, 0.10, 0x3c4a5e, C.lightX, 1.15, -1.14, g);
  addBox(0.38, 0.94, 0.26, 0x2c3646, C.lightX, 2.10, -1.14, g);
  const ys = { red: 2.42, yellow: 2.10, green: 1.78 };
  for(const k in ys){
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.105, 18),
      new THREE.MeshBasicMaterial({ color: L16_OFF[k] })
    );
    m.position.set(C.lightX, ys[k], -1.00);
    g.add(m);
    L16.lights[k] = m;
  }
  g.visible = false;
  scene.add(g);
  L16.props = g;
  return g;
}

function startLevel16(){
  const C = CONFIG.lvl16;
  resetAllLevels();
  L16.active = true; L16.done = false;
  L16.phase = 'green'; L16.phaseT = 0;
  L16.steps = 0; L16.misses = 0; L16.elapsed = 0;
  L16.fx = C.x; L16.fromX = C.x; L16.toX = C.x; L16.hopT = 1;
  L16.hud = ''; L16.task = '';
  buildL16Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level16');
  setSky(0xcfeaff);
  setLabels('用时', '斑马线');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.85; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l16SetTask(l16TaskText());
  updateL16HUD();
  Sfx.init();
}

function resetL16Scene(){
  document.body.classList.remove('level16');
  L16.active = false; L16.done = false;
  L16.phase = 'green'; L16.phaseT = 0;
  if(L16.props) L16.props.visible = false;
  for(const k in L16.lights) L16.lights[k].material.color.setHex(L16_OFF[k]);
  L16.hud = ''; L16.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l16Miss(reason){
  if(L16.done) return;
  L16.misses++;
  L16.phase = 'red'; L16.phaseT = 0;
  Sfx.thud();
  updateL16HUD();
  l16SetTask(reason + '，等绿灯再走');
}

function l16Step(side){
  if(G.level !== 16 || !L16.active || L16.done) return;
  const C = CONFIG.lvl16;
  if(L16.hopT < 1) return;
  if(L16.phase !== 'green'){ l16Miss('抢灯了'); return; }
  const want = L16.steps % 2 === 0 ? 'L' : 'R';
  if(side !== want){ l16Miss('迈错了脚'); return; }
  L16.steps++;
  L16.fromX = L16.fx;
  L16.toX = C.x + L16.steps * C.stepLen;
  L16.hopT = 0;
  Sfx.step(); Sfx.tick(true);
  updateL16HUD();
  if(L16.steps >= C.steps){ l16Win(); return; }
  l16SetTask(l16TaskText());
}

function l16Win(){
  if(L16.done) return;
  L16.done = true; L16.active = false;
  Sfx.win();
  l16SetTask('🎉 一路绿灯，走过斑马线！');
  const used = L16.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🚦 过马路成功！',
      '用时 <b>' + used + '</b> 秒 · 抢灯 / 错脚 <b>' + L16.misses + '</b> 次', '再过一次');
  }, 1500);
}

function l16Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  const hopY = L16.hopT < 1 ? Math.sin(Math.PI * L16.hopT) * 0.16 : 0;
  TGT.spine.x = 0.05 + Math.sin(t) * 0.02;
  TGT.head.x = -0.04;
  TGT.armL.z = 0.36 + Math.sin(t) * 0.20;
  TGT.armR.z = -0.36 - Math.sin(t) * 0.20;
  TGT.legL.z = 0.10 + Math.sin(t) * 0.10;
  TGT.legR.z = -0.10 - Math.sin(t) * 0.10;
  if(L16.phase === 'red'){
    TGT.armL.z = 0.10; TGT.armR.z = -0.10;
    TGT.legL.z = 0.02; TGT.legR.z = -0.02;
  }
  if(frog) frog.root.position.set(L16.fx, hopY, 0);
  applyPose(dt);
}

function l16Camera(dt){
  camFollow(dt, L16.fx + 0.85, 2.6, 1.45);
}

function updateLevel16(dt, now){
  const C = CONFIG.lvl16;
  L16.phaseT += dt;
  if(L16.active && !L16.done){
    L16.elapsed += dt;
    const dur = C[L16.phase] || C.green;
    if(L16.phaseT >= dur){
      L16.phaseT = 0;
      L16.phase = L16.phase === 'green' ? 'yellow' : (L16.phase === 'yellow' ? 'red' : 'green');
      Sfx.tick(L16.phase === 'green');
      l16SetTask(l16TaskText());
    }
  }
  if(L16.hopT < 1){
    L16.hopT = Math.min(1, L16.hopT + dt / C.hopT);
    L16.fx = L16.fromX + (L16.toX - L16.fromX) * L16.hopT;
  }
  for(const k in L16.lights){
    const on = L16.phase === k;
    L16.lights[k].material.color.setHex(on ? L16_ON[k] : L16_OFF[k]);
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L16.steps / C.steps * 100).toFixed(1) + '%';
  updateL16HUD();
  l16Pose(dt, now);
  l16Camera(dt);
}

// ============================================================
// 第十七关：踩石头过河
//
// 河里浮着一排石头，每块石头不是偏左就是偏右。
// 按对应方向的脚跳过去（左脚踩左边的、右脚踩右边的），
// 连续踩过 9 块石头就到对岸。踩错方向会晃一下，原地重来。
// ============================================================
const L17 = {
  active: false, done: false, phase: 'walk', phaseT: 0,
  idx: 0, sides: [], fx: 0, fz: 0,
  fromX: 0, fromZ: 0, toX: 0, toZ: 0, jumpT: 1, jumpY: 0,
  misses: 0, elapsed: 0, props: null, stones: [], ring: null,
  hud: '', task: '', seqKey: '',
};
window.__l17 = L17;

function l17SetTask(t){
  if(!t || L17.task === t) return;
  L17.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL17HUD(){
  const key = L17.elapsed.toFixed(1) + '/' + L17.idx + '/' + L17.misses;
  if(key === L17.hud) return;
  L17.hud = key;
  if(el.l2Time) el.l2Time.textContent = L17.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L17.idx + '/' + CONFIG.lvl17.stones;
  if(el.l2Miss) el.l2Miss.textContent = L17.misses;
}

function l17RenderSeq(){
  if(!el.l5Seq) return;
  const key = L17.idx + '/' + L17.sides.join('');
  if(key === L17.seqKey) return;
  L17.seqKey = key;
  const parts = [];
  for(let i = L17.idx; i < Math.min(L17.sides.length, L17.idx + 5); i++){
    const side = L17.sides[i];
    let cls = 'l5chip foot';
    if(i === L17.idx) cls += ' now';
    parts.push('<span class="' + cls + '">' + (side ? '右脚 →' : '← 左脚') + '</span>');
    if(i < Math.min(L17.sides.length, L17.idx + 5) - 1) parts.push('<i class="l5arrow">→</i>');
  }
  el.l5Seq.innerHTML = parts.join('');
}

function buildL17Props(){
  if(L17.props) return L17.props;
  const C = CONFIG.lvl17;
  const g = new THREE.Group();
  const span = C.stones * C.gap;
  // 河水
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(span + 1.0, 0.05, 4.6),
    new THREE.MeshLambertMaterial({ color: 0x5cb4e6, transparent: true, opacity: 0.78 })
  );
  water.position.set(C.x + span * 0.5 + 0.45, 0.04, 0);
  g.add(water);
  // 两端河岸
  addBox(1.15, 0.18, 4.6, 0x8d979f, C.x - 0.55, 0.09, 0, g);
  addBox(1.15, 0.18, 4.6, 0x8d979f, C.x + span + 0.55, 0.09, 0, g);
  addBox(1.15, 0.05, 4.6, 0xa8b2ba, C.x - 0.55, 0.20, 0, g);
  addBox(1.15, 0.05, 4.6, 0xa8b2ba, C.x + span + 0.55, 0.20, 0, g);
  // 石头
  for(let i = 0; i < C.stones; i++){
    const st = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.48, 0.18, 12),
      new THREE.MeshLambertMaterial({ color: 0x9aa3ad })
    );
    base.position.y = 0.09;
    st.add(base);
    const moss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.40, 0.42, 0.05, 12),
      new THREE.MeshLambertMaterial({ color: 0x7cc06a })
    );
    moss.position.y = 0.17;
    st.add(moss);
    st.position.set(C.x + (i + 1) * C.gap, 0, 0);
    g.add(st);
    L17.stones.push(st);
  }
  // 下一块石头的提示圈
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.60, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.22;
  g.add(ring);
  L17.ring = ring;
  g.visible = false;
  scene.add(g);
  L17.props = g;
  return g;
}

function l17PlaceStones(){
  const C = CONFIG.lvl17;
  for(let i = 0; i < C.stones; i++){
    L17.stones[i].position.z = L17.sides[i] ? C.zSide : -C.zSide;
  }
}

function startLevel17(){
  const C = CONFIG.lvl17;
  resetAllLevels();
  L17.active = true; L17.done = false;
  L17.phase = 'walk'; L17.phaseT = 0;
  L17.idx = 0; L17.misses = 0; L17.elapsed = 0;
  L17.fx = C.x; L17.fz = 0;
  L17.fromX = C.x; L17.fromZ = 0; L17.toX = C.x; L17.toZ = 0;
  L17.jumpT = 1; L17.jumpY = 0;
  L17.sides = [];
  for(let i = 0; i < C.stones; i++){
    let side = Math.random() < 0.5 ? 0 : 1;
    if(i >= 2 && L17.sides[i - 1] === L17.sides[i - 2]) side = 1 - L17.sides[i - 1];
    L17.sides.push(side);
  }
  L17.hud = ''; L17.task = ''; L17.seqKey = '';
  buildL17Props().visible = true;
  l17PlaceStones();

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level17');
  setSky(0xbfe7ff);
  setLabels('用时', '石头');
  setBtnText(el.footL, '←', '左脚');
  setBtnText(el.footR, '→', '右脚');
  resetFrogAt(C.x, 0.18);
  G.camX = C.x + 0.9; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l17SetTask('看清楚石头偏哪边，按同方向的脚跳过去');
  l17RenderSeq();
  updateL17HUD();
  Sfx.init();
}

function resetL17Scene(){
  document.body.classList.remove('level17');
  L17.active = false; L17.done = false;
  if(L17.props) L17.props.visible = false;
  L17.hud = ''; L17.task = ''; L17.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l17Miss(reason){
  if(L17.done) return;
  L17.misses++;
  L17.phase = 'miss'; L17.phaseT = 0;
  Sfx.thud();
  updateL17HUD();
  l17SetTask(reason + '，看清楚再跳');
}

function l17Jump(side){
  if(G.level !== 17 || !L17.active || L17.done) return;
  const C = CONFIG.lvl17;
  if(L17.phase !== 'walk' || L17.jumpT < 1) return;
  const want = L17.sides[L17.idx] ? 'R' : 'L';
  if(side !== want){ l17Miss('踩空了'); return; }
  const st = L17.stones[L17.idx];
  L17.fromX = L17.fx; L17.fromZ = L17.fz;
  L17.toX = st.position.x; L17.toZ = st.position.z;
  L17.jumpT = 0;
  L17.phase = 'jump'; L17.phaseT = 0;
  Sfx.step();
  l17SetTask('跳！踩到石头了');
}

function l17Win(){
  if(L17.done) return;
  L17.done = true; L17.active = false;
  Sfx.win();
  l17SetTask('🎉 九块石头全踩过来了！');
  const used = L17.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🪨 到对岸啦！',
      '用时 <b>' + used + '</b> 秒 · 踩空 <b>' + L17.misses + '</b> 次', '再过一次');
  }, 1500);
}

function l17Pose(dt, now){
  const C = CONFIG.lvl17;
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.48 + Math.sin(t) * 0.12;
  TGT.armR.z = -0.48 - Math.sin(t) * 0.12;
  TGT.legL.z = 0.10; TGT.legR.z = -0.10;
  if(L17.jumpT < 1){
    const s = Math.sin(Math.PI * L17.jumpT);
    TGT.legL.z = -0.35 * s; TGT.legR.z = -0.35 * s;
    TGT.armL.z = 0.15 + 0.55 * s; TGT.armR.z = -0.15 - 0.55 * s;
    TGT.spine.x = 0.12 * s;
  }else if(L17.phase === 'miss'){
    const k = Math.min(1, L17.phaseT / 0.45);
    const s = Math.sin(k * Math.PI);
    BTGT.rz = 0.44 * s;
    TGT.armL.z = 0.60 * s; TGT.armR.z = -0.60 * s;
  }
  if(frog) frog.root.position.set(L17.fx, 0.18 + L17.jumpY, L17.fz);
  applyPose(dt);
}

function l17Camera(dt){
  camFollow(dt, L17.fx + 0.85, 2.4, 1.30);
}

function updateLevel17(dt, now){
  const C = CONFIG.lvl17;
  L17.phaseT += dt;
  if(L17.active && !L17.done) L17.elapsed += dt;

  if(L17.phase === 'jump' && L17.jumpT < 1){
    L17.jumpT = Math.min(1, L17.jumpT + dt / C.jumpT);
    const t = L17.jumpT;
    L17.fx = L17.fromX + (L17.toX - L17.fromX) * t;
    L17.fz = L17.fromZ + (L17.toZ - L17.fromZ) * t;
    L17.jumpY = Math.sin(Math.PI * t) * C.jumpH;
    if(t >= 1){
      L17.jumpY = 0;
      L17.idx++;
      updateL17HUD();
      l17RenderSeq();
      if(L17.idx >= C.stones){ l17Win(); }
      else{
        L17.phase = 'walk'; L17.phaseT = 0;
        Sfx.tick(true);
        l17SetTask('下一块：' + (L17.sides[L17.idx] ? '右脚往右' : '左脚往左'));
      }
    }
  }else if(L17.phase === 'miss' && L17.phaseT >= 0.45){
    L17.phase = 'walk'; L17.phaseT = 0;
    l17SetTask('下一块：' + (L17.sides[L17.idx] ? '右脚往右' : '左脚往左'));
  }

  if(L17.ring){
    if(L17.idx < C.stones){
      const st = L17.stones[L17.idx];
      L17.ring.visible = true;
      L17.ring.position.set(st.position.x, 0.22, st.position.z);
      const pulse = 1 + Math.sin(now * 0.006) * 0.10;
      L17.ring.scale.setScalar(pulse);
      L17.ring.material.opacity = 0.65 + Math.sin(now * 0.006) * 0.20;
    }else{
      L17.ring.visible = false;
    }
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L17.idx / C.stones * 100).toFixed(1) + '%';
  updateL17HUD();
  l17Pose(dt, now);
  l17Camera(dt);
}

// ============================================================
// 第十八关：接泡泡
//
// 泡泡从右边飘过来，飘到面前时用对应一侧的手把它接住。
// 左边来的用左手，右边来的用右手；漏掉一个或拍错手都记失误。
// 接住 10 个泡泡 = 通关。
// ============================================================
const L18 = {
  active: false, done: false, phase: 'fly', phaseT: 0,
  catches: 0, misses: 0, elapsed: 0, cool: 0, flash: 0, side: 'L',
  bx: 0, bz: 0, popT: 0, popCatch: false,
  props: null, bubble: null, shell: null, hud: '', task: '',
};
window.__l18 = L18;

function l18SetTask(t){
  if(!t || L18.task === t) return;
  L18.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL18HUD(){
  const key = L18.elapsed.toFixed(1) + '/' + L18.catches + '/' + L18.misses;
  if(key === L18.hud) return;
  L18.hud = key;
  if(el.l2Time) el.l2Time.textContent = L18.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L18.catches + '/' + CONFIG.lvl18.bubbles;
  if(el.l2Miss) el.l2Miss.textContent = L18.misses;
}

function buildL18Props(){
  if(L18.props) return L18.props;
  const C = CONFIG.lvl18;
  const g = new THREE.Group();
  const bubble = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 14),
    new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.64 })
  );
  bubble.add(shell);
  L18.shell = shell;
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shine.position.set(-0.08, 0.10, 0.14);
  bubble.add(shine);
  bubble.position.set(C.x + C.spawnDX, 1.15, 0);
  g.add(bubble);
  L18.bubble = bubble;

  // 路边的小长椅，给个场景
  addBox(1.2, 0.10, 0.42, 0xc89b63, C.x + 3.0, 0.46, -1.35, g);
  addBox(0.10, 0.46, 0.36, 0x6b7a86, C.x + 2.55, 0.23, -1.35, g);
  addBox(0.10, 0.46, 0.36, 0x6b7a86, C.x + 3.45, 0.23, -1.35, g);
  g.visible = false;
  scene.add(g);
  L18.props = g;
  return g;
}

function l18Spawn(){
  const C = CONFIG.lvl18;
  L18.side = Math.random() < 0.5 ? 'L' : 'R';
  L18.bx = C.x + C.spawnDX;
  L18.bz = L18.side === 'L' ? -C.zSide : C.zSide;
  L18.phase = 'fly'; L18.phaseT = 0; L18.popT = 0;
  if(L18.shell) L18.shell.material.color.setHex(L18.side === 'L' ? 0xffd93d : 0x3d8bf0);
  if(L18.bubble){
    L18.bubble.visible = true;
    L18.bubble.scale.setScalar(1);
    L18.bubble.position.set(L18.bx, 1.15, L18.bz);
  }
  l18SetTask(L18.side === 'L' ? '黄色泡泡：准备左手' : '蓝色泡泡：准备右手');
}

function startLevel18(){
  const C = CONFIG.lvl18;
  resetAllLevels();
  L18.active = true; L18.done = false;
  L18.catches = 0; L18.misses = 0; L18.elapsed = 0;
  L18.cool = 0; L18.flash = 0;
  L18.hud = ''; L18.task = '';
  buildL18Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level18');
  setSky(0xcfeaff);
  setLabels('用时', '接住');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.95; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l18Spawn();
  updateL18HUD();
  Sfx.init();
}

function resetL18Scene(){
  document.body.classList.remove('level18');
  L18.active = false; L18.done = false;
  if(L18.props) L18.props.visible = false;
  L18.hud = ''; L18.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l18Miss(reason){
  if(L18.done) return;
  L18.misses++;
  Sfx.thud();
  updateL18HUD();
  l18SetTask(reason);
}

function l18Hand(side){
  if(G.level !== 18 || !L18.active || L18.done) return;
  const C = CONFIG.lvl18;
  if(L18.cool > 0) return;
  if(L18.phase !== 'fly') return;
  const inReach = L18.bx <= C.x + C.reach && L18.bx >= C.x + 0.40;
  if(!inReach){ L18.cool = 0.35; l18Miss('拍空了，等泡泡靠近'); return; }
  if(side !== L18.side){ L18.cool = 0.55; l18Miss('要用' + (L18.side === 'L' ? '左手' : '右手') + '接'); return; }
  L18.catches++;
  L18.flash = 0.35;
  Sfx.perfect();
  L18.phase = 'pop'; L18.popT = 0; L18.popCatch = true;
  updateL18HUD();
  l18SetTask('接住啦！');
}

function l18Win(){
  if(L18.done) return;
  L18.done = true; L18.active = false;
  Sfx.win();
  l18SetTask('🎉 十个泡泡全部接住！');
  const used = L18.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🫧 泡泡全接住！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L18.misses + '</b> 次', '再接一次');
  }, 1500);
}

function l18Pose(dt, now){
  const C = CONFIG.lvl18;
  baseTargets();
  const t = now * 0.0028;
  TGT.spine.x = 0.04;
  TGT.head.x = -0.04;
  TGT.armL.z = 0.72 + Math.sin(t) * 0.10;
  TGT.armR.z = -0.72 - Math.sin(t) * 0.10;
  TGT.legL.z = 0.05; TGT.legR.z = -0.05;
  if(L18.flash > 0){
    const s = Math.sin(Math.PI * Math.min(1, L18.flash / 0.35));
    if(L18.side === 'L') TGT.armL.z += 0.62 * s;
    else TGT.armR.z -= 0.62 * s;
    TGT.head.z = (L18.side === 'L' ? 0.12 : -0.12) * s;
  }
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l18Camera(dt){
  camFollow(dt, CONFIG.lvl18.x + 0.95, 2.8, 1.50);
}

function updateLevel18(dt, now){
  const C = CONFIG.lvl18;
  L18.phaseT += dt;
  L18.cool = Math.max(0, L18.cool - dt);
  L18.flash = Math.max(0, L18.flash - dt);
  if(L18.active && !L18.done) L18.elapsed += dt;

  if(L18.active && !L18.done){
    if(L18.phase === 'fly'){
      const p = Math.min(1, L18.catches / Math.max(1, C.bubbles - 1));
      const sp = C.speed0 + (C.speed1 - C.speed0) * p;
      L18.bx -= sp * dt;
      if(L18.bx < C.x - 0.28){
        L18.misses++;
        Sfx.thud();
        updateL18HUD();
        L18.phase = 'pop'; L18.popT = 0; L18.popCatch = false;
        l18SetTask('泡泡飘走了');
      }
    }else if(L18.phase === 'pop'){
      L18.popT += dt / 0.36;
      if(L18.bubble){
        const k = Math.min(1, L18.popT);
        const s = L18.popCatch ? 1 - k : 1 + k * 0.40;
        L18.bubble.scale.setScalar(Math.max(0.001, s));
      }
      if(L18.popT >= 1){
        if(L18.catches >= C.bubbles){ l18Win(); }
        else{ l18Spawn(); }
      }
    }
  }
  if(L18.bubble){
    L18.bubble.position.set(L18.bx, 1.15 + Math.sin(now * 0.0032) * 0.10, L18.bz);
    L18.bubble.rotation.y = now * 0.0015;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L18.catches / C.bubbles * 100).toFixed(1) + '%';
  updateL18HUD();
  l18Pose(dt, now);
  l18Camera(dt);
}

// ============================================================
// 第十九关：投篮
//
// 按住任意一只脚蓄力，力度条来回摆动。
// 松手时力度落在绿区 → 球飞进篮筐；偏了就会打铁。
// 投进 5 球 = 通关，投丢可以原地再投。
// ============================================================
const L19 = {
  active: false, done: false, phase: 'aim', phaseT: 0,
  power: 0, dir: 1, charging: false,
  makes: 0, misses: 0, elapsed: 0,
  flyT: 0, flyOk: false, restT: 0,
  fromX: 0, fromY: 0, fromZ: 0, missText: '',
  props: null, ball: null, hud: '', task: '',
};
window.__l19 = L19;

function l19SetTask(t){
  if(!t || L19.task === t) return;
  L19.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL19HUD(){
  const key = L19.elapsed.toFixed(1) + '/' + L19.makes + '/' + L19.misses;
  if(key === L19.hud) return;
  L19.hud = key;
  if(el.l2Time) el.l2Time.textContent = L19.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L19.makes + '/' + CONFIG.lvl19.shots;
  if(el.l2Miss) el.l2Miss.textContent = L19.misses;
}

function l19UpdateZone(){
  const C = CONFIG.lvl19;
  const z = C.zones[Math.min(L19.makes, C.shots - 1)];
  if(el.l7Zone && z){
    el.l7Zone.style.display = 'block';
    el.l7Zone.style.left = (z[0] * 100).toFixed(1) + '%';
    el.l7Zone.style.width = ((z[1] - z[0]) * 100).toFixed(1) + '%';
  }
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
}

function l19BallToHand(){
  const C = CONFIG.lvl19;
  if(L19.ball) L19.ball.position.set(C.x + 0.05, 1.62, 0.30);
}

function buildL19Props(){
  if(L19.props) return L19.props;
  const C = CONFIG.lvl19;
  const g = new THREE.Group();
  // 篮球架：立柱 + 篮板 + 篮筐 + 网
  addBox(0.09, C.hoopY + 0.75, 0.09, 0x3c4a5e, C.hoopX, (C.hoopY + 0.75) / 2, -0.42, g);
  addBox(0.94, 0.66, 0.07, 0xf3f6fb, C.hoopX, C.hoopY + 0.72, -0.40, g);
  addBox(0.58, 0.40, 0.02, 0xd94f4f, C.hoopX, C.hoopY + 0.72, -0.34, g);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.035, 8, 28),
    new THREE.MeshLambertMaterial({ color: 0xe8505a })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(C.hoopX - 0.30, C.hoopY, 0);
  g.add(rim);
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.20, 0.42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.46, side: THREE.DoubleSide })
  );
  net.position.set(C.hoopX - 0.30, C.hoopY - 0.23, 0);
  g.add(net);
  // 篮球
  const ball = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 18, 14),
    new THREE.MeshLambertMaterial({ color: 0xe8892f })
  );
  ball.add(body);
  for(const rx of [0, Math.PI / 2]){
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.222, 0.012, 6, 24),
      new THREE.MeshLambertMaterial({ color: 0x8a4513 })
    );
    seam.rotation.x = Math.PI / 2;
    seam.rotation.z = rx;
    ball.add(seam);
  }
  ball.position.set(C.x + 0.05, 1.62, 0.30);
  g.add(ball);
  L19.ball = ball;
  g.visible = false;
  scene.add(g);
  L19.props = g;
  return g;
}

function startLevel19(){
  const C = CONFIG.lvl19;
  resetAllLevels();
  L19.active = true; L19.done = false;
  L19.phase = 'aim'; L19.phaseT = 0;
  L19.power = 0; L19.dir = 1; L19.charging = false;
  L19.makes = 0; L19.misses = 0; L19.elapsed = 0;
  L19.flyT = 0; L19.flyOk = false; L19.restT = 0;
  L19.hud = ''; L19.task = '';
  buildL19Props().visible = true;
  l19BallToHand();

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level19');
  setSky(0xbfe7ff);
  setLabels('用时', '投进');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.95; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l19UpdateZone();
  l19SetTask('按住脚蓄力，松手卡进绿区投篮');
  updateL19HUD();
  Sfx.init();
}

function resetL19Scene(){
  document.body.classList.remove('level19');
  L19.active = false; L19.done = false;
  L19.charging = false; L19.power = 0;
  if(L19.props) L19.props.visible = false;
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  L19.hud = ''; L19.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l19Down(){
  if(G.level !== 19 || !L19.active || L19.done) return;
  if(L19.phase !== 'aim' || L19.charging) return;
  L19.charging = true;
  L19.power = 0; L19.dir = 1;
  Sfx.tick(false);
  l19SetTask('蓄力中…到绿区松手');
}

function l19Up(){
  if(G.level !== 19 || !L19.active || L19.done) return;
  if(!L19.charging) return;
  L19.charging = false;
  const C = CONFIG.lvl19;
  const z = C.zones[Math.min(L19.makes, C.shots - 1)];
  const p = L19.power;
  L19.flyOk = z ? (p >= z[0] && p <= z[1]) : false;
  L19.missText = p < (z ? z[0] : 0.5) ? '力气不够' : '太用力了';
  L19.power = 0;
  L19.phase = 'fly'; L19.phaseT = 0; L19.flyT = 0;
  L19.fromX = L19.ball ? L19.ball.position.x : C.x;
  L19.fromY = L19.ball ? L19.ball.position.y : 1.62;
  L19.fromZ = L19.ball ? L19.ball.position.z : 0.30;
  Sfx.step();
  l19SetTask('投出去！');
}

function l19Win(){
  if(L19.done) return;
  L19.done = true; L19.active = false;
  Sfx.win();
  l19SetTask('🎉 五球全进，神射手！');
  const used = L19.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏀 五球全中！',
      '用时 <b>' + used + '</b> 秒 · 投丢 <b>' + L19.misses + '</b> 次', '再投一轮');
  }, 1500);
}

function l19Pose(dt, now){
  const C = CONFIG.lvl19;
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.03;
  TGT.head.x = -0.05;
  TGT.legL.z = 0.06; TGT.legR.z = -0.06;
  if(L19.phase === 'aim'){
    TGT.armL.z = 1.18 + Math.sin(t) * 0.06;
    TGT.armR.z = -1.18 - Math.sin(t) * 0.06;
    if(L19.charging){
      const k = L19.power;
      BTGT.y = -0.12 * k;
      TGT.spine.x = 0.10 * k;
      TGT.legL.z = 0.28 * k; TGT.legR.z = -0.28 * k;
    }
  }else if(L19.phase === 'fly' || L19.phase === 'rest'){
    const s = Math.sin(Math.PI * Math.min(1, L19.flyT));
    TGT.armL.z = 1.50 - 0.25 * s;
    TGT.armR.z = -1.50 + 0.25 * s;
    TGT.spine.x = 0.10 * s;
  }else if(L19.phase === 'win'){
    TGT.armL.z = 1.35; TGT.armR.z = -1.35;
  }
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l19Camera(dt){
  camFollow(dt, CONFIG.lvl19.x + 1.55, 3.1, 1.55);
}

function updateLevel19(dt, now){
  const C = CONFIG.lvl19;
  L19.phaseT += dt;
  if(L19.active && !L19.done) L19.elapsed += dt;

  if(L19.charging && L19.phase === 'aim'){
    L19.power += (dt / (L19.dir > 0 ? C.chargeUp : C.chargeDown)) * L19.dir;
    if(L19.power >= 1){ L19.power = 1; L19.dir = -1; }
    if(L19.power <= 0){ L19.power = 0; L19.dir = 1; }
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L19.power * 100).toFixed(1) + '%';

  if(L19.phase === 'fly' && L19.ball){
    L19.flyT = Math.min(1, L19.flyT + dt / 0.90);
    const t = L19.flyT;
    const hx = C.hoopX - 0.30;
    const tx = L19.flyOk ? hx : hx - 0.14;
    const ty = L19.flyOk ? C.hoopY : C.hoopY + 0.26;
    const bx = L19.fromX + (tx - L19.fromX) * t;
    const by = L19.fromY + (ty - L19.fromY) * t + Math.sin(Math.PI * t) * 0.55;
    const bz = L19.fromZ + ((L19.flyOk ? 0 : 0.44) - L19.fromZ) * t;
    L19.ball.position.set(bx, by, bz);
    L19.ball.rotation.z -= dt * 9;
    if(t >= 1){
      L19.phase = 'rest'; L19.restT = 0;
      if(L19.flyOk){
        L19.makes++;
        Sfx.perfect();
        updateL19HUD();
        l19SetTask('进了！漂亮');
        if(L19.makes >= C.shots){ l19Win(); }
      }else{
        L19.misses++;
        Sfx.thud();
        updateL19HUD();
        l19SetTask(L19.missText + '，再投一次');
      }
    }
  }else if(L19.phase === 'rest'){
    L19.restT += dt;
    if(L19.restT >= 0.35){
      if(!L19.done){
        L19.phase = 'aim'; L19.phaseT = 0;
        L19.power = 0; L19.dir = 1;
        l19BallToHand();
        l19UpdateZone();
        l19SetTask('按住脚蓄力，松手卡进绿区投篮');
      }
    }
  }
  updateL19HUD();
  l19Pose(dt, now);
  l19Camera(dt);
}

// ============================================================
// 第二十关：毕业大挑战
//
// 三种题型轮流出现：单按一个部位、两个部位同时按、两连按。
// 一共 12 轮，时间窗口越来越短，全部通过就毕业。
// ============================================================
const L20 = {
  active: false, done: false, phase: 'show', phaseT: 0,
  round: 0, kind: 'single', codes: [], stage: 0,
  win: 0, misses: 0, elapsed: 0,
  firstCode: '', firstAt: 0,
  flash: {}, props: null, pads: {}, hud: '', task: '', seqKey: '',
};
window.__L20 = L20;
window.__l20 = L20;

function l20SetTask(t){
  if(!t || L20.task === t) return;
  L20.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL20HUD(){
  const key = L20.elapsed.toFixed(1) + '/' + L20.round + '/' + L20.misses;
  if(key === L20.hud) return;
  L20.hud = key;
  if(el.l2Time) el.l2Time.textContent = L20.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L20.round + '/' + CONFIG.lvl20.rounds;
  if(el.l2Miss) el.l2Miss.textContent = L20.misses;
}

function l20RenderSeq(){
  if(!el.l5Seq) return;
  const key = L20.kind + '/' + L20.codes.join('') + '/' + L20.stage + '/' + L20.phase;
  if(key === L20.seqKey) return;
  L20.seqKey = key;
  if(L20.kind === 'pair'){
    el.l5Seq.innerHTML = L20.codes.map((code)=>{
      return '<span class="l5chip ' + (code[0] === 'H' ? 'hand' : 'foot') + ' now">' + L5_LIMB[code] + '</span>';
    }).join('<i class="l5arrow">＋</i>');
  }else if(L20.kind === 'seq'){
    el.l5Seq.innerHTML = seqBarHtml(L20.codes, L20.stage, L20.stage, '→');
  }else{
    const code = L20.codes[0];
    el.l5Seq.innerHTML = '<span class="l5chip ' + (code[0] === 'H' ? 'hand' : 'foot') + ' now">' + L5_LIMB[code] + '</span>';
  }
}

function l20Pick(){
  const C = CONFIG.lvl20;
  const all = ['HL', 'HR', 'FL', 'FR'];
  const kinds = ['single', 'pair', 'seq'];
  L20.kind = kinds[L20.round % 3];
  L20.phase = 'show'; L20.phaseT = 0;
  L20.stage = 0; L20.firstCode = ''; L20.firstAt = 0;
  if(L20.kind === 'single'){
    let code = all[Math.floor(Math.random() * all.length)];
    if(code === L20.codes[0]) code = all[(all.indexOf(code) + 1) % all.length];
    L20.codes = [code];
    l20SetTask('第 ' + (L20.round + 1) + ' 轮：按 ' + L5_LIMB[code]);
  }else if(L20.kind === 'pair'){
    const pick = all.slice();
    for(let i = pick.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [pick[i], pick[j]] = [pick[j], pick[i]];
    }
    L20.codes = [pick[0], pick[1]];
    l20SetTask('第 ' + (L20.round + 1) + ' 轮：同时按 ' + L5_LIMB[pick[0]] + ' + ' + L5_LIMB[pick[1]]);
  }else{
    let a = all[Math.floor(Math.random() * all.length)];
    let b = all[Math.floor(Math.random() * all.length)];
    if(a === b) b = all[(all.indexOf(b) + 1) % all.length];
    L20.codes = [a, b];
    l20SetTask('第 ' + (L20.round + 1) + ' 轮：先 ' + L5_LIMB[a] + '，再 ' + L5_LIMB[b]);
  }
  L20.win = C.win0 + (C.win1 - C.win0) * (L20.round / Math.max(1, C.rounds - 1));
  for(const code of L20.codes) L20.flash[code] = 0.45;
  l20RenderSeq();
}

function buildL20Props(){
  if(L20.props) return L20.props;
  const C = CONFIG.lvl20;
  const g = new THREE.Group();
  const offs = { HL: -1.30, FL: -0.45, HR: 0.45, FR: 1.30 };
  for(const code in offs){
    const mat = new THREE.MeshLambertMaterial({ color: L8_COLORS[code], emissive: L8_COLORS[code], emissiveIntensity: 0.10 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.52), mat);
    pad.position.set(C.x + offs[code], 0.05, -0.80);
    g.add(pad);
    L20.pads[code] = pad;
    L20.flash[code] = 0;
  }
  // 终点的小旗
  addBox(0.07, 1.9, 0.07, 0x3c4a5e, C.x + 2.40, 0.95, -1.15, g);
  addBox(0.70, 0.42, 0.03, 0xd94f4f, C.x + 2.72, 1.64, -1.15, g);
  g.visible = false;
  scene.add(g);
  L20.props = g;
  return g;
}

function startLevel20(){
  const C = CONFIG.lvl20;
  resetAllLevels();
  L20.active = true; L20.done = false;
  L20.phase = 'show'; L20.phaseT = 0;
  L20.round = 0; L20.kind = 'single'; L20.codes = []; L20.stage = 0;
  L20.win = C.win0; L20.misses = 0; L20.elapsed = 0;
  L20.firstCode = ''; L20.firstAt = 0;
  L20.hud = ''; L20.task = ''; L20.seqKey = '';
  buildL20Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level20');
  setSky(0xd6ecff);
  setLabels('用时', '轮次');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.85; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  l20Pick();
  updateL20HUD();
  Sfx.init();
}

function resetL20Scene(){
  document.body.classList.remove('level20');
  L20.active = false; L20.done = false;
  L20.phase = 'show'; L20.stage = 0; L20.firstCode = '';
  if(L20.props) L20.props.visible = false;
  for(const code in L20.flash){
    L20.flash[code] = 0;
    if(L20.pads[code]) L20.pads[code].material.emissiveIntensity = 0.10;
  }
  L20.hud = ''; L20.task = ''; L20.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l20Miss(reason){
  if(L20.done) return;
  L20.misses++;
  L20.phase = 'gap'; L20.phaseT = 0;
  L20.firstCode = ''; L20.firstAt = 0;
  Sfx.thud();
  updateL20HUD();
  l20SetTask(reason + '，重来一轮');
}

function l20Pass(){
  const C = CONFIG.lvl20;
  L20.round++;
  Sfx.tick(true);
  updateL20HUD();
  if(L20.round >= C.rounds){ l20Win(); return; }
  L20.phase = 'gap'; L20.phaseT = 0;
  l20SetTask('通过！准备下一轮');
}

function l20Press(code){
  if(G.level !== 20 || !L20.active || L20.done) return;
  if(L20.phase !== 'show') return;
  if(!L20.codes.includes(code)){ l20Miss('按错部位了'); return; }

  if(L20.kind === 'single'){
    if(code === L20.codes[0]) l20Pass();
    else l20Miss('按错了');
    return;
  }
  if(L20.kind === 'pair'){
    if(!L20.firstCode){
      L20.firstCode = code;
      L20.firstAt = performance.now();
      L20.flash[code] = 0.35;
      l20SetTask('再按另一个：还差一个');
      return;
    }
    if(code === L20.firstCode) return;
    const dtms = performance.now() - L20.firstAt;
    if(dtms <= CONFIG.lvl20.pairSync * 1000) l20Pass();
    else l20Miss('两只手脚没同时按');
    return;
  }
  // 两连按
  if(code !== L20.codes[L20.stage]){ l20Miss('顺序错了'); return; }
  L20.flash[code] = 0.35;
  if(L20.stage >= 1){ l20Pass(); return; }
  L20.stage = 1;
  L20.seqKey = '';
  l20RenderSeq();
  l20SetTask('第一步对了，快按 ' + L5_LIMB[L20.codes[1]]);
}

function l20Win(){
  if(L20.done) return;
  L20.done = true; L20.active = false;
  Sfx.win();
  l20SetTask('🎓 十二轮全部通过，毕业啦！');
  const used = L20.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎓 奶蛙毕业啦！',
      '用时 <b>' + used + '</b> 秒 · 失误 <b>' + L20.misses + '</b> 次', '再挑战一次');
  }, 1600);
}

function l20Pose(dt, now){
  const C = CONFIG.lvl20;
  baseTargets();
  const t = now * 0.0022;
  TGT.spine.x = Math.sin(t) * 0.03;
  TGT.head.z = Math.sin(t * 1.4) * 0.08;
  TGT.armL.z = 0.20 + Math.sin(t) * 0.10;
  TGT.armR.z = -0.20 - Math.sin(t) * 0.10;
  TGT.legL.z = 0.04; TGT.legR.z = -0.04;
  for(const code in L20.flash){
    const f = L20.flash[code];
    if(f <= 0) continue;
    const s = Math.sin(Math.PI * Math.min(1, f / 0.45));
    if(code === 'HL') TGT.armL.z += 0.62 * s;
    else if(code === 'HR') TGT.armR.z -= 0.62 * s;
    else if(code === 'FL') TGT.legL.z += 0.36 * s;
    else if(code === 'FR') TGT.legR.z -= 0.36 * s;
  }
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l20Camera(dt){
  camFollow(dt, CONFIG.lvl20.x + 0.85, 2.2, 1.30);
}

function updateLevel20(dt, now){
  const C = CONFIG.lvl20;
  L20.phaseT += dt;
  if(L20.active && !L20.done) L20.elapsed += dt;

  for(const code in L20.pads){
    const f = Math.max(0, (L20.flash[code] || 0) - dt);
    L20.flash[code] = f;
    L20.pads[code].material.emissiveIntensity = f > 0 ? 1.0 : 0.10;
  }

  if(L20.active && !L20.done){
    if(L20.phase === 'show'){
      L20.win -= dt;
      if(el.l2ProgFill) el.l2ProgFill.style.width = Math.max(0, L20.win / C.win0 * 100).toFixed(1) + '%';
      if(L20.win <= 0) l20Miss('超时了');
    }else if(L20.phase === 'gap' && L20.phaseT >= C.gap){
      l20Pick();
    }
  }
  updateL20HUD();
  l20Pose(dt, now);
  l20Camera(dt);
}

// ============================================================
// 第二十一关：躲滚球
//
// 大球从右边滚过来，按脚起跳，从球上面跳过去。
// 跳早了会提前落地被撞到，跳晚了球已经到脚边。共 8 个球。
// ============================================================
const L21 = {
  active: false, done: false, phase: 'run', phaseT: 0,
  bx: 0, speed: 2.2, cleared: 0, misses: 0, elapsed: 0,
  jumpT: 1, rest: 0, judged: true, flash: 0,
  props: null, ball: null, hud: '', task: '',
};
window.__l21 = L21;

function l21SetTask(t){
  if(!t || L21.task === t) return;
  L21.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL21HUD(){
  const key = L21.elapsed.toFixed(1) + '/' + L21.cleared + '/' + L21.misses;
  if(key === L21.hud) return;
  L21.hud = key;
  if(el.l2Time) el.l2Time.textContent = L21.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L21.cleared + '/' + CONFIG.lvl21.balls;
  if(el.l2Miss) el.l2Miss.textContent = L21.misses;
}

function buildL21Props(){
  if(L21.props) return L21.props;
  const C = CONFIG.lvl21;
  const g = new THREE.Group();
  // 路边的锥桶
  for(const bx of [C.x + 2.4, C.x + 4.6, C.x + 6.8]){
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.55, 12),
      new THREE.MeshLambertMaterial({ color: 0xf08a2e })
    );
    cone.position.set(bx, 0.28, -1.75);
    g.add(cone);
    const cone2 = cone.clone();
    cone2.position.z = 1.75;
    g.add(cone2);
  }
  const ball = new THREE.Group();
  const b = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 18, 14),
    new THREE.MeshLambertMaterial({ color: 0x2a5fa8 })
  );
  ball.add(b);
  const stripe = new THREE.Mesh(
    new THREE.TorusGeometry(0.342, 0.030, 6, 24),
    new THREE.MeshLambertMaterial({ color: 0x9ee0ff })
  );
  stripe.rotation.y = Math.PI / 2;
  ball.add(stripe);
  const sh = makeShadow(0.8, 0.8);
  sh.position.y = -0.32;
  ball.add(sh);
  ball.position.set(C.spawnX, 0.34, 0);
  g.add(ball);
  L21.ball = ball;
  g.visible = false;
  scene.add(g);
  L21.props = g;
  return g;
}

function l21Spawn(){
  const C = CONFIG.lvl21;
  L21.bx = C.spawnX;
  L21.judged = false;
  L21.speed = C.speed0 + (C.speed1 - C.speed0) * (L21.cleared / Math.max(1, C.balls - 1));
  if(L21.ball){
    L21.ball.visible = true;
    L21.ball.position.set(L21.bx, 0.34, 0);
  }
  l21SetTask('球来了，看准再跳');
}

function startLevel21(){
  const C = CONFIG.lvl21;
  resetAllLevels();
  L21.active = true; L21.done = false;
  L21.phase = 'run'; L21.phaseT = 0;
  L21.cleared = 0; L21.misses = 0; L21.elapsed = 0;
  L21.jumpT = 1; L21.rest = 0; L21.flash = 0;
  L21.hud = ''; L21.task = '';
  buildL21Props().visible = true;
  l21Spawn();

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level21');
  setSky(0xbfe1ff);
  setLabels('用时', '躲过');
  setBtnText(el.footL, '↑', '起跳');
  setBtnText(el.footR, '↑', '起跳');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.2; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  updateL21HUD();
  Sfx.init();
}

function resetL21Scene(){
  document.body.classList.remove('level21');
  L21.active = false; L21.done = false;
  if(L21.props) L21.props.visible = false;
  L21.hud = ''; L21.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l21Jump(){
  if(G.level !== 21 || !L21.active || L21.done) return;
  if(L21.jumpT < 1) return;
  L21.jumpT = 0;
  Sfx.step();
}

function l21Win(){
  if(L21.done) return;
  L21.done = true; L21.active = false;
  Sfx.win();
  l21SetTask('🎉 八个球全部跳过！');
  const used = L21.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏐 躲球成功！',
      '用时 <b>' + used + '</b> 秒 · 被撞 <b>' + L21.misses + '</b> 次', '再躲一次');
  }, 1500);
}

function l21Pose(dt, now){
  baseTargets();
  const t = now * 0.0026;
  TGT.spine.x = 0.06;
  TGT.armL.z = 0.30 + Math.sin(t) * 0.12;
  TGT.armR.z = -0.30 - Math.sin(t) * 0.12;
  TGT.legL.z = 0.10; TGT.legR.z = -0.10;
  if(L21.jumpT < 1){
    const s = Math.sin(Math.PI * L21.jumpT);
    TGT.legL.z = -0.40 * s; TGT.legR.z = -0.40 * s;
    TGT.armL.z = 0.20 + 0.60 * s; TGT.armR.z = -0.20 - 0.60 * s;
    TGT.spine.x = 0.10 * s;
  }
  if(L21.flash > 0){
    const s = Math.sin(Math.PI * Math.min(1, L21.flash / 0.5));
    BTGT.rz = 0.35 * s;
  }
  if(frog) frog.root.position.set(CONFIG.lvl21.x, L21.jumpT < 1 ? Math.sin(Math.PI * L21.jumpT) * CONFIG.lvl21.jumpH : 0, 0);
  applyPose(dt);
}

function l21Camera(dt){
  camFollow(dt, CONFIG.lvl21.x + 1.2, 3.6, 1.45);
}

function updateLevel21(dt, now){
  const C = CONFIG.lvl21;
  L21.phaseT += dt;
  L21.flash = Math.max(0, L21.flash - dt);
  if(L21.active && !L21.done) L21.elapsed += dt;

  if(L21.rest > 0){
    L21.rest -= dt;
    if(L21.rest <= 0 && !L21.done) l21Spawn();
  }else if(L21.ball && L21.ball.visible && !L21.done){
    L21.bx -= L21.speed * dt;
    L21.ball.position.x = L21.bx;
    L21.ball.rotation.z -= dt * L21.speed * 1.6;
    if(!L21.judged && L21.bx <= C.x + 0.26){
      L21.judged = true;
      if(L21.jumpT > 0.10 && L21.jumpT < 0.92){
        L21.cleared++;
        L21.flash = 0.35;
        Sfx.perfect();
        updateL21HUD();
        l21SetTask('跳过去了！');
        if(L21.cleared >= C.balls){
          l21Win();
        }
      }else{
        L21.misses++;
        L21.flash = 0.5;
        Sfx.thud();
        updateL21HUD();
        l21SetTask('被球撞到了');
      }
    }
    if(L21.bx < C.x - 1.25){
      L21.ball.visible = false;
      L21.rest = C.gap;
    }
  }
  if(L21.jumpT < 1) L21.jumpT = Math.min(1, L21.jumpT + dt / C.jumpT);
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L21.cleared / C.balls * 100).toFixed(1) + '%';
  updateL21HUD();
  l21Pose(dt, now);
  l21Camera(dt);
}

// ============================================================
// 第二十二关：放风筝
//
// 风筝会被风吹得左右跑，按住左手往左拉、按住右手往右拉。
// 把风筝稳在中间绿框里 12 秒，飘出框外就记一次失误。
// ============================================================
const L22 = {
  active: false, done: false, phase: 'fly', phaseT: 0,
  kx: 0, elapsed: 0, misses: 0, outT: 0, flash: 0,
  holdL: false, holdR: false, inZone: true,
  props: null, kite: null, line: null, hud: '', task: '',
};
window.__l22 = L22;

function l22SetTask(t){
  if(!t || L22.task === t) return;
  L22.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL22HUD(){
  const C = CONFIG.lvl22;
  const remain = Math.max(0, C.time - L22.elapsed);
  const key = L22.elapsed.toFixed(1) + '/' + L22.misses;
  if(key === L22.hud) return;
  L22.hud = key;
  if(el.l2Time) el.l2Time.textContent = L22.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = remain.toFixed(1) + 's';
  if(el.l2Miss) el.l2Miss.textContent = L22.misses;
}

function buildL22Props(){
  if(L22.props) return L22.props;
  const C = CONFIG.lvl22;
  const g = new THREE.Group();
  // 绿框
  const zone = new THREE.Mesh(
    new THREE.PlaneGeometry(C.zone * 2, 1.0),
    new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  zone.position.set(C.center, 2.9, -0.28);
  g.add(zone);
  addBox(0.05, 1.2, 0.05, 0x3ddc84, C.center - C.zone, 2.9, -0.30, g);
  addBox(0.05, 1.2, 0.05, 0x3ddc84, C.center + C.zone, 2.9, -0.30, g);
  addBox(C.zone * 2, 0.05, 0.05, 0x3ddc84, C.center, 2.32, -0.30, g);
  addBox(C.zone * 2, 0.05, 0.05, 0x3ddc84, C.center, 3.48, -0.30, g);
  // 风筝
  const kite = new THREE.Group();
  const d1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.50, 0.035),
    new THREE.MeshLambertMaterial({ color: 0xe8505a })
  );
  d1.rotation.z = Math.PI / 4;
  kite.add(d1);
  const d2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.30, 0.045),
    new THREE.MeshLambertMaterial({ color: 0xffd93d })
  );
  d2.rotation.z = Math.PI / 4;
  d2.position.z = 0.02;
  kite.add(d2);
  for(let i = 0; i < 3; i++){
    const tail = addBox(0.10, 0.10, 0.03, 0xffd93d, -0.16 - i * 0.12, -0.38 - i * 0.12, 0.0, kite);
  }
  kite.position.set(C.center, 2.9, 0.12);
  g.add(kite);
  L22.kite = kite;
  // 风筝线
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute([C.x + 0.15, 1.25, 0.2, C.center, 2.9, 0.12], 3));
  const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf3f6fb }));
  g.add(line);
  L22.line = line;
  g.visible = false;
  scene.add(g);
  L22.props = g;
  return g;
}

function startLevel22(){
  const C = CONFIG.lvl22;
  resetAllLevels();
  L22.active = true; L22.done = false;
  L22.phase = 'fly'; L22.phaseT = 0;
  L22.kx = C.center; L22.elapsed = 0; L22.misses = 0;
  L22.outT = 0; L22.flash = 0; L22.holdL = false; L22.holdR = false; L22.inZone = true;
  L22.hud = ''; L22.task = '';
  buildL22Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level22');
  setSky(0xd6ecff);
  setLabels('用时', '稳住');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.6; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l22SetTask('按住左手往左拉，右手往右拉，把风筝稳在绿框里');
  updateL22HUD();
  Sfx.init();
}

function resetL22Scene(){
  document.body.classList.remove('level22');
  L22.active = false; L22.done = false;
  L22.holdL = false; L22.holdR = false;
  if(L22.props) L22.props.visible = false;
  L22.hud = ''; L22.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l22Hand(side, down){
  if(G.level !== 22 || !L22.active || L22.done) return;
  if(side === 'L') L22.holdL = down;
  else L22.holdR = down;
}

function l22Win(){
  if(L22.done) return;
  L22.done = true; L22.active = false;
  Sfx.win();
  l22SetTask('🎉 风筝稳稳飞了十二秒！');
  setTimeout(()=>{
    showOverlay('🪁 风筝稳住啦！',
      '失误 <b>' + L22.misses + '</b> 次 · 风筝没有飘出绿框', '再放一次');
  }, 1500);
}

function l22Pose(dt, now){
  baseTargets();
  const t = now * 0.0026;
  TGT.spine.x = 0.04;
  TGT.head.x = -0.06;
  TGT.armL.z = 1.20 + Math.sin(t) * 0.08 + (L22.holdL ? 0.18 : 0);
  TGT.armR.z = -1.20 - Math.sin(t) * 0.08 - (L22.holdR ? 0.18 : 0);
  TGT.legL.z = 0.05; TGT.legR.z = -0.05;
  if(frog) frog.root.position.set(CONFIG.lvl22.x, 0, 0);
  applyPose(dt);
}

function l22Camera(dt){
  camFollow(dt, CONFIG.lvl22.x + 1.6, 3.0, 1.85);
}

function updateLevel22(dt, now){
  const C = CONFIG.lvl22;
  L22.phaseT += dt;
  L22.flash = Math.max(0, L22.flash - dt);
  if(L22.active && !L22.done){
    L22.elapsed += dt;
    const wind = Math.sin(now * 0.0019) * 0.55 + Math.sin(now * 0.0043) * 0.22;
    const input = (L22.holdL ? -1 : 0) + (L22.holdR ? 1 : 0);
    L22.kx += (wind + input * C.push) * dt;
    L22.kx = Math.max(C.center - C.drift - 1.2, Math.min(C.center + C.drift + 1.2, L22.kx));
    const inside = Math.abs(L22.kx - C.center) <= C.zone;
    if(!inside && L22.inZone){
      L22.misses++;
      L22.flash = 0.5;
      Sfx.thud();
      updateL22HUD();
      l22SetTask('风筝飘出绿框了，快拉回来');
    }
    L22.inZone = inside;
    if(L22.elapsed >= C.time){ l22Win(); }
  }
  if(L22.kite){
    L22.kite.position.x = L22.kx;
    L22.kite.position.y = 2.9 + Math.sin(now * 0.0032) * 0.08;
    L22.kite.rotation.z = Math.sin(now * 0.0022) * 0.18;
    L22.kite.rotation.y = Math.sin(now * 0.0016) * 0.25;
  }
  if(L22.line){
    const p = L22.line.geometry.attributes.position;
    p.setXYZ(0, C.x + 0.15, 1.25, 0.2);
    p.setXYZ(1, L22.kx, 2.9, 0.12);
    p.needsUpdate = true;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L22.elapsed / C.time * 100).toFixed(1) + '%';
  updateL22HUD();
  l22Pose(dt, now);
  l22Camera(dt);
}

// ============================================================
// 第二十三关：过闸机
//
// 每道闸机上有一盏灯：左边黄灯亮 = 按左脚，右边蓝灯亮 = 按右脚。
// 按对闸门升起，奶蛙通过；按错会被挡回来。一共 8 道闸机。
// ============================================================
const L23 = {
  active: false, done: false, phase: 'walk', phaseT: 0,
  idx: 0, sides: [], fx: 0, fromX: 0, toX: 0, stepT: 1,
  misses: 0, elapsed: 0, props: null, gates: [], panels: [], lamps: [],
  hud: '', task: '', seqKey: '',
};
window.__l23 = L23;

function l23SetTask(t){
  if(!t || L23.task === t) return;
  L23.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL23HUD(){
  const key = L23.elapsed.toFixed(1) + '/' + L23.idx + '/' + L23.misses;
  if(key === L23.hud) return;
  L23.hud = key;
  if(el.l2Time) el.l2Time.textContent = L23.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L23.idx + '/' + CONFIG.lvl23.gates;
  if(el.l2Miss) el.l2Miss.textContent = L23.misses;
}

function l23RenderSeq(){
  if(!el.l5Seq) return;
  const key = L23.idx + '/' + L23.sides.join('');
  if(key === L23.seqKey) return;
  L23.seqKey = key;
  const parts = [];
  for(let i = L23.idx; i < Math.min(L23.sides.length, L23.idx + 5); i++){
    let cls = 'l5chip foot';
    if(i === L23.idx) cls += ' now';
    parts.push('<span class="' + cls + '">' + (L23.sides[i] ? '蓝灯 · 右脚' : '黄灯 · 左脚') + '</span>');
    if(i < Math.min(L23.sides.length, L23.idx + 5) - 1) parts.push('<i class="l5arrow">·</i>');
  }
  el.l5Seq.innerHTML = parts.join('');
}

function buildL23Props(){
  if(L23.props) return L23.props;
  const C = CONFIG.lvl23;
  const g = new THREE.Group();
  for(let i = 0; i < C.gates; i++){
    const gx = C.x + (i + 1) * C.gap;
    const gate = new THREE.Group();
    addBox(0.09, 1.78, 0.09, 0x3c4a5e, gx, 0.89, -0.78, gate);
    addBox(0.09, 1.78, 0.09, 0x3c4a5e, gx, 0.89, 0.78, gate);
    addBox(0.09, 0.10, 1.65, 0x3c4a5e, gx, 1.73, 0, gate);
    const panel = addBox(1.00, 0.92, 0.07, 0xe8505a, gx, 0.96, 0, gate);
    addBox(1.00, 0.10, 0.10, 0xc83b48, gx, 1.42, 0, gate);
    const lampL = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x4d4420 })
    );
    lampL.position.set(gx - 0.56, 1.58, -0.08);
    gate.add(lampL);
    const lampR = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x2c3646 })
    );
    lampR.position.set(gx + 0.56, 1.58, -0.08);
    gate.add(lampR);
    gate.position.x = 0;
    g.add(gate);
    L23.gates.push(gate);
    L23.panels.push(panel);
    L23.lamps.push({ L: lampL, R: lampR });
  }
  g.visible = false;
  scene.add(g);
  L23.props = g;
  return g;
}

function l23ResetGates(){
  for(let i = 0; i < L23.panels.length; i++){
    L23.panels[i].position.y = 0.96;
    L23.lamps[i].L.material.color.setHex(0x4d4420);
    L23.lamps[i].R.material.color.setHex(0x2c3646);
  }
}

function startLevel23(){
  const C = CONFIG.lvl23;
  resetAllLevels();
  L23.active = true; L23.done = false;
  L23.phase = 'walk'; L23.phaseT = 0;
  L23.idx = 0; L23.misses = 0; L23.elapsed = 0;
  L23.fx = C.x; L23.fromX = C.x; L23.toX = C.x; L23.stepT = 1;
  L23.sides = [];
  for(let i = 0; i < C.gates; i++){
    let side = Math.random() < 0.5 ? 0 : 1;
    if(i >= 2 && L23.sides[i - 1] === L23.sides[i - 2]) side = 1 - L23.sides[i - 1];
    L23.sides.push(side);
  }
  L23.hud = ''; L23.task = ''; L23.seqKey = '';
  buildL23Props().visible = true;
  l23ResetGates();

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level23');
  setSky(0xcfeaff);
  setLabels('用时', '闸机');
  setBtnText(el.footL, '←', '左脚');
  setBtnText(el.footR, '→', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.4; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l23SetTask('看闸机上的灯：黄灯按左脚，蓝灯按右脚');
  l23RenderSeq();
  updateL23HUD();
  Sfx.init();
}

function resetL23Scene(){
  document.body.classList.remove('level23');
  L23.active = false; L23.done = false;
  if(L23.props) L23.props.visible = false;
  L23.hud = ''; L23.task = ''; L23.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l23Miss(){
  if(L23.done) return;
  L23.misses++;
  L23.phase = 'miss'; L23.phaseT = 0;
  Sfx.thud();
  updateL23HUD();
  l23SetTask('按错了，灯亮哪边就按哪只脚');
}

function l23Step(side){
  if(G.level !== 23 || !L23.active || L23.done) return;
  const C = CONFIG.lvl23;
  if(L23.phase !== 'walk' || L23.stepT < 1) return;
  const want = L23.sides[L23.idx] ? 'R' : 'L';
  if(side !== want){ l23Miss(); return; }
  const gx = C.x + (L23.idx + 1) * C.gap;
  L23.fromX = L23.fx;
  L23.toX = gx + 0.30;
  L23.stepT = 0;
  L23.phase = 'step'; L23.phaseT = 0;
  L23.panels[L23.idx].position.y = 1.92;
  Sfx.step(); Sfx.tick(true);
  l23SetTask('通过！下一道');
}

function l23Win(){
  if(L23.done) return;
  L23.done = true; L23.active = false;
  Sfx.win();
  l23SetTask('🎉 八道闸机全部通过！');
  const used = L23.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🚪 闸机全通过！',
      '用时 <b>' + used + '</b> 秒 · 按错 <b>' + L23.misses + '</b> 次', '再过一次');
  }, 1500);
}

function l23Pose(dt, now){
  baseTargets();
  const t = now * 0.0025;
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.34 + Math.sin(t) * 0.10;
  TGT.armR.z = -0.34 - Math.sin(t) * 0.10;
  TGT.legL.z = 0.08; TGT.legR.z = -0.08;
  if(L23.stepT < 1){
    const s = Math.sin(Math.PI * L23.stepT);
    TGT.legL.z = -0.28 * s; TGT.legR.z = -0.28 * s;
    TGT.spine.x = 0.08 * s;
  }else if(L23.phase === 'miss'){
    const s = Math.sin(Math.PI * Math.min(1, L23.phaseT / 0.4));
    BTGT.rz = 0.30 * s;
  }
  if(frog) frog.root.position.set(L23.fx, 0, 0);
  applyPose(dt);
}

function l23Camera(dt){
  camFollow(dt, L23.fx + 1.4, 2.6, 1.35);
}

function updateLevel23(dt, now){
  const C = CONFIG.lvl23;
  L23.phaseT += dt;
  if(L23.active && !L23.done) L23.elapsed += dt;

  if(L23.phase === 'step' && L23.stepT < 1){
    L23.stepT = Math.min(1, L23.stepT + dt / C.stepT);
    L23.fx = L23.fromX + (L23.toX - L23.fromX) * L23.stepT;
    if(L23.stepT >= 1){
      L23.idx++;
      updateL23HUD();
      l23RenderSeq();
      if(L23.idx >= C.gates){ l23Win(); }
      else{
        L23.phase = 'walk'; L23.phaseT = 0;
        l23SetTask('看下一道闸机的灯');
      }
    }
  }else if(L23.phase === 'miss' && L23.phaseT >= 0.4){
    L23.phase = 'walk'; L23.phaseT = 0;
    l23SetTask('看闸机上的灯：黄灯按左脚，蓝灯按右脚');
  }

  for(let i = 0; i < L23.lamps.length; i++){
    const next = i === L23.idx && !L23.done;
    L23.lamps[i].L.material.color.setHex(next && L23.sides[i] === 0 ? 0xffd93d : 0x4d4420);
    L23.lamps[i].R.material.color.setHex(next && L23.sides[i] === 1 ? 0x3d8bf0 : 0x2c3646);
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L23.idx / C.gates * 100).toFixed(1) + '%';
  updateL23HUD();
  l23Pose(dt, now);
  l23Camera(dt);
}

// ============================================================
// 第二十四关：冲刺赛跑
//
// 左右脚交替猛踩，一下一下往前冲，20 步冲过终点线。
// 同一只脚连踩两次会绊一下，耽误时间。
// ============================================================
const L24 = {
  active: false, done: false, phase: 'run', phaseT: 0,
  n: 0, misses: 0, elapsed: 0, lastSide: '', stumbleT: 0,
  hopT: 1, fx: 0, fromX: 0, toX: 0,
  props: null, hud: '', task: '',
};
window.__l24 = L24;

function l24SetTask(t){
  if(!t || L24.task === t) return;
  L24.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL24HUD(){
  const key = L24.elapsed.toFixed(1) + '/' + L24.n + '/' + L24.misses;
  if(key === L24.hud) return;
  L24.hud = key;
  if(el.l2Time) el.l2Time.textContent = L24.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L24.n + '/' + CONFIG.lvl24.steps;
  if(el.l2Miss) el.l2Miss.textContent = L24.misses;
}

function buildL24Props(){
  if(L24.props) return L24.props;
  const C = CONFIG.lvl24;
  const g = new THREE.Group();
  const finish = C.x + C.steps * C.stepLen;
  // 终点线 + 终点旗
  for(let i = 0; i < 8; i++){
    addBox(0.28, 0.02, 0.52, i % 2 ? 0xffffff : 0x2c3646, finish, 0.012, -1.75 + i * 0.50, g);
  }
  addBox(0.09, 2.2, 0.09, 0x3c4a5e, finish, 1.10, -1.90, g);
  addBox(0.09, 2.2, 0.09, 0x3c4a5e, finish, 1.10, 1.90, g);
  addBox(0.02, 0.62, 3.80, 0xe8505a, finish, 1.85, 0, g);
  // 距标
  for(let i = 2; i < C.steps; i += 3){
    addBox(0.22, 0.02, 0.30, 0xf3f6fb, C.x + i * C.stepLen, 0.012, 1.95, g);
  }
  g.visible = false;
  scene.add(g);
  L24.props = g;
  return g;
}

function startLevel24(){
  const C = CONFIG.lvl24;
  resetAllLevels();
  L24.active = true; L24.done = false;
  L24.phase = 'run'; L24.phaseT = 0;
  L24.n = 0; L24.misses = 0; L24.elapsed = 0;
  L24.lastSide = ''; L24.stumbleT = 0;
  L24.hopT = 1; L24.fx = C.x; L24.fromX = C.x; L24.toX = C.x;
  L24.hud = ''; L24.task = '';
  buildL24Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level24');
  setSky(0xbfe7ff);
  setLabels('用时', '步数');
  setBtnText(el.footL, '左', '左脚');
  setBtnText(el.footR, '右', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l24SetTask('左右脚交替猛踩，冲向终点线！');
  updateL24HUD();
  Sfx.init();
}

function resetL24Scene(){
  document.body.classList.remove('level24');
  L24.active = false; L24.done = false;
  if(L24.props) L24.props.visible = false;
  L24.hud = ''; L24.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l24Step(side){
  if(G.level !== 24 || !L24.active || L24.done) return;
  const C = CONFIG.lvl24;
  if(L24.stumbleT > 0 || L24.hopT < 1) return;
  if(side === L24.lastSide){
    L24.misses++;
    L24.stumbleT = C.stumble;
    Sfx.thud();
    updateL24HUD();
    l24SetTask('同一只脚连踩，绊了一下');
    return;
  }
  L24.n++;
  L24.lastSide = side;
  L24.fromX = L24.fx;
  L24.toX = C.x + L24.n * C.stepLen;
  L24.hopT = 0;
  Sfx.step();
  updateL24HUD();
  if(L24.n >= C.steps){ l24Win(); return; }
  l24SetTask('保持交替，越快越好！');
}

function l24Win(){
  if(L24.done) return;
  L24.done = true; L24.active = false;
  Sfx.win();
  l24SetTask('🎉 冲过终点线！');
  const used = L24.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏁 冲刺完成！',
      '用时 <b>' + used + '</b> 秒 · 绊倒 <b>' + L24.misses + '</b> 次', '再跑一次');
  }, 1500);
}

function l24Pose(dt, now){
  baseTargets();
  const t = now * 0.006;
  TGT.spine.x = 0.12;
  TGT.head.x = -0.06;
  TGT.armL.z = 0.45 + Math.sin(t) * 0.30;
  TGT.armR.z = -0.45 - Math.sin(t) * 0.30;
  TGT.legL.z = 0.30 + Math.sin(t) * 0.28;
  TGT.legR.z = -0.30 - Math.sin(t) * 0.28;
  if(L24.stumbleT > 0){
    const s = Math.sin(Math.PI * Math.min(1, L24.stumbleT / CONFIG.lvl24.stumble));
    BTGT.rz = 0.42 * s;
    TGT.spine.x = 0.30 * s + 0.10;
  }
  if(frog) frog.root.position.set(L24.fx, L24.hopT < 1 ? Math.sin(Math.PI * L24.hopT) * 0.12 : 0, 0);
  applyPose(dt);
}

function l24Camera(dt){
  camFollow(dt, L24.fx + 1.05, 2.5, 1.30);
}

function updateLevel24(dt, now){
  const C = CONFIG.lvl24;
  L24.phaseT += dt;
  if(L24.active && !L24.done) L24.elapsed += dt;
  L24.stumbleT = Math.max(0, L24.stumbleT - dt);
  if(L24.hopT < 1){
    L24.hopT = Math.min(1, L24.hopT + dt / C.hopT);
    L24.fx = L24.fromX + (L24.toX - L24.fromX) * L24.hopT;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L24.n / C.steps * 100).toFixed(1) + '%';
  updateL24HUD();
  l24Pose(dt, now);
  l24Camera(dt);
}

// ============================================================
// 第二十五关：摆毕业照
//
// 摄影师喊出姿势：同时按住指定的两三个部位，坚持 1.25 秒。
// 一共 6 个姿势，全部摆对就能拍毕业照。
// ============================================================
const L25 = {
  active: false, done: false, phase: 'hold', phaseT: 0,
  poseIdx: 0, percent: 0, held: {}, misses: 0, elapsed: 0,
  gapT: 0, flash: {}, props: null, pads: {},
  hud: '', task: '', seqKey: '',
};
window.__L25 = L25;
window.__l25 = L25;

const L25_POSES = [
  ['HL', 'HR'],
  ['FL', 'FR'],
  ['HL', 'FL'],
  ['HR', 'FR'],
  ['HL', 'HR', 'FL'],
  ['HL', 'HR', 'FL', 'FR'],
];

function l25SetTask(t){
  if(!t || L25.task === t) return;
  L25.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL25HUD(){
  const key = L25.elapsed.toFixed(1) + '/' + L25.poseIdx + '/' + L25.misses;
  if(key === L25.hud) return;
  L25.hud = key;
  if(el.l2Time) el.l2Time.textContent = L25.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L25.poseIdx + '/' + CONFIG.lvl25.poses;
  if(el.l2Miss) el.l2Miss.textContent = L25.misses;
}

function l25RenderSeq(){
  if(!el.l5Seq) return;
  const pose = L25_POSES[Math.min(L25.poseIdx, L25_POSES.length - 1)];
  const key = L25.poseIdx + '/' + pose.join('');
  if(key === L25.seqKey) return;
  L25.seqKey = key;
  el.l5Seq.innerHTML = pose.map((code)=>{
    const on = L25.held[code] ? ' now' : '';
    return '<span class="l5chip ' + (code[0] === 'H' ? 'hand' : 'foot') + on + '">' + L5_LIMB[code] + '</span>';
  }).join('<i class="l5arrow">＋</i>');
}

function buildL25Props(){
  if(L25.props) return L25.props;
  const C = CONFIG.lvl25;
  const g = new THREE.Group();
  const offs = { HL: -1.30, FL: -0.45, HR: 0.45, FR: 1.30 };
  for(const code in offs){
    const mat = new THREE.MeshLambertMaterial({ color: L8_COLORS[code], emissive: L8_COLORS[code], emissiveIntensity: 0.10 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.52), mat);
    pad.position.set(C.x + offs[code], 0.05, -0.80);
    g.add(pad);
    L25.pads[code] = pad;
    L25.flash[code] = 0;
  }
  // 领奖台 + 相机
  addBox(1.10, 0.24, 0.60, 0xbfc7d2, C.x + 1.95, 0.12, -1.25, g);
  addBox(0.70, 0.24, 0.60, 0xc89b63, C.x + 1.35, 0.24, -1.25, g);
  addBox(0.70, 0.24, 0.60, 0xc89b63, C.x + 2.55, 0.24, -1.25, g);
  addBox(0.09, 0.90, 0.09, 0x3c4a5e, C.x + 3.10, 0.45, -1.55, g);
  addBox(0.34, 0.24, 0.24, 0x2c3646, C.x + 3.10, 1.00, -1.55, g);
  g.visible = false;
  scene.add(g);
  L25.props = g;
  return g;
}

function l25Pick(){
  const C = CONFIG.lvl25;
  L25.percent = 0; L25.phase = 'hold'; L25.phaseT = 0;
  L25.held = {};
  for(const code in L25.flash) L25.flash[code] = 0;
  L25.seqKey = '';
  const pose = L25_POSES[L25.poseIdx];
  l25SetTask('姿势 ' + (L25.poseIdx + 1) + '：同时按住 ' + pose.map(c=>L5_LIMB[c]).join(' + '));
  l25RenderSeq();
}

function startLevel25(){
  const C = CONFIG.lvl25;
  resetAllLevels();
  L25.active = true; L25.done = false;
  L25.phase = 'hold'; L25.phaseT = 0;
  L25.poseIdx = 0; L25.percent = 0; L25.held = {};
  L25.misses = 0; L25.elapsed = 0; L25.gapT = 0;
  L25.hud = ''; L25.task = ''; L25.seqKey = '';
  buildL25Props().visible = true;
  for(const code in L25.pads) L25.pads[code].material.emissiveIntensity = 0.10;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level25');
  setSky(0xd6ecff);
  setLabels('用时', '姿势');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l25Pick();
  updateL25HUD();
  Sfx.init();
}

function resetL25Scene(){
  document.body.classList.remove('level25');
  L25.active = false; L25.done = false;
  L25.held = {}; L25.percent = 0;
  if(L25.props) L25.props.visible = false;
  for(const code in L25.flash) L25.flash[code] = 0;
  L25.hud = ''; L25.task = ''; L25.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l25RequiredHeld(){
  const pose = L25_POSES[L25.poseIdx];
  if(!pose) return false;
  for(const code of pose) if(!L25.held[code]) return false;
  return true;
}

function l25Down(code){
  if(G.level !== 25 || !L25.active || L25.done) return;
  if(L25.phase === 'gap') return;
  L25.held[code] = true;
  L25.flash[code] = 0.30;
  const pose = L25_POSES[L25.poseIdx];
  if(!pose || !pose.includes(code)){
    L25.misses++;
    L25.percent = 0;
    Sfx.thud();
    updateL25HUD();
    l25SetTask('按错部位了，这个姿势重来');
    l25RenderSeq();
    return;
  }
  if(l25RequiredHeld()){
    L25.phase = 'holding';
    l25SetTask('保持住，别松手！');
  }
  l25RenderSeq();
}

function l25Up(code){
  if(G.level !== 25 || !L25.active || L25.done) return;
  L25.held[code] = false;
  if(L25.phase === 'holding') L25.phase = 'hold';
  if(L25.phase === 'hold' && L25.percent > 0) l25SetTask('松手了，快按住继续');
  l25RenderSeq();
}

function l25Win(){
  if(L25.done) return;
  L25.done = true; L25.active = false;
  Sfx.win();
  l25SetTask('📸 毕业照拍好啦！');
  const used = L25.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('📸 毕业照完成！',
      '用时 <b>' + used + '</b> 秒 · 按错 <b>' + L25.misses + '</b> 次', '再摆一次');
  }, 1500);
}

function l25Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.03;
  TGT.head.x = -0.04;
  TGT.armL.z = 0.22 + Math.sin(t) * 0.06;
  TGT.armR.z = -0.22 - Math.sin(t) * 0.06;
  TGT.legL.z = 0.05; TGT.legR.z = -0.05;
  for(const code in L25.flash){
    const f = L25.flash[code] || 0;
    if(f <= 0) continue;
    const s = Math.sin(Math.PI * Math.min(1, f / 0.30));
    if(code === 'HL') TGT.armL.z += 0.80 * s;
    else if(code === 'HR') TGT.armR.z -= 0.80 * s;
    else if(code === 'FL') TGT.legL.z += 0.40 * s;
    else if(code === 'FR') TGT.legR.z -= 0.40 * s;
  }
  if(frog) frog.root.position.set(CONFIG.lvl25.x, 0, 0);
  applyPose(dt);
}

function l25Camera(dt){
  camFollow(dt, CONFIG.lvl25.x + 1.15, 2.5, 1.35);
}

function updateLevel25(dt, now){
  const C = CONFIG.lvl25;
  L25.phaseT += dt;
  if(L25.active && !L25.done) L25.elapsed += dt;

  for(const code in L25.pads){
    const f = Math.max(0, (L25.flash[code] || 0) - dt);
    L25.flash[code] = f;
    if(f > 0) L25.pads[code].material.emissiveIntensity = 1.0;
    else L25.pads[code].material.emissiveIntensity = (L25.held[code] ? 0.55 : 0.10);
  }

  if(L25.active && !L25.done){
    if(L25.phase === 'gap'){
      L25.gapT += dt;
      if(L25.gapT >= C.gap){
        L25.gapT = 0;
        l25Pick();
      }
    }else{
      const all = l25RequiredHeld();
      if(all){
        if(L25.phase !== 'holding') L25.phase = 'holding';
        L25.percent = Math.min(1, L25.percent + dt / C.hold);
      }else if(L25.phase === 'holding'){
        L25.phase = 'hold';
      }
      if(!all && L25.percent > 0) L25.percent = Math.max(0, L25.percent - dt * 0.10);
      if(L25.percent >= 1){
        L25.poseIdx++;
        L25.percent = 0;
        L25.held = {};
        Sfx.perfect();
        updateL25HUD();
        l25RenderSeq();
        if(L25.poseIdx >= C.poses){ l25Win(); }
        else{
          L25.phase = 'gap'; L25.gapT = 0;
          l25SetTask('这个姿势过关！准备下一个');
        }
      }
    }
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L25.percent * 100).toFixed(1) + '%';
  updateL25HUD();
  l25Pose(dt, now);
  l25Camera(dt);
}

// ============================================================
// 第二十六关：打灯笼夜行
//
// 天黑了，要双手举着灯笼照亮路，同时左右脚交替往前走 10 步。
// 手一松灯笼就灭，看不见路，迈步会踩空。
// ============================================================
const L26 = {
  active: false, done: false, phase: 'walk', phaseT: 0,
  steps: 0, misses: 0, elapsed: 0, hopT: 1,
  fx: 0, fromX: 0, toX: 0, holdL: false, holdR: false,
  props: null, lantern: null, glow: null, hud: '', task: '',
};
window.__l26 = L26;

function l26SetTask(t){
  if(!t || L26.task === t) return;
  L26.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL26HUD(){
  const key = L26.elapsed.toFixed(1) + '/' + L26.steps + '/' + L26.misses;
  if(key === L26.hud) return;
  L26.hud = key;
  if(el.l2Time) el.l2Time.textContent = L26.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L26.steps + '/' + CONFIG.lvl26.steps;
  if(el.l2Miss) el.l2Miss.textContent = L26.misses;
}

function buildL26Props(){
  if(L26.props) return L26.props;
  const C = CONFIG.lvl26;
  const g = new THREE.Group();
  // 路边的路灯
  for(const lx of [C.x + 1.5, C.x + 4.0, C.x + 6.5, C.x + 9.0]){
    addBox(0.07, 1.85, 0.07, 0x2c3646, lx, 0.92, -1.65, g);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe08a })
    );
    bulb.position.set(lx, 1.86, -1.65);
    g.add(bulb);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.30, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.18, depthWrite: false })
    );
    halo.position.copy(bulb.position);
    g.add(halo);
  }
  // 灯笼
  const lantern = new THREE.Group();
  addBox(0.045, 0.44, 0.045, 0x8a4513, 0, 0.30, 0, lantern);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.19, 0.30, 14),
    new THREE.MeshBasicMaterial({ color: 0xff6b4a })
  );
  body.position.y = 0.55;
  lantern.add(body);
  addBox(0.20, 0.04, 0.20, 0x8a4513, 0, 0.43, 0, lantern);
  addBox(0.16, 0.03, 0.16, 0xffd93d, 0, 0.74, 0, lantern);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, depthWrite: false })
  );
  glow.position.y = 0.55;
  lantern.add(glow);
  lantern.position.set(C.x + 0.25, 1.55, 0.25);
  g.add(lantern);
  L26.lantern = lantern;
  L26.glow = glow;
  g.visible = false;
  scene.add(g);
  L26.props = g;
  return g;
}

function startLevel26(){
  const C = CONFIG.lvl26;
  resetAllLevels();
  L26.active = true; L26.done = false;
  L26.phase = 'walk'; L26.phaseT = 0;
  L26.steps = 0; L26.misses = 0; L26.elapsed = 0;
  L26.hopT = 1; L26.fx = C.x; L26.fromX = C.x; L26.toX = C.x;
  L26.holdL = false; L26.holdR = false;
  L26.hud = ''; L26.task = '';
  buildL26Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level26');
  setSky(0x141d33);
  setNight(true);
  setLabels('用时', '夜路');
  setBtnText(el.btnL, '↑', '举左手');
  setBtnText(el.btnR, '↑', '举右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.9; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l26SetTask('双手举着灯笼，左右脚交替往前走');
  updateL26HUD();
  Sfx.init();
}

function resetL26Scene(){
  document.body.classList.remove('level26');
  setNight(false);
  L26.active = false; L26.done = false;
  L26.holdL = false; L26.holdR = false;
  if(L26.props) L26.props.visible = false;
  L26.hud = ''; L26.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l26Hand(side, down){
  if(G.level !== 26 || !L26.active || L26.done) return;
  if(side === 'L') L26.holdL = !!down;
  else L26.holdR = !!down;
}

function l26Miss(reason){
  if(L26.done) return;
  L26.misses++;
  Sfx.thud();
  updateL26HUD();
  l26SetTask(reason + '，先举好灯笼');
}

function l26Step(side){
  if(G.level !== 26 || !L26.active || L26.done) return;
  const C = CONFIG.lvl26;
  if(L26.hopT < 1) return;
  if(!(L26.holdL && L26.holdR)){ l26Miss('灯笼放下了'); return; }
  const want = L26.steps % 2 === 0 ? 'L' : 'R';
  if(side !== want){ l26Miss('迈错了脚'); return; }
  L26.steps++;
  L26.fromX = L26.fx;
  L26.toX = C.x + L26.steps * C.stepLen;
  L26.hopT = 0;
  Sfx.step(); Sfx.tick(true);
  updateL26HUD();
  if(L26.steps >= C.steps){ l26Win(); return; }
  l26SetTask('灯笼举稳，继续走');
}

function l26Win(){
  if(L26.done) return;
  L26.done = true; L26.active = false;
  Sfx.win();
  l26SetTask('🎉 提着灯笼走过夜路！');
  const used = L26.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏮 夜路走完啦！',
      '用时 <b>' + used + '</b> 秒 · 踩空 <b>' + L26.misses + '</b> 次', '再走一次');
  }, 1500);
}

function l26Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  const hopY = L26.hopT < 1 ? Math.sin(Math.PI * L26.hopT) * 0.16 : 0;
  TGT.spine.x = 0.05;
  TGT.head.x = -0.05;
  TGT.armL.z = L26.holdL ? 1.25 : 0.25;
  TGT.armR.z = L26.holdR ? -1.25 : -0.25;
  TGT.legL.z = 0.08 + Math.sin(t) * 0.06;
  TGT.legR.z = -0.08 - Math.sin(t) * 0.06;
  if(frog) frog.root.position.set(L26.fx, hopY, 0);
  applyPose(dt);
}

function l26Camera(dt){
  camFollow(dt, L26.fx + 0.95, 2.5, 1.35);
}

function updateLevel26(dt, now){
  const C = CONFIG.lvl26;
  L26.phaseT += dt;
  if(L26.active && !L26.done) L26.elapsed += dt;
  if(L26.hopT < 1){
    L26.hopT = Math.min(1, L26.hopT + dt / C.hopT);
    L26.fx = L26.fromX + (L26.toX - L26.fromX) * L26.hopT;
  }
  if(L26.lantern){
    L26.lantern.position.set(L26.fx + 0.25, 1.55 + Math.sin(now * 0.004) * 0.05, 0.25);
    if(L26.glow) L26.glow.material.opacity = (L26.holdL && L26.holdR) ? 0.18 : 0.04;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L26.steps / C.steps * 100).toFixed(1) + '%';
  updateL26HUD();
  l26Pose(dt, now);
  l26Camera(dt);
}

// ============================================================
// 第二十七关：跳房子
//
// 地上画着一排格子：黄格左脚、蓝格右脚、绿格要双脚同时跳。
// 按对应的脚跳进下一格，连跳 10 格。
// ============================================================
const L27 = {
  active: false, done: false, phase: 'walk', phaseT: 0,
  idx: 0, sides: [], fx: 0, fromX: 0, toX: 0, hopT: 1, jumpY: 0,
  firstSide: '', firstAt: 0, misses: 0, elapsed: 0,
  props: null, squares: [], hud: '', task: '', seqKey: '',
};
window.__l27 = L27;

function l27SetTask(t){
  if(!t || L27.task === t) return;
  L27.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL27HUD(){
  const key = L27.elapsed.toFixed(1) + '/' + L27.idx + '/' + L27.misses;
  if(key === L27.hud) return;
  L27.hud = key;
  if(el.l2Time) el.l2Time.textContent = L27.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L27.idx + '/' + CONFIG.lvl27.squares;
  if(el.l2Miss) el.l2Miss.textContent = L27.misses;
}

function l27RenderSeq(){
  if(!el.l5Seq) return;
  const key = L27.idx + '/' + L27.sides.join('');
  if(key === L27.seqKey) return;
  L27.seqKey = key;
  const labels = ['左脚 · 黄格', '右脚 · 蓝格', '双脚 · 绿格'];
  const parts = [];
  for(let i = L27.idx; i < Math.min(L27.sides.length, L27.idx + 5); i++){
    let cls = 'l5chip foot';
    if(i === L27.idx) cls += ' now';
    parts.push('<span class="' + cls + '">' + labels[L27.sides[i]] + '</span>');
    if(i < Math.min(L27.sides.length, L27.idx + 5) - 1) parts.push('<i class="l5arrow">→</i>');
  }
  el.l5Seq.innerHTML = parts.join('');
}

const L27_COLORS = [0xffd93d, 0x3d8bf0, 0x3ddc84];

function buildL27Props(){
  if(L27.props) return L27.props;
  const C = CONFIG.lvl27;
  const g = new THREE.Group();
  for(let i = 0; i < C.squares; i++){
    const side = (i % 4 === 3) ? 2 : (i % 2 ? 1 : 0);
    const x = C.x + (i + 1) * C.gap;
    const z = side === 2 ? 0 : (side ? 0.26 : -0.26);
    addBox(0.48, 0.02, 0.48, L27_COLORS[side], x, 0.015, z, g);
    addBox(0.52, 0.01, 0.52, 0xffffff, x, 0.008, z, g);
  }
  g.visible = false;
  scene.add(g);
  L27.props = g;
  return g;
}

function startLevel27(){
  const C = CONFIG.lvl27;
  resetAllLevels();
  L27.active = true; L27.done = false;
  L27.phase = 'walk'; L27.phaseT = 0;
  L27.idx = 0; L27.misses = 0; L27.elapsed = 0;
  L27.fx = C.x; L27.fromX = C.x; L27.toX = C.x;
  L27.hopT = 1; L27.jumpY = 0;
  L27.firstSide = ''; L27.firstAt = 0;
  L27.sides = [];
  for(let i = 0; i < C.squares; i++) L27.sides.push((i % 4 === 3) ? 2 : (i % 2 ? 1 : 0));
  L27.hud = ''; L27.task = ''; L27.seqKey = '';
  buildL27Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level27');
  setSky(0xcfeaff);
  setLabels('用时', '格子');
  setBtnText(el.footL, '←', '左脚');
  setBtnText(el.footR, '→', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.9; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l27SetTask('黄格左脚、蓝格右脚、绿格双脚同时跳');
  l27RenderSeq();
  updateL27HUD();
  Sfx.init();
}

function resetL27Scene(){
  document.body.classList.remove('level27');
  L27.active = false; L27.done = false;
  if(L27.props) L27.props.visible = false;
  L27.hud = ''; L27.task = ''; L27.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l27Miss(reason){
  if(L27.done) return;
  L27.misses++;
  L27.firstSide = ''; L27.firstAt = 0;
  Sfx.thud();
  updateL27HUD();
  l27SetTask(reason + '，看清楚格子颜色');
}

function l27Success(){
  const C = CONFIG.lvl27;
  const side = L27.sides[L27.idx];
  L27.fromX = L27.fx;
  L27.toX = C.x + (L27.idx + 1) * C.gap;
  L27.hopT = 0;
  L27.phase = 'jump'; L27.phaseT = 0;
  L27.firstSide = ''; L27.firstAt = 0;
  Sfx.step(); Sfx.tick(true);
}

function l27StepFoot(side){
  if(G.level !== 27 || !L27.active || L27.done) return;
  if(L27.phase !== 'walk' || L27.hopT < 1) return;
  const need = L27.sides[L27.idx];
  if(need === 2){
    if(!L27.firstSide){
      L27.firstSide = side;
      L27.firstAt = performance.now();
      l27SetTask('再按另一只脚，双脚一起跳');
      return;
    }
    if(side === L27.firstSide){ l27Miss('要两只脚一起按'); return; }
    if(performance.now() - L27.firstAt <= CONFIG.lvl27.sync * 1000) l27Success();
    else l27Miss('两只脚没同时按');
    return;
  }
  if(side !== (need ? 'R' : 'L')){ l27Miss('踩错格子颜色了'); return; }
  l27Success();
}

function l27Win(){
  if(L27.done) return;
  L27.done = true; L27.active = false;
  Sfx.win();
  l27SetTask('🎉 十格全部跳完！');
  const used = L27.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏁 跳房子完成！',
      '用时 <b>' + used + '</b> 秒 · 踩错 <b>' + L27.misses + '</b> 次', '再跳一次');
  }, 1500);
}

function l27Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.36 + Math.sin(t) * 0.12;
  TGT.armR.z = -0.36 - Math.sin(t) * 0.12;
  TGT.legL.z = 0.08; TGT.legR.z = -0.08;
  if(L27.hopT < 1){
    const s = Math.sin(Math.PI * L27.hopT);
    TGT.legL.z = -0.35 * s; TGT.legR.z = -0.35 * s;
    TGT.armL.z = 0.25 + 0.55 * s; TGT.armR.z = -0.25 - 0.55 * s;
    TGT.spine.x = 0.10 * s;
  }
  if(frog) frog.root.position.set(L27.fx, L27.jumpY, 0);
  applyPose(dt);
}

function l27Camera(dt){
  camFollow(dt, L27.fx + 0.9, 2.4, 1.30);
}

function updateLevel27(dt, now){
  const C = CONFIG.lvl27;
  L27.phaseT += dt;
  if(L27.active && !L27.done) L27.elapsed += dt;
  if(L27.hopT < 1){
    L27.hopT = Math.min(1, L27.hopT + dt / C.hopT);
    L27.fx = L27.fromX + (L27.toX - L27.fromX) * L27.hopT;
    L27.jumpY = Math.sin(Math.PI * L27.hopT) * 0.40;
    if(L27.hopT >= 1){
      L27.jumpY = 0;
      L27.idx++;
      updateL27HUD();
      l27RenderSeq();
      if(L27.idx >= C.squares){ l27Win(); }
      else{
        L27.phase = 'walk'; L27.phaseT = 0;
        l27SetTask('下一格：' + ['左脚 · 黄格', '右脚 · 蓝格', '双脚 · 绿格'][L27.sides[L27.idx]]);
      }
    }
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L27.idx / C.squares * 100).toFixed(1) + '%';
  updateL27HUD();
  l27Pose(dt, now);
  l27Camera(dt);
}

// ============================================================
// 第二十八关：敲鼓节奏
//
// 光标从左往右扫，到绿区时按对应的手敲一下鼓。
// 左右手轮流，鼓点越来越快，一共 12 拍。
// ============================================================
const L28 = {
  active: false, done: false, phase: 'push', phaseT: 0,
  t: 0, hits: 0, misses: 0, elapsed: 0, stick: 0,
  props: null, stickL: null, stickR: null, hud: '', task: '',
};
window.__l28 = L28;

function l28SetTask(t){
  if(!t || L28.task === t) return;
  L28.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL28HUD(){
  const key = L28.elapsed.toFixed(1) + '/' + L28.hits + '/' + L28.misses;
  if(key === L28.hud) return;
  L28.hud = key;
  if(el.l2Time) el.l2Time.textContent = L28.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L28.hits + '/' + CONFIG.lvl28.beats;
  if(el.l2Miss) el.l2Miss.textContent = L28.misses;
}

function l28UpdateBar(){
  const C = CONFIG.lvl28;
  if(el.l7Zone){
    el.l7Zone.style.display = 'block';
    el.l7Zone.style.left = ((0.5 - C.winW / 2) * 100).toFixed(1) + '%';
    el.l7Zone.style.width = (C.winW * 100).toFixed(1) + '%';
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (Math.min(1, L28.t) * 100).toFixed(1) + '%';
}

function buildL28Props(){
  if(L28.props) return L28.props;
  const C = CONFIG.lvl28;
  const g = new THREE.Group();
  addBox(0.70, 0.16, 0.70, 0x6b7a86, C.x + 1.05, 0.08, 0, g);
  addBox(0.10, 0.55, 0.10, 0x3c4a5e, C.x + 1.05, 0.40, 0, g);
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.36, 16),
    new THREE.MeshLambertMaterial({ color: 0xe8505a })
  );
  drum.position.set(C.x + 1.05, 0.72, 0);
  drum.rotation.z = 0;
  g.add(drum);
  addBox(0.38, 0.03, 0.38, 0xf3f6fb, C.x + 1.05, 0.91, 0, g);
  const sl = addBox(0.34, 0.05, 0.05, 0xc89b63, C.x + 0.45, 1.25, -0.30, g);
  const sr = addBox(0.34, 0.05, 0.05, 0xc89b63, C.x + 0.45, 1.25, 0.30, g);
  sl.rotation.z = 0.35;
  sr.rotation.z = 0.35;
  L28.stickL = sl; L28.stickR = sr;
  g.visible = false;
  scene.add(g);
  L28.props = g;
  return g;
}

function startLevel28(){
  const C = CONFIG.lvl28;
  resetAllLevels();
  L28.active = true; L28.done = false;
  L28.phase = 'push'; L28.phaseT = 0; L28.t = 0;
  L28.hits = 0; L28.misses = 0; L28.elapsed = 0; L28.stick = 0;
  L28.hud = ''; L28.task = '';
  buildL28Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level28');
  setSky(0xdff0ff);
  setLabels('用时', '节拍');
  setBtnText(el.btnL, '←', '左手');
  setBtnText(el.btnR, '→', '右手');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.8; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l28UpdateBar();
  l28SetTask('光标到绿区时按对应的手敲鼓');
  updateL28HUD();
  Sfx.init();
}

function resetL28Scene(){
  document.body.classList.remove('level28');
  L28.active = false; L28.done = false;
  if(L28.props) L28.props.visible = false;
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  L28.hud = ''; L28.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l28Miss(reason){
  if(L28.done) return;
  L28.misses++;
  L28.phase = 'miss'; L28.phaseT = 0; L28.t = 0;
  Sfx.thud();
  updateL28HUD();
  l28UpdateBar();
  l28SetTask(reason);
}

function l28Hit(side){
  if(G.level !== 28 || !L28.active || L28.done) return;
  const C = CONFIG.lvl28;
  if(L28.phase !== 'push') return;
  const inWin = Math.abs(L28.t - 0.5) <= C.winW / 2;
  if(!inWin){ l28Miss('没卡进绿区，再来一拍'); return; }
  const want = L28.hits % 2 === 0 ? 'L' : 'R';
  if(side !== want){ l28Miss('要换另一只手'); return; }
  L28.hits++;
  L28.t = 0;
  L28.stick = 0.28;
  L28.phase = 'gap'; L28.phaseT = 0;
  Sfx.step(); Sfx.perfect();
  updateL28HUD();
  l28UpdateBar();
  if(L28.hits >= C.beats){ l28Win(); return; }
  l28SetTask('下一拍：' + ((L28.hits % 2 === 0) ? '左手' : '右手'));
}

function l28Win(){
  if(L28.done) return;
  L28.done = true; L28.active = false;
  Sfx.win();
  l28SetTask('🎉 十二拍全部敲准！');
  const used = L28.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🥁 鼓点全中！',
      '用时 <b>' + used + '</b> 秒 · 敲错 <b>' + L28.misses + '</b> 次', '再敲一轮');
  }, 1500);
}

function l28Pose(dt, now){
  baseTargets();
  const t = now * 0.0030;
  TGT.spine.x = 0.07;
  TGT.armL.z = 0.62 + Math.sin(t) * 0.08;
  TGT.armR.z = -0.62 - Math.sin(t) * 0.08;
  TGT.legL.z = 0.06; TGT.legR.z = -0.06;
  if(L28.stick > 0){
    const s = Math.sin(Math.PI * (1 - Math.min(1, L28.stick / 0.28)));
    TGT.armL.z += 0.55 * s;
    TGT.armR.z -= 0.55 * s;
    TGT.spine.x = 0.16 * s + 0.07;
  }
  if(frog) frog.root.position.set(CONFIG.lvl28.x, 0, 0);
  applyPose(dt);
}

function l28Camera(dt){
  camFollow(dt, CONFIG.lvl28.x + 0.8, 2.2, 1.25);
}

function updateLevel28(dt, now){
  const C = CONFIG.lvl28;
  L28.phaseT += dt;
  L28.stick = Math.max(0, L28.stick - dt);
  if(L28.active && !L28.done) L28.elapsed += dt;

  if(L28.active && !L28.done){
    if(L28.phase === 'push'){
      const p = Math.min(1, L28.hits / Math.max(1, C.beats - 1));
      const cycle = C.cycle0 + (C.cycle1 - C.cycle0) * p;
      L28.t += dt / cycle;
      if(L28.t >= 1){ l28Miss('光标跑过头了'); }
    }else if(L28.phase === 'gap' && L28.phaseT >= 0.25){
      L28.phase = 'push'; L28.phaseT = 0; L28.t = 0;
    }else if(L28.phase === 'miss' && L28.phaseT >= C.missHold){
      L28.phase = 'push'; L28.phaseT = 0; L28.t = 0;
    }
  }
  if(L28.stickL){
    L28.stickL.rotation.z = 0.35 + (L28.stick > 0 ? Math.sin(Math.PI * (L28.stick / 0.28)) * 0.65 : 0);
    L28.stickR.rotation.z = 0.35 + (L28.stick > 0 ? Math.sin(Math.PI * (L28.stick / 0.28)) * 0.65 : 0);
  }
  l28UpdateBar();
  updateL28HUD();
  l28Pose(dt, now);
  l28Camera(dt);
}

// ============================================================
// 第二十九关：跳绳
//
// 绳子从头顶甩到脚边，落到脚边时按脚跳起来。
// 连续跳 15 次，绳子越转越快。
// ============================================================
const L29 = {
  active: false, done: false, phase: 'swing', phaseT: 0,
  t: 0, jumps: 0, misses: 0, elapsed: 0, jumpT: 1,
  props: null, rope: null, ring: null, hud: '', task: '',
};
window.__l29 = L29;

function l29SetTask(t){
  if(!t || L29.task === t) return;
  L29.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL29HUD(){
  const key = L29.elapsed.toFixed(1) + '/' + L29.jumps + '/' + L29.misses;
  if(key === L29.hud) return;
  L29.hud = key;
  if(el.l2Time) el.l2Time.textContent = L29.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L29.jumps + '/' + CONFIG.lvl29.jumps;
  if(el.l2Miss) el.l2Miss.textContent = L29.misses;
}

function buildL29Props(){
  if(L29.props) return L29.props;
  const C = CONFIG.lvl29;
  const g = new THREE.Group();
  // 绳子
  const rope = addBox(0.05, 0.05, 1.45, 0xe8505a, C.x + 0.28, 0.95, 0, g);
  for(const hz of [-0.72, 0.72]){
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.20, 8),
      new THREE.MeshLambertMaterial({ color: 0xffd93d })
    );
    handle.position.set(C.x + 0.28, 0.95, hz);
    g.add(handle);
  }
  L29.rope = rope;
  // 脚下提示圈
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(C.x, 0.03, 0);
  g.add(ring);
  L29.ring = ring;
  g.visible = false;
  scene.add(g);
  L29.props = g;
  return g;
}

function startLevel29(){
  const C = CONFIG.lvl29;
  resetAllLevels();
  L29.active = true; L29.done = false;
  L29.phase = 'swing'; L29.phaseT = 0;
  L29.t = 0; L29.jumps = 0; L29.misses = 0; L29.elapsed = 0; L29.jumpT = 1;
  L29.hud = ''; L29.task = '';
  buildL29Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level29');
  setSky(0xbfe7ff);
  setLabels('用时', '跳过');
  setBtnText(el.footL, '↑', '起跳');
  setBtnText(el.footR, '↑', '起跳');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.6; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l29SetTask('绳子落到脚边时按脚跳起来');
  updateL29HUD();
  Sfx.init();
}

function resetL29Scene(){
  document.body.classList.remove('level29');
  L29.active = false; L29.done = false;
  if(L29.props) L29.props.visible = false;
  L29.hud = ''; L29.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l29Miss(reason){
  if(L29.done) return;
  L29.misses++;
  L29.t = 0;
  Sfx.thud();
  updateL29HUD();
  l29SetTask(reason);
}

function l29Jump(){
  if(G.level !== 29 || !L29.active || L29.done) return;
  const C = CONFIG.lvl29;
  if(L29.phase !== 'swing') return;
  if(Math.abs(L29.t - 0.5) <= C.window){
    L29.jumps++;
    L29.phase = 'jump'; L29.phaseT = 0; L29.jumpT = 0;
    L29.t = 0;
    Sfx.step(); Sfx.perfect();
    updateL29HUD();
    if(L29.jumps >= C.jumps){ l29Win(); return; }
    l29SetTask('跳过去了，继续');
  }else{
    l29Miss('时机不对，等绳子落到脚边');
  }
}

function l29Win(){
  if(L29.done) return;
  L29.done = true; L29.active = false;
  Sfx.win();
  l29SetTask('🎉 连跳十五次！');
  const used = L29.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🪢 跳绳完成！',
      '用时 <b>' + used + '</b> 秒 · 绊到 <b>' + L29.misses + '</b> 次', '再跳一次');
  }, 1500);
}

function l29Pose(dt, now){
  baseTargets();
  const t = now * 0.0025;
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.85 + Math.sin(t) * 0.10;
  TGT.armR.z = -0.85 - Math.sin(t) * 0.10;
  TGT.legL.z = 0.06; TGT.legR.z = -0.06;
  if(L29.jumpT < 1){
    const s = Math.sin(Math.PI * L29.jumpT);
    TGT.legL.z = -0.34 * s; TGT.legR.z = -0.34 * s;
    TGT.armL.z = 0.20 + 0.80 * s; TGT.armR.z = -0.20 - 0.80 * s;
    TGT.spine.x = 0.08 * s + 0.05;
  }
  if(frog) frog.root.position.set(CONFIG.lvl29.x, L29.jumpT < 1 ? Math.sin(Math.PI * L29.jumpT) * 0.42 : 0, 0);
  applyPose(dt);
}

function l29Camera(dt){
  camFollow(dt, CONFIG.lvl29.x + 0.6, 2.0, 1.25);
}

function updateLevel29(dt, now){
  const C = CONFIG.lvl29;
  L29.phaseT += dt;
  if(L29.active && !L29.done) L29.elapsed += dt;

  if(L29.active && !L29.done){
    if(L29.phase === 'swing'){
      const p = Math.min(1, L29.jumps / Math.max(1, C.jumps - 1));
      const cycle = C.cycle0 + (C.cycle1 - C.cycle0) * p;
      L29.t += dt / cycle;
      if(L29.t >= 1){ l29Miss('被绳子绊到了'); }
    }else if(L29.phase === 'jump'){
      L29.jumpT = Math.min(1, L29.jumpT + dt / C.jumpT);
      if(L29.jumpT >= 1){
        L29.jumpT = 1;
        L29.phase = 'swing'; L29.phaseT = 0;
      }
    }
  }
  if(L29.rope){
    const y = 0.14 + 0.86 * (1 - Math.sin(Math.PI * Math.min(1, L29.t)));
    L29.rope.position.y = y;
  }
  if(L29.ring){
    const inWin = Math.abs(L29.t - 0.5) <= C.window;
    L29.ring.material.color.setHex(inWin ? 0x3ddc84 : 0xffd93d);
    L29.ring.material.opacity = inWin ? 0.85 : 0.30;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L29.jumps / C.jumps * 100).toFixed(1) + '%';
  updateL29HUD();
  l29Pose(dt, now);
  l29Camera(dt);
}

// ============================================================
// 第三十关：走钢丝
//
// 奶蛙走到两栋高楼之间的钢丝上，风一直把它吹得左右歪。
// 往哪边歪，就按住反方向的手把身体压回来，撑住 12 秒走完全程。
// ============================================================
const L30 = {
  active: false, done: false, phase: 'walk', phaseT: 0,
  tilt: 0, handL: false, handR: false, elapsed: 0, misses: 0,
  props: null, hud: '', task: '',
};
window.__l30 = L30;

function l30SetTask(t){
  if(!t || L30.task === t) return;
  L30.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL30HUD(){
  const C = CONFIG.lvl30;
  const key = L30.elapsed.toFixed(1) + '/' + L30.misses;
  if(key === L30.hud) return;
  L30.hud = key;
  if(el.l2Time) el.l2Time.textContent = L30.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = Math.max(0, C.time - L30.elapsed).toFixed(1) + 's';
  if(el.l2Miss) el.l2Miss.textContent = L30.misses;
}

function buildL30Props(){
  if(L30.props) return L30.props;
  const C = CONFIG.lvl30;
  const g = new THREE.Group();
  // 两端的楼顶平台
  addBox(1.4, 2.6, 1.2, 0x9aa3ad, C.x - 0.85, 1.30, -1.0, g);
  addBox(1.4, 2.6, 1.2, 0x9aa3ad, C.x + C.walk + 0.95, 1.30, -1.0, g);
  addBox(1.5, 0.12, 1.3, 0xb9c2cb, C.x - 0.85, 2.62, -1.0, g);
  addBox(1.5, 0.12, 1.3, 0xb9c2cb, C.x + C.walk + 0.95, 2.62, -1.0, g);
  // 钢丝
  addBox(C.walk + 1.2, 0.06, 0.06, 0x44506a, C.x + C.walk * 0.5, C.ropeY, 0, g);
  // 小旗
  addBox(0.05, 0.55, 0.05, 0x3c4a5e, C.x + C.walk + 0.4, C.ropeY + 0.28, 0, g);
  addBox(0.40, 0.24, 0.02, 0xe8505a, C.x + C.walk + 0.62, C.ropeY + 0.45, 0, g);
  g.visible = false;
  scene.add(g);
  L30.props = g;
  return g;
}

function startLevel30(){
  const C = CONFIG.lvl30;
  resetAllLevels();
  L30.active = true; L30.done = false;
  L30.phase = 'walk'; L30.phaseT = 0;
  L30.tilt = 0; L30.handL = false; L30.handR = false;
  L30.elapsed = 0; L30.misses = 0;
  L30.hud = ''; L30.task = '';
  buildL30Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level30');
  setSky(0xdff0ff);
  setLabels('用时', '剩余');
  setBtnText(el.btnL, '←', '压左');
  setBtnText(el.btnR, '→', '压右');
  resetFrogAt(C.x, C.ropeY);
  G.camX = C.x + 0.3; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l30SetTask('往哪边歪，就按住反方向的手');
  updateL30HUD();
  Sfx.init();
}

function resetL30Scene(){
  document.body.classList.remove('level30');
  L30.active = false; L30.done = false;
  L30.handL = false; L30.handR = false;
  if(L30.props) L30.props.visible = false;
  L30.hud = ''; L30.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l30Hand(side, down){
  if(G.level !== 30 || !L30.active || L30.done) return;
  if(side === 'L') L30.handL = !!down;
  else L30.handR = !!down;
}

function l30Miss(){
  if(L30.done) return;
  L30.misses++;
  L30.tilt = 0; L30.elapsed = 0;
  L30.handL = false; L30.handR = false;
  L30.phase = 'miss'; L30.phaseT = 0;
  Sfx.thud();
  updateL30HUD();
  l30SetTask('从钢丝上掉下来了，重新计时');
}

function l30Win(){
  if(L30.done) return;
  L30.done = true; L30.active = false;
  Sfx.win();
  l30SetTask('🎉 稳稳走完钢丝！');
  setTimeout(()=>{
    showOverlay('🪢 高空走钢丝完成！',
      '撑住 <b>12.0</b> 秒 · 掉下去 <b>' + L30.misses + '</b> 次', '再走一次');
  }, 1500);
}

function l30Pose(dt, now){
  baseTargets();
  const C = CONFIG.lvl30;
  const sway = Math.sin(now * 0.0032);
  const fx = C.x + C.walk * Math.min(1, L30.elapsed / C.time);
  TGT.spine.x = 0.04;
  TGT.armL.z = 1.05 + sway * 0.10;
  TGT.armR.z = -1.05 - sway * 0.10;
  TGT.legL.z = 0.06; TGT.legR.z = -0.06;
  BTGT.rz = -L30.tilt * 0.36;
  if(frog) frog.root.position.set(fx, C.ropeY, 0);
  applyPose(dt);
}

function l30Camera(dt){
  const C = CONFIG.lvl30;
  const fx = C.x + C.walk * Math.min(1, L30.elapsed / C.time);
  camFollow(dt, fx + 0.35, 2.4, 1.55);
}

function updateLevel30(dt, now){
  const C = CONFIG.lvl30;
  L30.phaseT += dt;
  if(L30.active && !L30.done){
    L30.elapsed += dt;
    const drift = Math.sin(now * 0.0014) * 0.72 + Math.sin(now * 0.0033) * 0.34;
    let push = 0;
    if(L30.handL) push -= C.push;
    if(L30.handR) push += C.push;
    L30.tilt += (drift + push) * dt;
    if(Math.abs(L30.tilt) > C.limit){ l30Miss(); }
    else if(L30.elapsed >= C.time){ l30Win(); }
    if(el.l2ProgFill) el.l2ProgFill.style.width = Math.min(100, L30.elapsed / C.time * 100).toFixed(1) + '%';
  }
  updateL30HUD();
  l30Pose(dt, now);
  l30Camera(dt);
}

// ============================================================
// 第三十一关：按灯开门
//
// 门上的 12 盏灯会依次亮起，亮哪一盏就按对应的手或脚。
// 按错了灯会闪红，按对才前进。
// ============================================================
const L31 = {
  active: false, done: false, idx: 0, seq: [], misses: 0, elapsed: 0,
  props: null, bulbs: [], hud: '', task: '', seqKey: '',
};
window.__l31 = L31;

const L31_COLORS = { HL: 0xffd93d, HR: 0x3d8bf0, FL: 0x3ddc84, FR: 0xe8505a };
const L31_PLAN = ['HL', 'FL', 'HR', 'FR', 'HL', 'HR', 'FL', 'FR', 'HR', 'FL', 'HL', 'FR'];

function l31SetTask(t){
  if(!t || L31.task === t) return;
  L31.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL31HUD(){
  const key = L31.elapsed.toFixed(1) + '/' + L31.idx + '/' + L31.misses;
  if(key === L31.hud) return;
  L31.hud = key;
  if(el.l2Time) el.l2Time.textContent = L31.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L31.idx + '/' + CONFIG.lvl31.cues;
  if(el.l2Miss) el.l2Miss.textContent = L31.misses;
}

function l31RenderSeq(){
  if(!el.l5Seq) return;
  const key = L31.idx + '/' + L31.seq.slice(L31.idx, L31.idx + 4).join('');
  if(key === L31.seqKey) return;
  L31.seqKey = key;
  const parts = [];
  for(let i = L31.idx; i < Math.min(L31.seq.length, L31.idx + 4); i++){
    const code = L31.seq[i];
    let cls = 'l5chip ' + (code[0] === 'H' ? 'hand' : 'foot');
    if(i === L31.idx) cls += ' now';
    parts.push('<span class="' + cls + '">' + L5_LIMB[code] + '</span>');
    if(i < Math.min(L31.seq.length, L31.idx + 4) - 1) parts.push('<i class="l5arrow">→</i>');
  }
  el.l5Seq.innerHTML = parts.join('');
}

function buildL31Props(){
  if(L31.props) return L31.props;
  const C = CONFIG.lvl31;
  const g = new THREE.Group();
  const dx = C.x + 1.00, dz = -1.55;
  // 门框 + 门板
  addBox(2.30, 0.14, 0.20, 0x5a6b7f, dx, 2.28, dz, g);
  addBox(0.14, 2.28, 0.20, 0x5a6b7f, dx - 1.08, 1.14, dz, g);
  addBox(0.14, 2.28, 0.20, 0x5a6b7f, dx + 1.08, 1.14, dz, g);
  addBox(2.02, 2.02, 0.06, 0xaebdcb, dx, 1.14, dz + 0.02, g);
  // 12 盏灯排成 6 × 2
  L31.bulbs = [];
  const cols = 6, rows = 2;
  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0x596274 })
      );
      b.position.set(dx - 0.75 + c * 0.30, 1.66 - r * 0.56, dz + 0.10);
      g.add(b);
      L31.bulbs.push(b);
    }
  }
  g.visible = false;
  scene.add(g);
  L31.props = g;
  return g;
}

function startLevel31(){
  const C = CONFIG.lvl31;
  resetAllLevels();
  L31.active = true; L31.done = false;
  L31.idx = 0; L31.misses = 0; L31.elapsed = 0;
  L31.hud = ''; L31.task = ''; L31.seqKey = '';
  L31.seq = L31_PLAN.slice(0, C.cues);
  buildL31Props().visible = true;
  for(const b of L31.bulbs) b.material.color.setHex(0x596274);

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level31');
  setSky(0xcfeaff);
  setNight(false);
  setLabels('用时', '灯');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l31SetTask('灯亮哪一盏，就按对应的手或脚');
  l31RenderSeq();
  updateL31HUD();
  Sfx.init();
}

function resetL31Scene(){
  document.body.classList.remove('level31');
  L31.active = false; L31.done = false;
  if(L31.props) L31.props.visible = false;
  L31.hud = ''; L31.task = ''; L31.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l31Press(code){
  if(G.level !== 31 || !L31.active || L31.done) return;
  const want = L31.seq[L31.idx];
  if(!want) return;
  if(code !== want){
    L31.misses++;
    Sfx.thud();
    updateL31HUD();
    l31SetTask('按错了！现在亮的是 ' + L5_LIMB[want]);
    return;
  }
  L31.idx++;
  Sfx.tick(true);
  updateL31HUD();
  if(L31.idx >= CONFIG.lvl31.cues){ l31Win(); return; }
  l31RenderSeq();
  l31SetTask('下一盏：' + L5_LIMB[L31.seq[L31.idx]]);
}

function l31Win(){
  if(L31.done) return;
  L31.done = true; L31.active = false;
  Sfx.win();
  l31SetTask('🎉 十二盏灯全部按对！');
  const used = L31.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🚪 门开啦！',
      '用时 <b>' + used + '</b> 秒 · 按错 <b>' + L31.misses + '</b> 次', '再开一次');
  }, 1500);
}

function l31Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.38 + Math.sin(t) * 0.08;
  TGT.armR.z = -0.38 - Math.sin(t) * 0.08;
  TGT.legL.z = 0.07; TGT.legR.z = -0.07;
  if(frog) frog.root.position.set(CONFIG.lvl31.x, 0, 0);
  applyPose(dt);
}

function l31Camera(dt){
  camFollow(dt, CONFIG.lvl31.x + 0.9, 2.4, 1.40);
}

function updateLevel31(dt, now){
  const C = CONFIG.lvl31;
  if(L31.active && !L31.done) L31.elapsed += dt;
  for(let i = 0; i < L31.bulbs.length; i++){
    const b = L31.bulbs[i];
    if(i < L31.idx) b.material.color.setHex(0x2f4a3c);
    else if(i === L31.idx){
      b.material.color.setHex(L31_COLORS[L31.seq[i]] || 0xffffff);
      const s = 1 + Math.sin(now * 0.008) * 0.14;
      b.scale.setScalar(s);
    }
    else b.material.color.setHex(0x596274);
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L31.idx / C.cues * 100).toFixed(1) + '%';
  updateL31HUD();
  l31Pose(dt, now);
  l31Camera(dt);
}

// ============================================================
// 第三十二关：抓萤火虫
//
// 夜里萤火虫在前后飞：高处的黄萤火虫要举手，低处的绿萤火虫要跳脚。
// 每只萤火虫只停留一会儿，慢了就飞走。
// ============================================================
const L32 = {
  active: false, done: false, idx: 0, misses: 0, elapsed: 0,
  life: 0, kind: 'H', jumpT: 1,
  props: null, fly: null, glow: null, hud: '', task: '',
};
window.__l32 = L32;

const L32_PLAN = ['F', 'H', 'H', 'F', 'H', 'F', 'F', 'H', 'F', 'H'];

function l32SetTask(t){
  if(!t || L32.task === t) return;
  L32.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL32HUD(){
  const key = L32.elapsed.toFixed(1) + '/' + L32.idx + '/' + L32.misses;
  if(key === L32.hud) return;
  L32.hud = key;
  if(el.l2Time) el.l2Time.textContent = L32.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L32.idx + '/' + CONFIG.lvl32.flies;
  if(el.l2Miss) el.l2Miss.textContent = L32.misses;
}

function buildL32Props(){
  if(L32.props) return L32.props;
  const g = new THREE.Group();
  const fly = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd93d })
  );
  fly.add(body);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.25, depthWrite: false })
  );
  fly.add(glow);
  addBox(0.14, 0.03, 0.03, 0xffffff, 0.10, 0.10, 0, fly);
  addBox(0.14, 0.03, 0.03, 0xffffff, -0.10, 0.10, 0, fly);
  fly.position.set(CONFIG.lvl32.x + 1.35, 2.0, 0);
  g.add(fly);
  g.visible = false;
  scene.add(g);
  L32.fly = fly;
  L32.glow = glow;
  L32.props = g;
  return g;
}

function l32Spawn(){
  const C = CONFIG.lvl32;
  L32.kind = L32_PLAN[Math.min(L32.idx, L32_PLAN.length - 1)] || 'H';
  const hex = L32.kind === 'H' ? 0xffd93d : 0x3ddc84;
  const y = L32.kind === 'H' ? 2.00 : 0.52;
  if(L32.fly){
    L32.fly.position.set(CONFIG.lvl32.x + 1.35, y, 0);
    const body = L32.fly.children[0];
    body.material.color.setHex(hex);
    L32.glow.material.color.setHex(hex);
  }
  L32.life = C.life;
  l32SetTask(L32.kind === 'H' ? '高处黄萤火虫：举手' : '低处绿萤火虫：跳脚');
}

function startLevel32(){
  const C = CONFIG.lvl32;
  resetAllLevels();
  L32.active = true; L32.done = false;
  L32.idx = 0; L32.misses = 0; L32.elapsed = 0;
  L32.jumpT = 1; L32.hud = ''; L32.task = '';
  buildL32Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level32');
  setSky(0x18213a);
  setNight(true);
  setLabels('用时', '萤火虫');
  setBtnText(el.btnL, '↑', '举手');
  setBtnText(el.btnR, '↑', '举手');
  setBtnText(el.footL, '↓', '跳脚');
  setBtnText(el.footR, '↓', '跳脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l32Spawn();
  updateL32HUD();
  Sfx.init();
}

function resetL32Scene(){
  document.body.classList.remove('level32');
  setNight(false);
  L32.active = false; L32.done = false;
  if(L32.props) L32.props.visible = false;
  L32.hud = ''; L32.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l32Press(kind){
  if(G.level !== 32 || !L32.active || L32.done) return;
  if(kind !== L32.kind){
    L32.misses++;
    Sfx.thud();
    updateL32HUD();
    l32SetTask(L32.kind === 'H' ? '那是高处的黄萤火虫，要举手' : '那是低处的绿萤火虫，要跳脚');
    l32Spawn();
    return;
  }
  L32.idx++;
  L32.jumpT = 0;
  Sfx.perfect();
  updateL32HUD();
  if(L32.idx >= CONFIG.lvl32.flies){ l32Win(); return; }
  l32Spawn();
}

function l32Win(){
  if(L32.done) return;
  L32.done = true; L32.active = false;
  Sfx.win();
  l32SetTask('🎉 十只萤火虫全抓住了！');
  const used = L32.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('✨ 萤火虫全抓到啦！',
      '用时 <b>' + used + '</b> 秒 · 漏掉 <b>' + L32.misses + '</b> 只', '再抓一次');
  }, 1500);
}

function l32Pose(dt, now){
  baseTargets();
  const t = now * 0.0026;
  TGT.spine.x = 0.05;
  TGT.armL.z = 0.85 + Math.sin(t) * 0.10;
  TGT.armR.z = -0.85 - Math.sin(t) * 0.10;
  TGT.legL.z = 0.06; TGT.legR.z = -0.06;
  if(L32.jumpT < 1){
    const s = Math.sin(Math.PI * L32.jumpT);
    TGT.legL.z = -0.30 * s; TGT.legR.z = -0.30 * s;
    TGT.spine.x = 0.08 * s + 0.05;
  }
  if(frog) frog.root.position.set(CONFIG.lvl32.x, L32.jumpT < 1 ? Math.sin(Math.PI * L32.jumpT) * 0.30 : 0, 0);
  applyPose(dt);
}

function l32Camera(dt){
  camFollow(dt, CONFIG.lvl32.x + 1.1, 2.5, 1.45);
}

function updateLevel32(dt, now){
  const C = CONFIG.lvl32;
  if(L32.active && !L32.done) L32.elapsed += dt;
  if(L32.jumpT < 1) L32.jumpT = Math.min(1, L32.jumpT + dt / 0.30);
  if(L32.active && !L32.done){
    L32.life -= dt;
    if(L32.life <= 0){
      L32.misses++;
      Sfx.thud();
      updateL32HUD();
      l32SetTask('萤火虫飞走了，快一点');
      l32Spawn();
    }
  }
  if(L32.fly){
    const baseY = L32.kind === 'H' ? 2.00 : 0.52;
    L32.fly.position.y = baseY + Math.sin(now * 0.006) * 0.08;
    L32.fly.position.x = CONFIG.lvl32.x + 1.35 + Math.sin(now * 0.004) * 0.06;
    if(L32.glow) L32.glow.material.opacity = 0.20 + Math.sin(now * 0.008) * 0.08;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L32.idx / C.flies * 100).toFixed(1) + '%';
  updateL32HUD();
  l32Pose(dt, now);
  l32Camera(dt);
}

// ============================================================
// 第三十三关：照镜子
//
// 镜子里的奶蛙会做一个动作，你要按相反的那只手/脚。
// 比如镜子里举左手，你就要举右手，一共 8 轮。
// ============================================================
const L33 = {
  active: false, done: false, idx: 0, seq: [], misses: 0, elapsed: 0,
  props: null, hud: '', task: '', seqKey: '',
};
window.__l33 = L33;

const L33_PLAN = ['HL', 'HR', 'FL', 'FR', 'HL', 'FL', 'HR', 'FR'];
const L33_MIRROR = { HL: 'HR', HR: 'HL', FL: 'FR', FR: 'FL' };

function l33SetTask(t){
  if(!t || L33.task === t) return;
  L33.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL33HUD(){
  const key = L33.elapsed.toFixed(1) + '/' + L33.idx + '/' + L33.misses;
  if(key === L33.hud) return;
  L33.hud = key;
  if(el.l2Time) el.l2Time.textContent = L33.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L33.idx + '/' + CONFIG.lvl33.rounds;
  if(el.l2Miss) el.l2Miss.textContent = L33.misses;
}

function l33RenderSeq(){
  if(!el.l5Seq) return;
  const key = L33.idx;
  if(key === L33.seqKey) return;
  L33.seqKey = key;
  const code = L33.seq[L33.idx];
  if(!code){ el.l5Seq.innerHTML = ''; return; }
  const cls = 'l5chip ' + (code[0] === 'H' ? 'hand' : 'foot') + ' now';
  el.l5Seq.innerHTML = '<span class="' + cls + '">镜子里：' + L5_LIMB[code] + '</span>' +
    '<i class="l5arrow">→</i><span class="l5chip foot">要按相反</span>';
}

function buildL33Props(){
  if(L33.props) return L33.props;
  const C = CONFIG.lvl33;
  const g = new THREE.Group();
  const mx = C.x + 1.30, mz = -1.30;
  addBox(0.10, 1.15, 0.10, 0x3c4a5e, mx - 0.60, 1.15, mz, g);
  addBox(0.10, 1.15, 0.10, 0x3c4a5e, mx + 0.60, 1.15, mz, g);
  addBox(0.14, 0.36, 0.14, 0x3c4a5e, mx, 0.18, mz, g);
  addBox(1.34, 0.08, 0.16, 0x3c4a5e, mx, 1.74, mz, g);
  addBox(1.20, 1.40, 0.06, 0xf3f6fb, mx, 1.16, mz, g);
  addBox(1.04, 1.24, 0.05, 0xa9d6f5, mx, 1.16, mz + 0.05, g);
  // 镜面上两道反光，让人一眼看出是镜子
  const glare = addBox(0.12, 0.95, 0.03, 0xffffff, mx - 0.22, 1.20, mz + 0.10, g);
  glare.rotation.z = 0.38;
  const glare2 = addBox(0.06, 0.55, 0.03, 0xffffff, mx - 0.05, 1.22, mz + 0.10, g);
  glare2.rotation.z = 0.38;
  g.visible = false;
  scene.add(g);
  L33.props = g;
  return g;
}

function startLevel33(){
  const C = CONFIG.lvl33;
  resetAllLevels();
  L33.active = true; L33.done = false;
  L33.idx = 0; L33.misses = 0; L33.elapsed = 0;
  L33.hud = ''; L33.task = ''; L33.seqKey = -1;
  L33.seq = L33_PLAN.slice(0, C.rounds);
  buildL33Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level33');
  setSky(0xcfeaff);
  setNight(false);
  setLabels('用时', '镜子');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.1; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l33RenderSeq();
  l33SetTask('镜子里的动作是反的：要按相反的手脚');
  updateL33HUD();
  Sfx.init();
}

function resetL33Scene(){
  document.body.classList.remove('level33');
  L33.active = false; L33.done = false;
  if(L33.props) L33.props.visible = false;
  L33.hud = ''; L33.task = ''; L33.seqKey = -1;
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l33Press(code){
  if(G.level !== 33 || !L33.active || L33.done) return;
  const prompt = L33.seq[L33.idx];
  if(!prompt) return;
  if(code !== L33_MIRROR[prompt]){
    L33.misses++;
    Sfx.thud();
    updateL33HUD();
    l33SetTask('镜子里是 ' + L5_LIMB[prompt] + '，要按相反的 ' + L5_LIMB[L33_MIRROR[prompt]]);
    return;
  }
  L33.idx++;
  Sfx.tick(true);
  updateL33HUD();
  if(L33.idx >= CONFIG.lvl33.rounds){ l33Win(); return; }
  l33RenderSeq();
  l33SetTask('镜子里是 ' + L5_LIMB[L33.seq[L33.idx]] + '，要按相反的');
}

function l33Win(){
  if(L33.done) return;
  L33.done = true; L33.active = false;
  Sfx.win();
  l33SetTask('🎉 八轮镜像全部答对！');
  const used = L33.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🪞 镜子挑战完成！',
      '用时 <b>' + used + '</b> 秒 · 搞错 <b>' + L33.misses + '</b> 次', '再照一次');
  }, 1500);
}

function l33Pose(dt, now){
  baseTargets();
  const code = L33.seq[Math.min(L33.idx, L33.seq.length - 1)] || 'HL';
  const t = now * 0.0024;
  TGT.spine.x = 0.05;
  TGT.armL.z = (code === 'HL' ? 1.15 : 0.30) + Math.sin(t) * 0.04;
  TGT.armR.z = -((code === 'HR' ? 1.15 : 0.30) + Math.sin(t) * 0.04);
  TGT.legL.z = code === 'FL' ? -0.30 : 0.06;
  TGT.legR.z = code === 'FR' ? 0.30 : -0.06;
  if(frog) frog.root.position.set(CONFIG.lvl33.x, 0, 0);
  applyPose(dt);
}

function l33Camera(dt){
  camFollow(dt, CONFIG.lvl33.x + 1.0, 2.3, 1.35);
}

function updateLevel33(dt, now){
  const C = CONFIG.lvl33;
  if(L33.active && !L33.done) L33.elapsed += dt;
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L33.idx / C.rounds * 100).toFixed(1) + '%';
  updateL33HUD();
  l33Pose(dt, now);
  l33Camera(dt);
}

// ============================================================
// 第三十四关：记动作
//
// 老师先做一个动作组合，只亮一小会儿。
// 你要凭记忆把相同的部位同时按住，一共 8 轮。
// ============================================================
const L34 = {
  active: false, done: false, idx: 0, combo: [], phase: 'show', phaseT: 0,
  held: {}, misses: 0, elapsed: 0,
  props: null, hud: '', task: '', seqKey: '',
};
window.__l34 = L34;

const L34_PLAN = [
  ['HL'], ['FL'], ['HR', 'FL'], ['HL', 'FR'],
  ['FL', 'FR'], ['HL', 'HR'], ['HL', 'HR', 'FL'], ['FL', 'FR', 'HR'],
];

function l34SetTask(t){
  if(!t || L34.task === t) return;
  L34.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL34HUD(){
  const key = L34.elapsed.toFixed(1) + '/' + L34.idx + '/' + L34.misses;
  if(key === L34.hud) return;
  L34.hud = key;
  if(el.l2Time) el.l2Time.textContent = L34.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L34.idx + '/' + CONFIG.lvl34.rounds;
  if(el.l2Miss) el.l2Miss.textContent = L34.misses;
}

function l34RenderSeq(){
  if(!el.l5Seq) return;
  const key = L34.idx + '/' + L34.phase;
  if(key === L34.seqKey) return;
  L34.seqKey = key;
  if(L34.phase === 'show'){
    const parts = [];
    for(let i = 0; i < L34.combo.length; i++){
      const code = L34.combo[i];
      const cls = 'l5chip ' + (code[0] === 'H' ? 'hand' : 'foot') + ' now';
      parts.push('<span class="' + cls + '">' + L5_LIMB[code] + '</span>');
      if(i < L34.combo.length - 1) parts.push('<i class="l5arrow">＋</i>');
    }
    el.l5Seq.innerHTML = parts.join('');
  }else if(L34.phase === 'input'){
    const parts = [];
    for(let i = 0; i < L34.combo.length; i++){
      parts.push('<span class="l5chip foot now">？</span>');
      if(i < L34.combo.length - 1) parts.push('<i class="l5arrow">＋</i>');
    }
    el.l5Seq.innerHTML = parts.join('');
  }else{
    el.l5Seq.innerHTML = '<span class="l5chip foot done">记住啦</span>';
  }
}

function buildL34Props(){
  if(L34.props) return L34.props;
  const C = CONFIG.lvl34;
  const g = new THREE.Group();
  const bx = C.x + 1.20, bz = -1.45;
  addBox(1.30, 0.90, 0.06, 0x2f4f5f, bx, 1.40, bz, g);
  addBox(1.38, 0.08, 0.10, 0x3c4a5e, bx, 1.88, bz, g);
  addBox(1.38, 0.08, 0.10, 0x3c4a5e, bx, 0.92, bz, g);
  addBox(0.10, 0.48, 0.10, 0x3c4a5e, bx - 0.62, 0.66, bz, g);
  addBox(0.10, 0.48, 0.10, 0x3c4a5e, bx + 0.62, 0.66, bz, g);
  g.visible = false;
  scene.add(g);
  L34.props = g;
  return g;
}

function l34StartRound(){
  const C = CONFIG.lvl34;
  L34.combo = L34_PLAN[Math.min(L34.idx, L34_PLAN.length - 1)].slice();
  L34.phase = 'show'; L34.phaseT = 0;
  L34.held = {}; L34.seqKey = '';
  l34RenderSeq();
  l34SetTask('看清楚老师的动作！');
}

function startLevel34(){
  const C = CONFIG.lvl34;
  resetAllLevels();
  L34.active = true; L34.done = false;
  L34.idx = 0; L34.misses = 0; L34.elapsed = 0;
  L34.hud = ''; L34.task = ''; L34.seqKey = '';
  buildL34Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level34');
  setSky(0xdff0ff);
  setNight(false);
  setLabels('用时', '动作');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l34StartRound();
  updateL34HUD();
  Sfx.init();
}

function resetL34Scene(){
  document.body.classList.remove('level34');
  L34.active = false; L34.done = false;
  L34.held = {};
  if(L34.props) L34.props.visible = false;
  L34.hud = ''; L34.task = ''; L34.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l34Down(code){
  if(G.level !== 34 || !L34.active || L34.done) return;
  if(L34.phase !== 'input') return;
  if(!L34.combo.includes(code)){
    L34.misses++;
    Sfx.thud();
    updateL34HUD();
    l34SetTask('记错了，那不是刚才的动作');
    return;
  }
  L34.held[code] = true;
  if(L34.combo.every(c=>L34.held[c])){
    L34.idx++;
    L34.phase = 'gap'; L34.phaseT = 0;
    L34.seqKey = '';
    Sfx.perfect();
    updateL34HUD();
    if(L34.idx >= CONFIG.lvl34.rounds){ l34Win(); return; }
    l34RenderSeq();
    l34SetTask('答对啦，下一轮准备');
  }
}

function l34Up(code){
  delete L34.held[code];
}

function l34Win(){
  if(L34.done) return;
  L34.done = true; L34.active = false;
  Sfx.win();
  l34SetTask('🎉 八组动作全记住！');
  const used = L34.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🧠 记忆小达人！',
      '用时 <b>' + used + '</b> 秒 · 记错 <b>' + L34.misses + '</b> 次', '再记一遍');
  }, 1500);
}

function l34Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.05;
  const show = L34.phase === 'show';
  const combo = show ? L34.combo : [];
  TGT.armL.z = (combo.includes('HL') ? 1.15 : 0.32) + Math.sin(t) * 0.05;
  TGT.armR.z = -((combo.includes('HR') ? 1.15 : 0.32) + Math.sin(t) * 0.05);
  TGT.legL.z = combo.includes('FL') ? -0.30 : 0.06;
  TGT.legR.z = combo.includes('FR') ? 0.30 : -0.06;
  if(frog) frog.root.position.set(CONFIG.lvl34.x, 0, 0);
  applyPose(dt);
}

function l34Camera(dt){
  camFollow(dt, CONFIG.lvl34.x + 0.9, 2.3, 1.35);
}

function updateLevel34(dt, now){
  const C = CONFIG.lvl34;
  L34.phaseT += dt;
  if(L34.active && !L34.done) L34.elapsed += dt;
  if(L34.active && !L34.done){
    if(L34.phase === 'show' && L34.phaseT >= C.show){
      L34.phase = 'input'; L34.phaseT = 0; L34.seqKey = '';
      l34RenderSeq();
      l34SetTask('凭记忆同时按住刚才的部位');
    }else if(L34.phase === 'gap' && L34.phaseT >= C.gap){
      l34StartRound();
    }
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L34.idx / C.rounds * 100).toFixed(1) + '%';
  updateL34HUD();
  l34Pose(dt, now);
  l34Camera(dt);
}

// ============================================================
// 第三十五关：放烟花
//
// 同时按住双手蓄力，蓄力条走到绿区时松手，就能放出一发烟花。
// 一共放 5 发，庆祝顺利走到第三十五关。
// ============================================================
const L35 = {
  active: false, done: false, idx: 0, phase: 'ready', phaseT: 0, power: 0,
  handL: false, handR: false, burstT: 0, misses: 0, elapsed: 0,
  props: null, parts: [], glow: null, hud: '', task: '',
};
window.__l35 = L35;

const L35_COLORS = [0xffd93d, 0xe8505a, 0x3ddc84, 0x3d8bf0, 0xff9a3d, 0xff6bd6, 0x9de3ff, 0xffffff];

function l35SetTask(t){
  if(!t || L35.task === t) return;
  L35.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL35HUD(){
  const C = CONFIG.lvl35;
  const key = L35.elapsed.toFixed(1) + '/' + L35.idx + '/' + L35.misses;
  if(key === L35.hud) return;
  L35.hud = key;
  if(el.l2Time) el.l2Time.textContent = L35.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L35.idx + '/' + C.fireworks;
  if(el.l2Miss) el.l2Miss.textContent = L35.misses;
}

function l35UpdateBar(){
  const C = CONFIG.lvl35;
  if(el.l7Zone){
    el.l7Zone.style.display = 'block';
    el.l7Zone.style.left = (C.z0 * 100).toFixed(1) + '%';
    el.l7Zone.style.width = ((C.z1 - C.z0) * 100).toFixed(1) + '%';
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (Math.min(1, L35.power) * 100).toFixed(1) + '%';
}

function buildL35Props(){
  if(L35.props) return L35.props;
  const C = CONFIG.lvl35;
  const g = new THREE.Group();
  for(let i = 0; i < C.fireworks; i++){
    addBox(0.20, 0.34, 0.20, 0x6b7a86, C.x + 1.20 + i * 0.42, 0.17, -0.55, g);
    addBox(0.26, 0.04, 0.26, 0x3c4a5e, C.x + 1.20 + i * 0.42, 0.35, -0.55, g);
  }
  L35.parts = [];
  for(let i = 0; i < L35_COLORS.length; i++){
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: L35_COLORS[i], transparent: true, opacity: 0, depthWrite: false })
    );
    p.visible = false;
    g.add(p);
    L35.parts.push(p);
  }
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.18, depthWrite: false })
  );
  glow.position.set(C.x + 0.30, 1.30, 0.20);
  g.add(glow);
  L35.glow = glow;
  g.visible = false;
  scene.add(g);
  L35.props = g;
  return g;
}

function startLevel35(){
  const C = CONFIG.lvl35;
  resetAllLevels();
  L35.active = true; L35.done = false;
  L35.idx = 0; L35.phase = 'ready'; L35.phaseT = 0; L35.power = 0;
  L35.handL = false; L35.handR = false; L35.burstT = 0;
  L35.misses = 0; L35.elapsed = 0;
  L35.hud = ''; L35.task = '';
  buildL35Props().visible = true;
  for(const p of L35.parts){ p.visible = false; p.material.opacity = 0; }

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level35');
  setSky(0x3b3560);
  setNight(true);
  setLabels('用时', '烟花');
  setBtnText(el.btnL, '↑', '按住左手');
  setBtnText(el.btnR, '↑', '按住右手');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.9; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l35UpdateBar();
  l35SetTask('同时按住双手蓄力，松手停在绿区放烟花');
  updateL35HUD();
  Sfx.init();
}

function resetL35Scene(){
  document.body.classList.remove('level35');
  setNight(false);
  L35.active = false; L35.done = false;
  L35.handL = false; L35.handR = false; L35.power = 0;
  if(L35.props) L35.props.visible = false;
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  L35.hud = ''; L35.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l35Hand(side, down){
  if(G.level !== 35 || !L35.active || L35.done) return;
  if(side === 'L') L35.handL = !!down;
  else L35.handR = !!down;
  if(L35.phase !== 'ready') {
    if(L35.phase === 'charge' && !(L35.handL && L35.handR)) l35Release();
    return;
  }
  if(L35.handL && L35.handR){
    L35.phase = 'charge'; L35.phaseT = 0; L35.power = 0;
    l35SetTask('蓄力中……松手停在绿区');
  }
}

function l35Release(){
  if(L35.phase !== 'charge') return;
  const C = CONFIG.lvl35;
  const inZone = L35.power >= C.z0 && L35.power <= C.z1;
  L35.power = 0;
  L35.phase = 'gap'; L35.phaseT = 0;
  if(inZone){
    L35.idx++;
    L35.burstT = 1;
    Sfx.perfect();
    updateL35HUD();
    if(L35.idx >= C.fireworks){ l35Win(); return; }
    l35SetTask('漂亮！再蓄一发');
  }else{
    L35.misses++;
    Sfx.thud();
    updateL35HUD();
    l35SetTask('没卡进绿区，再来一发');
  }
  l35UpdateBar();
}

function l35Win(){
  if(L35.done) return;
  L35.done = true; L35.active = false;
  Sfx.win();
  l35SetTask('🎉 五发烟花全部升空！');
  const used = L35.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎆 烟花大会！',
      '用时 <b>' + used + '</b> 秒 · 放空 <b>' + L35.misses + '</b> 发', '再放一轮');
  }, 1500);
}

function l35Pose(dt, now){
  baseTargets();
  const C = CONFIG.lvl35;
  const t = now * 0.0024;
  const up = L35.handL || L35.handR;
  TGT.spine.x = 0.06;
  TGT.armL.z = (L35.handL ? 1.20 : 0.35) + Math.sin(t) * 0.04;
  TGT.armR.z = -((L35.handR ? 1.20 : 0.35) + Math.sin(t) * 0.04);
  TGT.legL.z = 0.06; TGT.legR.z = -0.06;
  BTGT.y = up ? 0.04 : 0;
  if(frog) frog.root.position.set(C.x, 0, 0);
  applyPose(dt);
}

function l35Camera(dt){
  camFollow(dt, CONFIG.lvl35.x + 0.9, 2.4, 1.45);
}

function updateLevel35(dt, now){
  const C = CONFIG.lvl35;
  L35.phaseT += dt;
  if(L35.active && !L35.done) L35.elapsed += dt;

  if(L35.phase === 'charge'){
    L35.power += dt / C.charge;
    if(L35.power >= 1){ L35.power = 1; l35Release(); }
  }else if(L35.phase === 'gap' && L35.phaseT >= C.gap){
    L35.phase = 'ready'; L35.phaseT = 0;
    if(L35.active && !L35.done) l35SetTask('同时按住双手蓄力，松手停在绿区');
  }

  if(L35.burstT > 0){
    L35.burstT = Math.max(0, L35.burstT - dt / 0.65);
    const k = 1 - L35.burstT;
    const cx = C.x + 1.55 + (L35.idx - 1) * 0.12, cy = 1.95;
    for(let i = 0; i < L35.parts.length; i++){
      const p = L35.parts[i];
      const a = (i / L35.parts.length) * Math.PI * 2;
      const r = 0.10 + k * 0.85;
      p.visible = L35.burstT > 0;
      p.position.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.15);
      p.material.opacity = L35.burstT;
    }
  }
  if(L35.glow){
    const on = L35.phase === 'charge';
    L35.glow.material.opacity = on ? 0.20 + L35.power * 0.55 : (L35.handL || L35.handR ? 0.16 : 0.05);
    L35.glow.scale.setScalar(1 + L35.power * 0.8);
  }
  l35UpdateBar();
  updateL35HUD();
  l35Pose(dt, now);
  l35Camera(dt);
}

// ============================================================
// 第三十六关：奶蛙跳早操
//
// 跟着四拍一轮的早操：左手 → 左脚 → 右手 → 右脚，
// 每一拍要在节拍内按下对应的部位，节奏会越来越快。
// ============================================================
const L36 = {
  active: false, done: false, idx: 0, beatT: 0, misses: 0, elapsed: 0,
  seq: [], props: null, hud: '', task: '', seqKey: '',
};
window.__l36 = L36;

const L36_A = ['HL', 'FL', 'HR', 'FR'];
const L36_B = ['HR', 'FR', 'HL', 'FL'];

function l36BeatLen(i){
  const C = CONFIG.lvl36;
  const k = Math.max(0, Math.min(1, i / Math.max(1, C.beats - 1)));
  return C.beat0 + (C.beat1 - C.beat0) * k;
}

function l36SetTask(t){
  if(!t || L36.task === t) return;
  L36.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL36HUD(){
  const key = L36.elapsed.toFixed(1) + '/' + L36.idx + '/' + L36.misses;
  if(key === L36.hud) return;
  L36.hud = key;
  if(el.l2Time) el.l2Time.textContent = L36.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L36.idx + '/' + CONFIG.lvl36.beats;
  if(el.l2Miss) el.l2Miss.textContent = L36.misses;
}

function l36RenderSeq(){
  if(!el.l5Seq) return;
  const key = L36.idx;
  if(key === L36.seqKey) return;
  L36.seqKey = key;
  const g0 = Math.floor(L36.idx / 4) * 4;
  const parts = [];
  for(let i = g0; i < Math.min(L36.seq.length, g0 + 4); i++){
    const code = L36.seq[i];
    let cls = 'l5chip ' + (code[0] === 'H' ? 'hand' : 'foot');
    if(i < L36.idx) cls += ' done';
    else if(i === L36.idx) cls += ' now';
    parts.push('<span class="' + cls + '">' + L5_LIMB[code] + '</span>');
    if(i < Math.min(L36.seq.length, g0 + 4) - 1) parts.push('<i class="l5arrow">→</i>');
  }
  el.l5Seq.innerHTML = parts.join('');
}

function buildL36Props(){
  if(L36.props) return L36.props;
  const C = CONFIG.lvl36;
  const g = new THREE.Group();
  // 舞蹈地垫
  addBox(4.8, 0.02, 1.5, 0x5c4d8a, C.x + 0.8, 0.02, -0.15, g);
  // 两个音箱
  for(const sx of [C.x - 1.35, C.x + 2.95]){
    addBox(0.34, 0.80, 0.34, 0x2f3542, sx, 0.40, -0.95, g);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.13, 0.10, 12),
      new THREE.MeshBasicMaterial({ color: 0x8fa3b8 })
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(sx, 0.52, -0.76);
    g.add(cone);
  }
  // 四只气球
  const balloonColors = [0xffd93d, 0x3d8bf0, 0xe8505a, 0x3ddc84];
  for(let i = 0; i < 4; i++){
    const bx = C.x + 2.2 + i * 0.42, by = 2.35 + (i % 2) * 0.18;
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 10),
      new THREE.MeshBasicMaterial({ color: balloonColors[i] })
    );
    b.position.set(bx, by, -0.55);
    g.add(b);
    addBox(0.02, 0.70, 0.02, 0xdfe6ee, bx, by - 0.48, -0.55, g);
  }
  g.visible = false;
  scene.add(g);
  L36.props = g;
  return g;
}

function startLevel36(){
  const C = CONFIG.lvl36;
  resetAllLevels();
  L36.active = true; L36.done = false;
  L36.idx = 0; L36.misses = 0; L36.elapsed = 0;
  L36.hud = ''; L36.task = ''; L36.seqKey = '';
  L36.seq = [];
  for(let r = 0; r < Math.ceil(C.beats / 4); r++){
    const src = r % 2 ? L36_B : L36_A;
    for(const c of src) L36.seq.push(c);
  }
  L36.seq = L36.seq.slice(0, C.beats);
  L36.beatT = l36BeatLen(0);
  buildL36Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level36');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '节拍');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l36RenderSeq();
  l36SetTask('跟着节拍：' + L5_LIMB[L36.seq[0]]);
  updateL36HUD();
  Sfx.init();
}

function resetL36Scene(){
  document.body.classList.remove('level36');
  L36.active = false; L36.done = false;
  if(L36.props) L36.props.visible = false;
  L36.hud = ''; L36.task = ''; L36.seqKey = '';
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l36Advance(){
  const C = CONFIG.lvl36;
  L36.idx++;
  if(L36.idx >= C.beats){ l36Win(); return; }
  L36.beatT = l36BeatLen(L36.idx);
  l36RenderSeq();
  l36SetTask('跟着节拍：' + L5_LIMB[L36.seq[L36.idx]]);
}

function l36Press(code){
  if(G.level !== 36 || !L36.active || L36.done) return;
  if(code !== L36.seq[L36.idx]){
    L36.misses++;
    Sfx.thud();
    updateL36HUD();
    return;
  }
  Sfx.tick(true);
  l36Advance();
  updateL36HUD();
}

function l36Win(){
  if(L36.done) return;
  L36.done = true; L36.active = false;
  Sfx.win();
  l36SetTask('🎉 二十四拍早操全部跟上！');
  const used = L36.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎵 早操完成！',
      '用时 <b>' + used + '</b> 秒 · 错拍 <b>' + L36.misses + '</b> 次', '再跳一遍');
  }, 1500);
}

function l36Pose(dt, now){
  baseTargets();
  const code = L36.seq[Math.min(L36.idx, L36.seq.length - 1)] || 'HL';
  const fast = Math.max(0.6, L36.beatT);
  const t = now * 0.004 / fast;
  TGT.spine.x = 0.06 + Math.sin(t) * 0.03;
  TGT.armL.z = (code === 'HL' ? 1.25 : 0.42) + Math.sin(t) * 0.10;
  TGT.armR.z = -((code === 'HR' ? 1.25 : 0.42) + Math.sin(t) * 0.10);
  TGT.legL.z = code === 'FL' ? -0.36 : 0.08;
  TGT.legR.z = code === 'FR' ? 0.36 : -0.08;
  BTGT.y = Math.abs(Math.sin(t)) * 0.05;
  if(frog) frog.root.position.set(CONFIG.lvl36.x, 0, 0);
  applyPose(dt);
}

function l36Camera(dt){
  camFollow(dt, CONFIG.lvl36.x + 0.9, 2.4, 1.40);
}

function updateLevel36(dt, now){
  const C = CONFIG.lvl36;
  if(L36.active && !L36.done){
    L36.elapsed += dt;
    L36.beatT -= dt;
    if(L36.beatT <= 0){
      L36.misses++;
      Sfx.thud();
      l36Advance();
      updateL36HUD();
    }
    if(el.l2ProgFill){
      const len = l36BeatLen(Math.min(L36.idx, C.beats - 1));
      el.l2ProgFill.style.width = Math.max(0, Math.min(1, L36.beatT / len) * 100).toFixed(1) + '%';
    }
  }
  updateL36HUD();
  l36Pose(dt, now);
  l36Camera(dt);
}

// ============================================================
// 第三十七关：奶蛙踩高跷
//
// 奶蛙踩着高跷往前走，风会把它吹歪。
// 往哪边歪，就按住反方向的那只脚，撑过 10 秒。
// ============================================================
const L37 = {
  active: false, done: false, elapsed: 0, tilt: 0,
  footL: false, footR: false, gustT: 0, gustIdx: 0, misses: 0,
  props: null, stiltL: null, stiltR: null, hud: '', task: '',
};
window.__l37 = L37;

function l37SetTask(t){
  if(!t || L37.task === t) return;
  L37.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL37HUD(){
  const key = L37.elapsed.toFixed(1) + '/' + L37.misses;
  if(key === L37.hud) return;
  L37.hud = key;
  if(el.l2Time) el.l2Time.textContent = L37.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L37.elapsed.toFixed(1) + 's';
  if(el.l2Miss) el.l2Miss.textContent = L37.misses;
}

function buildL37Props(){
  if(L37.props) return L37.props;
  const C = CONFIG.lvl37;
  const g = new THREE.Group();
  const y = C.stiltY;
  const l = addBox(0.10, y, 0.10, 0xb98a52, C.x - 0.18, y / 2, 0, g);
  const r = addBox(0.10, y, 0.10, 0xb98a52, C.x + 0.18, y / 2, 0, g);
  addBox(0.16, 0.05, 0.16, 0x8a6a42, C.x - 0.18, y + 0.02, 0, g);
  addBox(0.16, 0.05, 0.16, 0x8a6a42, C.x + 0.18, y + 0.02, 0, g);
  L37.stiltL = l;
  L37.stiltR = r;
  g.visible = false;
  scene.add(g);
  L37.props = g;
  return g;
}

function startLevel37(){
  const C = CONFIG.lvl37;
  resetAllLevels();
  L37.active = true; L37.done = false;
  L37.elapsed = 0; L37.tilt = 0;
  L37.footL = false; L37.footR = false;
  L37.gustT = 1.2; L37.gustIdx = 0; L37.misses = 0;
  L37.hud = ''; L37.task = '';
  buildL37Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level37');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '平衡');
  setBtnText(el.footL, '↓', '压左脚');
  setBtnText(el.footR, '↓', '压右脚');
  resetFrogAt(C.x, C.stiltY);
  G.camX = C.x + 0.8; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l37SetTask('往哪边歪，就按住反方向的那只脚');
  updateL37HUD();
  Sfx.init();
}

function resetL37Scene(){
  document.body.classList.remove('level37');
  L37.active = false; L37.done = false;
  L37.footL = false; L37.footR = false;
  if(L37.props) L37.props.visible = false;
  L37.hud = ''; L37.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l37Foot(side, down){
  if(G.level !== 37 || !L37.active || L37.done) return;
  if(side === 'L') L37.footL = !!down;
  else L37.footR = !!down;
}

function l37Win(){
  if(L37.done) return;
  L37.done = true; L37.active = false;
  Sfx.win();
  l37SetTask('🎉 踩着高跷稳稳走完！');
  setTimeout(()=>{
    showOverlay('🥢 高跷平衡完成！',
      '撑满 <b>10</b> 秒 · 差点摔倒 <b>' + L37.misses + '</b> 次', '再走一次');
  }, 1500);
}

function l37Pose(dt, now){
  baseTargets();
  const C = CONFIG.lvl37;
  const t = now * 0.0024;
  const lean = -L37.tilt * 0.38;
  BTGT.rz = lean;
  TGT.armL.z = 0.75 + Math.sin(t) * 0.12;
  TGT.armR.z = -0.75 - Math.sin(t) * 0.12;
  TGT.legL.z = 0.10 + lean * 0.3;
  TGT.legR.z = -0.10 + lean * 0.3;
  const walkX = C.x + C.walk * Math.min(1, L37.elapsed / C.time);
  if(frog) frog.root.position.set(walkX, C.stiltY, 0);
  if(L37.stiltL && L37.stiltR){
    L37.stiltL.position.x = walkX - 0.18;
    L37.stiltR.position.x = walkX + 0.18;
  }
  applyPose(dt);
}

function l37Camera(dt){
  const C = CONFIG.lvl37;
  camFollow(dt, C.x + 1.2, 2.4, 1.72);
}

function updateLevel37(dt, now){
  const C = CONFIG.lvl37;
  if(L37.active && !L37.done){
    L37.elapsed += dt;
    const t = L37.elapsed;
    L37.gustT += dt;
    if(L37.gustT >= 2.4){ L37.gustT = 0; L37.gustIdx++; }
    const gusting = L37.gustT < 0.55;
    const gustDir = (L37.gustIdx % 2 === 0) ? 1 : -1;
    let drift = 0.65 * Math.sin(t * 1.35) + 0.35 * Math.sin(t * 2.85);
    if(gusting) drift += gustDir * 0.50;
    let push = 0;
    if(L37.footL) push -= C.push;
    if(L37.footR) push += C.push;
    L37.tilt += (drift + push) * dt;
    if(Math.abs(L37.tilt) > C.limit){
      L37.misses++;
      L37.tilt = 0;
      L37.elapsed = 0;
      L37.gustT = 0;
      Sfx.thud();
      l37SetTask('差点摔倒！从起点重新来');
    }
    if(L37.elapsed >= C.time) l37Win();
    if(el.l2ProgFill) el.l2ProgFill.style.width = Math.min(100, L37.elapsed / C.time * 100).toFixed(1) + '%';
  }
  updateL37HUD();
  l37Pose(dt, now);
  l37Camera(dt);
}

// ============================================================
// 第三十八关：奶蛙捡豆子
//
// 豆子会出现在左上、右上、左下、右下四个位置，
// 出现在哪边，就按对应的那只手或脚。
// ============================================================
const L38 = {
  active: false, done: false, idx: 0, misses: 0, elapsed: 0, life: 0,
  code: 'HL', props: null, bean: null, glow: null, hud: '', task: '',
};
window.__l38 = L38;

const L38_PLAN = ['HL', 'FR', 'HR', 'FL', 'HL', 'HR', 'FL', 'FR', 'HR', 'HL'];

function l38SetTask(t){
  if(!t || L38.task === t) return;
  L38.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL38HUD(){
  const key = L38.elapsed.toFixed(1) + '/' + L38.idx + '/' + L38.misses;
  if(key === L38.hud) return;
  L38.hud = key;
  if(el.l2Time) el.l2Time.textContent = L38.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L38.idx + '/' + CONFIG.lvl38.beans;
  if(el.l2Miss) el.l2Miss.textContent = L38.misses;
}

function buildL38Props(){
  if(L38.props) return L38.props;
  const C = CONFIG.lvl38;
  const g = new THREE.Group();
  // 小竹篮
  addBox(0.46, 0.30, 0.36, 0xb98a52, C.x + 1.85, 0.17, -0.30, g);
  addBox(0.52, 0.05, 0.42, 0x8a6a42, C.x + 1.85, 0.34, -0.30, g);
  const bean = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd93d })
  );
  bean.position.set(C.x - 0.5, 1.55, 0.05);
  g.add(bean);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.20, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.22, depthWrite: false })
  );
  glow.position.copy(bean.position);
  g.add(glow);
  L38.bean = bean;
  L38.glow = glow;
  g.visible = false;
  scene.add(g);
  L38.props = g;
  return g;
}

function l38Anchor(code){
  const C = CONFIG.lvl38;
  if(code === 'HL') return { x: C.x - 0.52, y: 1.62 };
  if(code === 'HR') return { x: C.x + 0.52, y: 1.62 };
  if(code === 'FL') return { x: C.x - 0.52, y: 0.34 };
  return { x: C.x + 0.52, y: 0.34 };
}

function l38Spawn(){
  const C = CONFIG.lvl38;
  L38.code = L38_PLAN[Math.min(L38.idx, L38_PLAN.length - 1)] || 'HL';
  const p = l38Anchor(L38.code);
  if(L38.bean){
    L38.bean.position.set(p.x, p.y, 0.05);
    L38.glow.position.copy(L38.bean.position);
  }
  L38.life = C.life;
  const names = { HL: '左上手', HR: '右上手', FL: '左脚边', FR: '右脚边' };
  l38SetTask('豆子在' + names[L38.code] + '，按对应部位');
}

function startLevel38(){
  const C = CONFIG.lvl38;
  resetAllLevels();
  L38.active = true; L38.done = false;
  L38.idx = 0; L38.misses = 0; L38.elapsed = 0;
  L38.hud = ''; L38.task = '';
  buildL38Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level38');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '豆子');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l38Spawn();
  updateL38HUD();
  Sfx.init();
}

function resetL38Scene(){
  document.body.classList.remove('level38');
  L38.active = false; L38.done = false;
  if(L38.props) L38.props.visible = false;
  L38.hud = ''; L38.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l38Press(code){
  if(G.level !== 38 || !L38.active || L38.done) return;
  if(code !== L38.code){
    L38.misses++;
    Sfx.thud();
    updateL38HUD();
    l38SetTask('不对，豆子在' + (L38.code === 'HL' ? '左上' : L38.code === 'HR' ? '右上' : L38.code === 'FL' ? '左下' : '右下'));
    l38Spawn();
    return;
  }
  L38.idx++;
  Sfx.perfect();
  updateL38HUD();
  if(L38.idx >= CONFIG.lvl38.beans){ l38Win(); return; }
  l38Spawn();
}

function l38Win(){
  if(L38.done) return;
  L38.done = true; L38.active = false;
  Sfx.win();
  l38SetTask('🎉 十颗豆子全捡进篮子！');
  const used = L38.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🫘 豆子捡完啦！',
      '用时 <b>' + used + '</b> 秒 · 捡错 <b>' + L38.misses + '</b> 次', '再捡一遍');
  }, 1500);
}

function l38Pose(dt, now){
  baseTargets();
  const code = L38.code;
  const t = now * 0.0024;
  TGT.spine.x = 0.10;
  TGT.armL.z = code === 'HL' ? 1.20 : 0.36 + Math.sin(t) * 0.04;
  TGT.armR.z = code === 'HR' ? -1.20 : -(0.36 + Math.sin(t) * 0.04);
  TGT.legL.z = code === 'FL' ? -0.32 : 0.06;
  TGT.legR.z = code === 'FR' ? 0.32 : -0.06;
  if(frog) frog.root.position.set(CONFIG.lvl38.x, 0, 0);
  applyPose(dt);
}

function l38Camera(dt){
  camFollow(dt, CONFIG.lvl38.x + 1.0, 2.3, 1.40);
}

function updateLevel38(dt, now){
  const C = CONFIG.lvl38;
  if(L38.active && !L38.done){
    L38.elapsed += dt;
    L38.life -= dt;
    if(L38.life <= 0){
      L38.misses++;
      Sfx.thud();
      updateL38HUD();
      l38SetTask('豆子滚走了，快一点');
      l38Spawn();
    }
  }
  if(L38.bean){
    const p = l38Anchor(L38.code);
    L38.bean.position.y = p.y + Math.sin(now * 0.005) * 0.05;
    L38.glow.position.copy(L38.bean.position);
    L38.glow.material.opacity = 0.18 + Math.sin(now * 0.008) * 0.06;
  }
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L38.idx / C.beans * 100).toFixed(1) + '%';
  updateL38HUD();
  l38Pose(dt, now);
  l38Camera(dt);
}

// ============================================================
// 第三十九关：奶蛙拍皮球
//
// 皮球落下时，在绿带里用正确的那只手拍回去。
// 左手、右手交替拍，一共 12 拍。
// ============================================================
const L39 = {
  active: false, done: false, by: 1.15, vy: -2.1, waitT: 0.9,
  bounces: 0, misses: 0, elapsed: 0,
  props: null, ball: null, hud: '', task: '',
};
window.__l39 = L39;

function l39SetTask(t){
  if(!t || L39.task === t) return;
  L39.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL39HUD(){
  const key = L39.elapsed.toFixed(1) + '/' + L39.bounces + '/' + L39.misses;
  if(key === L39.hud) return;
  L39.hud = key;
  if(el.l2Time) el.l2Time.textContent = L39.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L39.bounces + '/' + CONFIG.lvl39.bounces;
  if(el.l2Miss) el.l2Miss.textContent = L39.misses;
}

function buildL39Props(){
  if(L39.props) return L39.props;
  const C = CONFIG.lvl39;
  const g = new THREE.Group();
  const bx = C.x + 1.05;
  // 绿带上下两条提示线
  addBox(1.15, 0.035, 0.35, 0x3ddc84, bx, C.band0, -0.25, g);
  addBox(1.15, 0.035, 0.35, 0x3ddc84, bx, C.band1, -0.25, g);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9a3d })
  );
  ball.position.set(bx, 1.15, 0.10);
  g.add(ball);
  L39.ball = ball;
  g.visible = false;
  scene.add(g);
  L39.props = g;
  return g;
}

function l39SpeedFor(n){
  const C = CONFIG.lvl39;
  const k = Math.max(0, Math.min(1, n / Math.max(1, C.bounces - 1)));
  return C.speed0 + (C.speed1 - C.speed0) * k;
}

function startLevel39(){
  const C = CONFIG.lvl39;
  resetAllLevels();
  L39.active = true; L39.done = false;
  L39.by = 1.50; L39.vy = 0; L39.waitT = 0.9;
  L39.bounces = 0; L39.misses = 0; L39.elapsed = 0;
  L39.hud = ''; L39.task = '';
  buildL39Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level39');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '拍球');
  setBtnText(el.btnL, '↑', '左手拍');
  setBtnText(el.btnR, '↑', '右手拍');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l39SetTask('球要来了，准备用左手拍');
  updateL39HUD();
  Sfx.init();
}

function resetL39Scene(){
  document.body.classList.remove('level39');
  L39.active = false; L39.done = false;
  if(L39.props) L39.props.visible = false;
  L39.hud = ''; L39.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l39Hand(side){
  if(G.level !== 39 || !L39.active || L39.done) return;
  const want = L39.bounces % 2 === 0 ? 'L' : 'R';
  if(side !== want || L39.by < CONFIG.lvl39.band0 || L39.by > CONFIG.lvl39.band1){
    L39.misses++;
    Sfx.thud();
    updateL39HUD();
    l39SetTask('要在绿带里用 ' + (want === 'L' ? '左手' : '右手') + ' 拍');
    return;
  }
  L39.bounces++;
  Sfx.perfect();
  L39.vy = l39SpeedFor(L39.bounces);
  updateL39HUD();
  if(L39.bounces >= CONFIG.lvl39.bounces){ l39Win(); return; }
  l39SetTask('下一拍：' + (L39.bounces % 2 === 0 ? '左手' : '右手'));
}

function l39Win(){
  if(L39.done) return;
  L39.done = true; L39.active = false;
  Sfx.win();
  l39SetTask('🎉 连续拍球十二下！');
  const used = L39.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏀 拍球纪录！',
      '用时 <b>' + used + '</b> 秒 · 拍空 <b>' + L39.misses + '</b> 次', '再拍一次');
  }, 1500);
}

function l39Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  const want = L39.bounces % 2 === 0 ? 'L' : 'R';
  const low = L39.by <= CONFIG.lvl39.band1;
  TGT.spine.x = 0.08;
  TGT.armL.z = (low && want === 'L' ? 0.95 : 0.35) + Math.sin(t) * 0.05;
  TGT.armR.z = -((low && want === 'R' ? 0.95 : 0.35) + Math.sin(t) * 0.05);
  TGT.legL.z = 0.08; TGT.legR.z = -0.08;
  if(frog) frog.root.position.set(CONFIG.lvl39.x, 0, 0);
  applyPose(dt);
}

function l39Camera(dt){
  camFollow(dt, CONFIG.lvl39.x + 1.0, 2.3, 1.35);
}

function updateLevel39(dt, now){
  const C = CONFIG.lvl39;
  if(L39.active && !L39.done){
    L39.elapsed += dt;
    if(L39.waitT > 0){
      L39.waitT -= dt;
      if(L39.waitT <= 0){
        L39.vy = -C.speed0;
        l39SetTask('绿带里用左手拍球');
      }
    }else{
      L39.vy -= 3.4 * dt;
      L39.by += L39.vy * dt;
      if(L39.by <= 0.07){
        L39.by = 0.07;
        L39.misses++;
        Sfx.thud();
        updateL39HUD();
        l39SetTask('球落地了，快点拍');
        L39.vy = l39SpeedFor(L39.bounces);
      }
    }
  }
  if(L39.ball) L39.ball.position.y = L39.by;
  if(el.l2ProgFill) el.l2ProgFill.style.width = (L39.bounces / C.bounces * 100).toFixed(1) + '%';
  updateL39HUD();
  l39Pose(dt, now);
  l39Camera(dt);
}

// ============================================================
// 第四十关：奶蛙毕业典礼
//
// 16 个限时指令，每个指令只有一两秒。
// 按对就换下一个，超时或按错都会记一次失误。
// 全部完成后放礼花庆祝。
// ============================================================
const L40 = {
  active: false, done: false, idx: 0, cue: 'HL', cueT: 0, cueLen: 1.9,
  misses: 0, elapsed: 0, burstT: 0,
  props: null, parts: [], seq: [], hud: '', task: '', seqKey: '',
};
window.__l40 = L40;

const L40_PLAN = ['HL', 'FL', 'HR', 'FR', 'FR', 'HL', 'FL', 'HR',
  'HL', 'FR', 'HR', 'FL', 'FR', 'HL', 'HR', 'FL'];

function l40CueLen(i){
  const C = CONFIG.lvl40;
  const k = Math.max(0, Math.min(1, i / Math.max(1, C.cues - 1)));
  return C.t0 + (C.t1 - C.t0) * k;
}

function l40SetTask(t){
  if(!t || L40.task === t) return;
  L40.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL40HUD(){
  const key = L40.elapsed.toFixed(1) + '/' + L40.idx + '/' + L40.misses;
  if(key === L40.hud) return;
  L40.hud = key;
  if(el.l2Time) el.l2Time.textContent = L40.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L40.idx + '/' + CONFIG.lvl40.cues;
  if(el.l2Miss) el.l2Miss.textContent = L40.misses;
}

function l40RenderSeq(){
  if(!el.l5Seq) return;
  const key = L40.idx;
  if(key === L40.seqKey) return;
  L40.seqKey = key;
  if(!L40.cue){ el.l5Seq.innerHTML = ''; return; }
  const cls = 'l5chip ' + (L40.cue[0] === 'H' ? 'hand' : 'foot') + ' now';
  el.l5Seq.innerHTML = '<span class="' + cls + '">' + L5_LIMB[L40.cue] + '</span>';
}

function buildL40Props(){
  if(L40.props) return L40.props;
  const C = CONFIG.lvl40;
  const g = new THREE.Group();
  // 典礼拱门
  addBox(0.14, 2.30, 0.14, 0xf3f6fb, C.x + 0.10, 1.15, -1.20, g);
  addBox(0.14, 2.30, 0.14, 0xf3f6fb, C.x + 2.90, 1.15, -1.20, g);
  addBox(2.95, 0.16, 0.14, 0xf3f6fb, C.x + 1.50, 2.36, -1.20, g);
  // 拱门上的彩旗
  const flagColors = [0xffd93d, 0x3d8bf0, 0xe8505a, 0x3ddc84, 0xff9a3d];
  for(let i = 0; i < 5; i++){
    addBox(0.28, 0.20, 0.03, flagColors[i], C.x + 0.35 + i * 0.52, 2.36, -1.10, g);
  }
  // 礼花筒
  for(let i = 0; i < 3; i++){
    addBox(0.22, 0.38, 0.22, 0x6b7a86, C.x + 0.30 + i * 0.55, 0.19, -0.55, g);
  }
  L40.parts = [];
  const pc = [0xffd93d, 0xe8505a, 0x3ddc84, 0x3d8bf0, 0xff9a3d, 0xff6bd6, 0x9de3ff, 0xffffff,
    0xffd93d, 0xe8505a, 0x3ddc84, 0x3d8bf0];
  for(let i = 0; i < pc.length; i++){
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: pc[i], transparent: true, opacity: 0, depthWrite: false })
    );
    p.visible = false;
    g.add(p);
    L40.parts.push(p);
  }
  g.visible = false;
  scene.add(g);
  L40.props = g;
  return g;
}

function l40NextCue(){
  const C = CONFIG.lvl40;
  L40.cue = L40.seq[L40.idx];
  L40.cueLen = l40CueLen(L40.idx);
  L40.cueT = L40.cueLen;
  l40RenderSeq();
  l40SetTask('按 ' + L5_LIMB[L40.cue] + '！');
}

function startLevel40(){
  const C = CONFIG.lvl40;
  resetAllLevels();
  L40.active = true; L40.done = false;
  L40.idx = 0; L40.misses = 0; L40.elapsed = 0; L40.burstT = 0;
  L40.hud = ''; L40.task = ''; L40.seqKey = -1;
  L40.seq = L40_PLAN.slice(0, C.cues);
  buildL40Props().visible = true;
  for(const p of L40.parts){ p.visible = false; p.material.opacity = 0; }

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level40');
  setSky(0xe8f2ff);
  setNight(false);
  setLabels('用时', '指令');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.2; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l40NextCue();
  updateL40HUD();
  Sfx.init();
}

function resetL40Scene(){
  document.body.classList.remove('level40');
  L40.active = false; L40.done = false;
  if(L40.props) L40.props.visible = false;
  L40.hud = ''; L40.task = ''; L40.seqKey = -1;
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l40Press(code){
  if(G.level !== 40 || !L40.active || L40.done) return;
  if(code !== L40.cue){
    L40.misses++;
    Sfx.thud();
    updateL40HUD();
    l40SetTask('不是这个，要按 ' + L5_LIMB[L40.cue]);
    return;
  }
  Sfx.tick(true);
  l40Advance();
}

function l40Advance(){
  L40.idx++;
  updateL40HUD();
  if(L40.idx >= CONFIG.lvl40.cues){ l40Win(); return; }
  l40NextCue();
}

function l40Win(){
  if(L40.done) return;
  L40.done = true; L40.active = false;
  L40.burstT = 1.25;
  Sfx.win();
  l40SetTask('🎓 毕业典礼圆满结束！');
  const used = L40.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎓 毕业啦！',
      '用时 <b>' + used + '</b> 秒 · 错过 <b>' + L40.misses + '</b> 个指令', '再参加一次');
  }, 1500);
}

function l40Pose(dt, now){
  baseTargets();
  const code = L40.done ? '' : L40.cue;
  const t = now * 0.0026;
  TGT.spine.x = 0.06 + (L40.done ? Math.sin(t * 2) * 0.12 : 0);
  TGT.armL.z = (code === 'HL' ? 1.25 : (L40.done ? 1.0 : 0.40)) + Math.sin(t) * 0.06;
  TGT.armR.z = -((code === 'HR' ? 1.25 : (L40.done ? 1.0 : 0.40)) + Math.sin(t) * 0.06);
  TGT.legL.z = code === 'FL' ? -0.34 : 0.08;
  TGT.legR.z = code === 'FR' ? 0.34 : -0.08;
  BTGT.y = L40.done ? Math.abs(Math.sin(t * 2)) * 0.18 : 0;
  if(frog) frog.root.position.set(CONFIG.lvl40.x, 0, 0);
  applyPose(dt);
}

function l40Camera(dt){
  camFollow(dt, CONFIG.lvl40.x + 1.3, 2.6, 1.45);
}

function updateLevel40(dt, now){
  const C = CONFIG.lvl40;
  if(L40.active && !L40.done){
    L40.elapsed += dt;
    L40.cueT -= dt;
    if(L40.cueT <= 0){
      L40.misses++;
      Sfx.thud();
      updateL40HUD();
      l40Advance();
    }else if(el.l2ProgFill){
      el.l2ProgFill.style.width = Math.min(100, L40.cueT / L40.cueLen * 100).toFixed(1) + '%';
    }
  }
  if(L40.burstT > 0){
    L40.burstT = Math.max(0, L40.burstT - dt);
    const k = Math.min(1, 1.25 - L40.burstT);
    const cx = C.x + 1.45, cy = 2.05;
    for(let i = 0; i < L40.parts.length; i++){
      const p = L40.parts[i];
      const a = (i / L40.parts.length) * Math.PI * 2;
      const r = 0.10 + k * 1.15;
      p.visible = L40.burstT > 0;
      p.position.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.20);
      p.material.opacity = Math.min(1, L40.burstT * 0.9);
    }
  }
  updateL40HUD();
  l40Pose(dt, now);
  l40Camera(dt);
}

// ============================================================
// 第四十一关：奶蛙荡秋千
//
// 秋千荡到最低点时按脚加力，一次比一次荡得高。
// 在最低点按对 8 次就成功。
// ============================================================
const L41 = {
  active: false, done: false, a: -0.55, av: 0,
  pushes: 0, misses: 0, elapsed: 0,
  props: null, swing: null, hud: '', task: '',
};
window.__l41 = L41;

function l41SetTask(t){
  if(!t || L41.task === t) return;
  L41.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL41HUD(){
  const key = L41.elapsed.toFixed(1) + '/' + L41.pushes + '/' + L41.misses;
  if(key === L41.hud) return;
  L41.hud = key;
  if(el.l2Time) el.l2Time.textContent = L41.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L41.pushes + '/' + CONFIG.lvl41.pushes;
  if(el.l2Miss) el.l2Miss.textContent = L41.misses;
}

function buildL41Props(){
  if(L41.props) return L41.props;
  const C = CONFIG.lvl41;
  const g = new THREE.Group();
  const px = C.x + 0.30, py = C.pivotY;
  for(const dx of [-1.15, 1.15]){
    addBox(0.12, py, 0.12, 0x8fa0b8, px + dx, py / 2, -0.70, g);
  }
  addBox(2.42, 0.14, 0.14, 0x8fa0b8, px, py, -0.70, g);
  const swing = new THREE.Group();
  swing.position.set(px, py, 0);
  addBox(0.06, C.len, 0.06, 0x6b4a2f, -0.20, -C.len / 2, 0, swing);
  addBox(0.06, C.len, 0.06, 0x6b4a2f, 0.20, -C.len / 2, 0, swing);
  addBox(0.72, 0.08, 0.34, 0xb98a52, 0, -C.len + 0.04, 0, swing);
  g.add(swing);
  L41.swing = swing;
  g.visible = false;
  scene.add(g);
  L41.props = g;
  return g;
}

function startLevel41(){
  const C = CONFIG.lvl41;
  resetAllLevels();
  L41.active = true; L41.done = false;
  L41.a = -0.55; L41.av = 0;
  L41.pushes = 0; L41.misses = 0; L41.elapsed = 0;
  L41.hud = ''; L41.task = '';
  buildL41Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level41');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '荡起');
  setBtnText(el.footL, '↓', '蹬左脚');
  setBtnText(el.footR, '↓', '蹬右脚');
  resetFrogAt(C.x, C.pivotY - C.len + 0.06);
  G.camX = C.x + 0.6; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l41SetTask('秋千到最低点时按脚加力');
  updateL41HUD();
  Sfx.init();
}

function resetL41Scene(){
  document.body.classList.remove('level41');
  L41.active = false; L41.done = false;
  if(L41.props) L41.props.visible = false;
  L41.hud = ''; L41.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l41Push(){
  if(G.level !== 41 || !L41.active || L41.done) return;
  if(Math.abs(L41.a) > 0.20){
    L41.misses++;
    Sfx.thud();
    updateL41HUD();
    l41SetTask('要在最低点按脚，再等等');
    return;
  }
  L41.pushes++;
  L41.av += (L41.av >= 0 ? 1 : -1) * CONFIG.lvl41.energy;
  L41.av = Math.max(-2.0, Math.min(2.0, L41.av));
  Sfx.perfect();
  updateL41HUD();
  if(L41.pushes >= CONFIG.lvl41.pushes){ l41Win(); return; }
  l41SetTask('很好！再荡 ' + (CONFIG.lvl41.pushes - L41.pushes) + ' 次');
}

function l41Win(){
  if(L41.done) return;
  L41.done = true; L41.active = false;
  Sfx.win();
  l41SetTask('🎉 秋千荡得比树还高！');
  const used = L41.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🎠 秋千荡起来！',
      '用时 <b>' + used + '</b> 秒 · 错过最低点 <b>' + L41.misses + '</b> 次', '再荡一次');
  }, 1500);
}

function l41Pose(dt, now){
  baseTargets();
  const C = CONFIG.lvl41;
  const px = C.x + 0.30;
  const fx = px + Math.sin(L41.a) * C.len;
  const fy = C.pivotY - Math.cos(L41.a) * C.len + 0.06;
  TGT.spine.x = 0.06 - L41.a * 0.30;
  TGT.armL.z = 1.35; TGT.armR.z = -1.35;
  TGT.legL.z = -0.55; TGT.legR.z = 0.55;
  if(L41.swing) L41.swing.rotation.z = L41.a;
  if(frog) frog.root.position.set(fx, fy, 0);
  applyPose(dt);
}

function l41Camera(dt){
  camFollow(dt, CONFIG.lvl41.x + 0.6, 3.0, 1.90);
}

function updateLevel41(dt, now){
  const C = CONFIG.lvl41;
  if(L41.active && !L41.done){
    L41.elapsed += dt;
    L41.av += -5.2 * Math.sin(L41.a) * dt;
    L41.av *= 1 - 0.04 * dt;
    L41.a += L41.av * dt;
    if(el.l2ProgFill) el.l2ProgFill.style.width = (L41.pushes / C.pushes * 100).toFixed(1) + '%';
  }
  updateL41HUD();
  l41Pose(dt, now);
  l41Camera(dt);
}

// ============================================================
// 第四十二关：奶蛙顶杯子
//
// 左手要一直按住顶住杯子，左右脚交替往前走 10 步。
// 手一松，杯子就会掉，得从头走。
// ============================================================
const L42 = {
  active: false, done: false, steps: 0, hopT: 1,
  handL: false, lostT: 0, fx: 2.0, misses: 0, elapsed: 0,
  props: null, cup: null, hud: '', task: '',
};
window.__l42 = L42;

function l42SetTask(t){
  if(!t || L42.task === t) return;
  L42.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL42HUD(){
  const key = L42.elapsed.toFixed(1) + '/' + L42.steps + '/' + L42.misses;
  if(key === L42.hud) return;
  L42.hud = key;
  if(el.l2Time) el.l2Time.textContent = L42.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L42.steps + '/' + CONFIG.lvl42.steps;
  if(el.l2Miss) el.l2Miss.textContent = L42.misses;
}

function buildL42Props(){
  if(L42.props) return L42.props;
  const g = new THREE.Group();
  const cup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.10, 0.24, 12),
    new THREE.MeshBasicMaterial({ color: 0xf3f6fb })
  );
  cup.add(body);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.105, 0.03, 12),
    new THREE.MeshBasicMaterial({ color: 0x3d8bf0 })
  );
  top.position.y = 0.13;
  cup.add(top);
  cup.position.set(CONFIG.lvl42.x, 1.44, 0);
  cup.scale.setScalar(1.4);
  g.add(cup);
  L42.cup = cup;
  g.visible = false;
  scene.add(g);
  L42.props = g;
  return g;
}

function startLevel42(){
  const C = CONFIG.lvl42;
  resetAllLevels();
  L42.active = true; L42.done = false;
  L42.steps = 0; L42.hopT = 1;
  L42.handL = false; L42.lostT = 0;
  L42.fx = C.x; L42.misses = 0; L42.elapsed = 0;
  L42.hud = ''; L42.task = '';
  buildL42Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level42');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '步数');
  setBtnText(el.btnL, '↑', '按住左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 0.9; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l42SetTask('按住左手顶稳杯子，左右脚交替走');
  updateL42HUD();
  Sfx.init();
}

function resetL42Scene(){
  document.body.classList.remove('level42');
  L42.active = false; L42.done = false;
  L42.handL = false;
  if(L42.props) L42.props.visible = false;
  L42.hud = ''; L42.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l42Hand(down){
  if(G.level !== 42 || !L42.active || L42.done) return;
  L42.handL = !!down;
  if(!down) l42SetTask('快按住左手，杯子要掉了');
}

function l42Step(side){
  if(G.level !== 42 || !L42.active || L42.done) return;
  const C = CONFIG.lvl42;
  if(L42.hopT < 1) return;
  if(!L42.handL){
    L42.misses++;
    Sfx.thud();
    updateL42HUD();
    l42SetTask('先按住左手顶稳杯子');
    return;
  }
  const alt = L42.steps % 2 === 0 ? 'L' : 'R';
  if(side !== alt){
    L42.misses++;
    Sfx.thud();
    updateL42HUD();
    l42SetTask('左右脚要交替，这步用' + (alt === 'L' ? '左脚' : '右脚'));
    return;
  }
  L42.steps++;
  L42.hopT = 0;
  L42.fx += C.stepLen;
  Sfx.step();
  updateL42HUD();
  if(L42.steps >= C.steps){ l42Win(); return; }
  l42SetTask('稳住杯子，继续走');
}

function l42Win(){
  if(L42.done) return;
  L42.done = true; L42.active = false;
  Sfx.win();
  l42SetTask('🎉 杯子稳稳顶到终点！');
  const used = L42.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🥤 顶杯子完成！',
      '用时 <b>' + used + '</b> 秒 · 洒了 <b>' + L42.misses + '</b> 次', '再走一次');
  }, 1500);
}

function l42Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  const lost = !L42.handL;
  TGT.spine.x = 0.05 + (lost ? 0.12 : 0);
  TGT.armL.z = L42.handL ? 1.52 : 0.55;
  TGT.armR.z = -0.45 - Math.sin(t) * 0.08;
  const lift = L42.hopT < 1 ? Math.sin(Math.PI * L42.hopT) : 0;
  TGT.legL.z = L42.steps % 2 === 0 ? -0.30 * lift : 0.10;
  TGT.legR.z = L42.steps % 2 === 1 ? 0.30 * lift : -0.10;
  if(L42.cup){
    L42.cup.position.set(L42.fx + 0.02, 1.44 + lift * 0.12, 0);
    L42.cup.rotation.z = lost ? 0.45 + Math.sin(now * 0.02) * 0.10 : 0;
  }
  if(frog) frog.root.position.set(L42.fx, lift * 0.20, 0);
  applyPose(dt);
}

function l42Camera(dt){
  camFollow(dt, L42.fx + 0.9, 2.6, 1.45);
}

function updateLevel42(dt, now){
  const C = CONFIG.lvl42;
  if(L42.active && !L42.done){
    L42.elapsed += dt;
    if(L42.hopT < 1) L42.hopT = Math.min(1, L42.hopT + dt / C.hopT);
    if(!L42.handL){
      L42.lostT += dt;
      if(L42.lostT >= 1.0){
        L42.lostT = 0;
        L42.misses++;
        L42.steps = 0;
        L42.fx = C.x;
        Sfx.thud();
        updateL42HUD();
        l42SetTask('杯子掉了，从起点重新来');
      }
    }else L42.lostT = 0;
    if(el.l2ProgFill) el.l2ProgFill.style.width = (L42.steps / C.steps * 100).toFixed(1) + '%';
  }
  updateL42HUD();
  l42Pose(dt, now);
  l42Camera(dt);
}

// ============================================================
// 第四十三关：奶蛙闪灯记忆
//
// 灯只亮一小会儿，看一眼就要记住。
// 灯灭之后按对刚才亮起的部位，一共 16 个。
// ============================================================
const L43 = {
  active: false, done: false, idx: 0, cue: '', phase: 'show',
  cueT: 0, cueLen: 1.3, misses: 0, elapsed: 0,
  props: null, flash: null, seq: [], hud: '', task: '', seqKey: -1,
};
window.__l43 = L43;

const L43_PLAN = ['HL', 'FR', 'HR', 'FL', 'HR', 'HL', 'FR', 'FL',
  'HL', 'HR', 'FL', 'FR', 'HR', 'FL', 'HL', 'HR'];
const L43_COLORS = { HL: 0xffd93d, HR: 0x3d8bf0, FL: 0x3ddc84, FR: 0xe8505a };

function l43CueLen(i){
  const C = CONFIG.lvl43;
  const k = Math.max(0, Math.min(1, i / Math.max(1, C.cues - 1)));
  return C.t0 + (C.t1 - C.t0) * k;
}

function l43SetTask(t){
  if(!t || L43.task === t) return;
  L43.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL43HUD(){
  const key = L43.elapsed.toFixed(1) + '/' + L43.idx + '/' + L43.misses;
  if(key === L43.hud) return;
  L43.hud = key;
  if(el.l2Time) el.l2Time.textContent = L43.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L43.idx + '/' + CONFIG.lvl43.cues;
  if(el.l2Miss) el.l2Miss.textContent = L43.misses;
}

function l43RenderSeq(){
  if(!el.l5Seq) return;
  const key = L43.idx + '/' + L43.phase;
  if(key === L43.seqKey) return;
  L43.seqKey = key;
  if(L43.phase !== 'show' || !L43.cue){ el.l5Seq.innerHTML = '<span class="l5chip foot now">？</span>'; return; }
  const cls = 'l5chip ' + (L43.cue[0] === 'H' ? 'hand' : 'foot') + ' now';
  el.l5Seq.innerHTML = '<span class="' + cls + '">' + L5_LIMB[L43.cue] + '</span>';
}

function buildL43Props(){
  if(L43.props) return L43.props;
  const C = CONFIG.lvl43;
  const g = new THREE.Group();
  addBox(1.30, 0.10, 0.10, 0x3c4a5e, C.x + 1.05, 2.32, -0.90, g);
  addBox(1.30, 0.10, 0.10, 0x3c4a5e, C.x + 1.05, 1.80, -0.90, g);
  addBox(0.10, 0.62, 0.10, 0x3c4a5e, C.x + 1.72, 2.05, -0.90, g);
  addBox(0.10, 0.62, 0.10, 0x3c4a5e, C.x + 0.38, 2.05, -0.90, g);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0x596274 })
  );
  flash.position.set(C.x + 1.05, 2.06, -0.88);
  g.add(flash);
  L43.flash = flash;
  g.visible = false;
  scene.add(g);
  L43.props = g;
  return g;
}

function l43NextCue(){
  const C = CONFIG.lvl43;
  L43.cue = L43.seq[L43.idx];
  L43.cueLen = l43CueLen(L43.idx);
  L43.cueT = L43.cueLen;
  L43.phase = 'show';
  L43.seqKey = -1;
  l43RenderSeq();
  l43SetTask('看清楚这一下！');
}

function startLevel43(){
  const C = CONFIG.lvl43;
  resetAllLevels();
  L43.active = true; L43.done = false;
  L43.idx = 0; L43.misses = 0; L43.elapsed = 0;
  L43.hud = ''; L43.task = ''; L43.seqKey = -1;
  L43.seq = L43_PLAN.slice(0, C.cues);
  buildL43Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level43');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '闪灯');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l43NextCue();
  updateL43HUD();
  Sfx.init();
}

function resetL43Scene(){
  document.body.classList.remove('level43');
  L43.active = false; L43.done = false;
  if(L43.props) L43.props.visible = false;
  L43.hud = ''; L43.task = ''; L43.seqKey = -1;
  if(el.l5Seq) el.l5Seq.innerHTML = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l43Press(code){
  if(G.level !== 43 || !L43.active || L43.done) return;
  if(code !== L43.cue){
    L43.misses++;
    Sfx.thud();
    updateL43HUD();
    l43SetTask('不对，刚才闪光的是 ' + L5_LIMB[L43.cue]);
    return;
  }
  Sfx.tick(true);
  l43Advance();
}

function l43Advance(){
  L43.idx++;
  updateL43HUD();
  if(L43.idx >= CONFIG.lvl43.cues){ l43Win(); return; }
  l43NextCue();
}

function l43Win(){
  if(L43.done) return;
  L43.done = true; L43.active = false;
  Sfx.win();
  l43SetTask('🎉 十六次闪光全部记住！');
  const used = L43.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('💡 闪灯记忆完成！',
      '用时 <b>' + used + '</b> 秒 · 记错 <b>' + L43.misses + '</b> 次', '再闪一次');
  }, 1500);
}

function l43Pose(dt, now){
  baseTargets();
  const code = L43.phase === 'show' ? L43.cue : '';
  const t = now * 0.0024;
  TGT.spine.x = 0.05;
  TGT.armL.z = (code === 'HL' ? 1.20 : 0.36) + Math.sin(t) * 0.04;
  TGT.armR.z = -((code === 'HR' ? 1.20 : 0.36) + Math.sin(t) * 0.04);
  TGT.legL.z = code === 'FL' ? -0.32 : 0.06;
  TGT.legR.z = code === 'FR' ? 0.32 : -0.06;
  if(L43.flash){
    if(L43.phase === 'show'){
      L43.flash.material.color.setHex(L43_COLORS[L43.cue] || 0xffffff);
      L43.flash.scale.setScalar(1 + Math.sin(now * 0.02) * 0.12);
    }else{
      L43.flash.material.color.setHex(0x596274);
      L43.flash.scale.setScalar(1);
    }
  }
  if(frog) frog.root.position.set(CONFIG.lvl43.x, 0, 0);
  applyPose(dt);
}

function l43Camera(dt){
  camFollow(dt, CONFIG.lvl43.x + 1.0, 2.4, 1.45);
}

function updateLevel43(dt, now){
  const C = CONFIG.lvl43;
  if(L43.active && !L43.done){
    L43.elapsed += dt;
    L43.cueT -= dt;
    if(L43.phase === 'show' && L43.cueT <= L43.cueLen - C.show){
      L43.phase = 'answer';
      L43.seqKey = -1;
      l43RenderSeq();
      l43SetTask('灯灭了，刚才闪的是什么？');
    }
    if(L43.cueT <= 0){
      L43.misses++;
      Sfx.thud();
      updateL43HUD();
      l43Advance();
    }
    if(el.l2ProgFill && !L43.done) el.l2ProgFill.style.width = Math.max(0, L43.cueT / L43.cueLen * 100).toFixed(1) + '%';
  }
  updateL43HUD();
  l43Pose(dt, now);
  l43Camera(dt);
}

// ============================================================
// 第四十四关：奶蛙搬砖
//
// 每张单子要按 1~3 次脚，左右脚交替搬砖。
// 八张单子送完，砖墙就垒好了。
// ============================================================
const L44 = {
  active: false, done: false, idx: 0, remaining: 1,
  lastFoot: '', cool: 0, misses: 0, elapsed: 0,
  props: null, bricks: [], hud: '', task: '',
};
window.__l44 = L44;

const L44_PLAN = [1, 2, 3, 2, 1, 3, 2, 3];
const L44_COLORS = [0xd9825b, 0xb85c3f, 0xd9825b, 0xb85c3f, 0xd9825b, 0xb85c3f, 0xd9825b, 0xb85c3f];

function l44SetTask(t){
  if(!t || L44.task === t) return;
  L44.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL44HUD(){
  const key = L44.elapsed.toFixed(1) + '/' + L44.idx + '/' + L44.misses;
  if(key === L44.hud) return;
  L44.hud = key;
  if(el.l2Time) el.l2Time.textContent = L44.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = L44.idx + '/' + CONFIG.lvl44.rounds;
  if(el.l2Miss) el.l2Miss.textContent = L44.misses;
}

function l44Task(){
  l44SetTask('第 ' + (L44.idx + 1) + ' 单：剩 ' + L44.remaining + ' 次，左右脚交替按');
}

function buildL44Props(){
  if(L44.props) return L44.props;
  const C = CONFIG.lvl44;
  const g = new THREE.Group();
  L44.bricks = [];
  for(let i = 0; i < C.rounds; i++){
    const b = addBox(0.58, 0.16, 0.34, L44_COLORS[i], C.x + 1.95, 0.10 + i * 0.17, -0.45, g);
    b.visible = false;
    L44.bricks.push(b);
  }
  g.visible = false;
  scene.add(g);
  L44.props = g;
  return g;
}

function startLevel44(){
  const C = CONFIG.lvl44;
  resetAllLevels();
  L44.active = true; L44.done = false;
  L44.idx = 0; L44.remaining = L44_PLAN[0];
  L44.lastFoot = ''; L44.cool = 0;
  L44.misses = 0; L44.elapsed = 0;
  L44.hud = ''; L44.task = '';
  buildL44Props().visible = true;
  for(const b of L44.bricks) b.visible = false;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level44');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '单子');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
  l44Task();
  updateL44HUD();
  Sfx.init();
}

function resetL44Scene(){
  document.body.classList.remove('level44');
  L44.active = false; L44.done = false;
  if(L44.props) L44.props.visible = false;
  L44.hud = ''; L44.task = '';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l44Press(side){
  if(G.level !== 44 || !L44.active || L44.done) return;
  if(L44.cool > 0) return;
  L44.cool = 0.16;
  if(L44.lastFoot === side){
    L44.misses++;
    Sfx.thud();
    updateL44HUD();
    l44SetTask('左右脚要交替，换另一只脚');
    return;
  }
  L44.lastFoot = side;
  L44.remaining--;
  Sfx.step();
  if(L44.remaining > 0){
    l44Task();
    return;
  }
  L44.idx++;
  if(L44.idx > 0 && L44.idx <= L44.bricks.length){
    L44.bricks[L44.idx - 1].visible = true;
  }
  updateL44HUD();
  if(L44.idx >= CONFIG.lvl44.rounds){ l44Win(); return; }
  L44.remaining = L44_PLAN[L44.idx];
  l44Task();
}

function l44Win(){
  if(L44.done) return;
  L44.done = true; L44.active = false;
  Sfx.win();
  l44SetTask('🎉 八单砖全部送到，墙垒好了！');
  const used = L44.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🧱 砖墙垒好啦！',
      '用时 <b>' + used + '</b> 秒 · 踩错 <b>' + L44.misses + '</b> 次', '再搬一趟');
  }, 1500);
}

function l44Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  const lift = L44.cool > 0 ? L44.cool / 0.16 : 0;
  TGT.spine.x = 0.08;
  TGT.armL.z = 0.40 + Math.sin(t) * 0.06;
  TGT.armR.z = -0.40 - Math.sin(t) * 0.06;
  TGT.legL.z = L44.lastFoot === 'L' ? 0.28 * lift : 0.06;
  TGT.legR.z = L44.lastFoot === 'R' ? -0.28 * lift : -0.06;
  if(frog) frog.root.position.set(CONFIG.lvl44.x, 0, 0);
  applyPose(dt);
}

function l44Camera(dt){
  camFollow(dt, CONFIG.lvl44.x + 1.0, 2.5, 1.40);
}

function updateLevel44(dt, now){
  const C = CONFIG.lvl44;
  if(L44.active && !L44.done){
    L44.elapsed += dt;
    if(L44.cool > 0) L44.cool -= dt;
    if(el.l2ProgFill) el.l2ProgFill.style.width = (L44.idx / C.rounds * 100).toFixed(1) + '%';
  }
  updateL44HUD();
  l44Pose(dt, now);
  l44Camera(dt);
}

// ============================================================
// 第四十五关：奶蛙接力赛
//
// 四棒接力：
// 1. 同时按住双手 2 秒
// 2. 左右脚交替走 8 步
// 3. 左右手交替拍 8 次
// 4. 双脚同时跳 4 次
// ============================================================
const L45 = {
  active: false, done: false, stage: 0, stageT: 0, steps: 0,
  handL: false, handR: false, footL: false, footR: false,
  last: '', bothLocked: false, jumpT: 1, misses: 0, elapsed: 0,
  props: null, gates: [], hud: '', task: '', stageKey: -1,
};
window.__l45 = L45;

const L45_GATE_COLORS = [0xffd93d, 0x3ddc84, 0x3d8bf0, 0xe8505a];

function l45SetTask(t){
  if(!t || L45.task === t) return;
  L45.task = t;
  if(el.l2Task) el.l2Task.textContent = t;
}

function updateL45HUD(){
  const key = L45.elapsed.toFixed(1) + '/' + L45.stage + '/' + L45.steps + '/' + L45.misses;
  if(key === L45.hud) return;
  L45.hud = key;
  if(el.l2Time) el.l2Time.textContent = L45.elapsed.toFixed(1);
  if(el.l2Step) el.l2Step.textContent = Math.min(4, L45.stage + 1) + '/4 棒';
  if(el.l2Miss) el.l2Miss.textContent = L45.misses;
}

function l45Task(){
  const C = CONFIG.lvl45;
  if(L45.stage === 0) l45SetTask('第一棒：同时按住双手 ' + C.holdTime.toFixed(1) + ' 秒');
  else if(L45.stage === 1) l45SetTask('第二棒：左右脚交替走 ' + C.steps + ' 步（' + L45.steps + '/' + C.steps + '）');
  else if(L45.stage === 2) l45SetTask('第三棒：左右手交替拍 ' + C.claps + ' 次（' + L45.steps + '/' + C.claps + '）');
  else if(L45.stage === 3) l45SetTask('第四棒：双脚同时跳 ' + C.jumps + ' 次（' + L45.steps + '/' + C.jumps + '）');
}

function buildL45Props(){
  if(L45.props) return L45.props;
  const C = CONFIG.lvl45;
  const g = new THREE.Group();
  L45.gates = [];
  for(let i = 0; i < 4; i++){
    const gx = C.x + 0.55 + i * 0.85;
    addBox(0.09, 1.80, 0.09, 0x3c4a5e, gx, 0.90, -0.85, g);
    const flag = addBox(0.44, 0.28, 0.04, L45_GATE_COLORS[i], gx + 0.22, 1.70, -0.85, g);
    L45.gates.push(flag);
  }
  // 终点小车（用公交做背景）
  addBox(0.90, 0.55, 0.55, 0xffd93d, C.x + 3.70, 0.32, -0.55, g);
  g.visible = false;
  scene.add(g);
  L45.props = g;
  return g;
}

function l45NextStage(){
  L45.stage++;
  L45.stageT = 0;
  L45.steps = 0;
  L45.last = '';
  L45.bothLocked = false;
  L45.jumpT = 1;
  L45.stageKey = -1;
  updateL45HUD();
  if(L45.stage >= 4){ l45Win(); return; }
  l45Task();
}

function startLevel45(){
  const C = CONFIG.lvl45;
  resetAllLevels();
  L45.active = true; L45.done = false;
  L45.stage = 0; L45.stageT = 0; L45.steps = 0;
  L45.handL = false; L45.handR = false;
  L45.footL = false; L45.footR = false;
  L45.last = ''; L45.bothLocked = false; L45.jumpT = 1;
  L45.misses = 0; L45.elapsed = 0;
  L45.hud = ''; L45.task = ''; L45.stageKey = -1;
  buildL45Props().visible = true;

  if(bus){ bus.root.visible = true; bus.root.position.x = C.busX; }
  document.body.classList.add('level45');
  setSky(0xdcefff);
  setNight(false);
  setLabels('用时', '接力');
  setBtnText(el.btnL, '↑', '左手');
  setBtnText(el.btnR, '↑', '右手');
  setBtnText(el.footL, '↓', '左脚');
  setBtnText(el.footR, '↓', '右脚');
  resetFrogAt(C.x, 0);
  G.camX = C.x + 1.0; G.camZ = CONFIG.cam.z; G.camY = CONFIG.cam.y;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.add('on');
  l45Task();
  updateL45HUD();
  Sfx.init();
}

function resetL45Scene(){
  document.body.classList.remove('level45');
  L45.active = false; L45.done = false;
  L45.handL = false; L45.handR = false;
  L45.footL = false; L45.footR = false;
  if(L45.props) L45.props.visible = false;
  L45.hud = ''; L45.task = ''; L45.stageKey = -1;
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  if(el.l2ProgFill) el.l2ProgFill.style.width = '0%';
}

function l45Hand(side, down){
  if(G.level !== 45 || !L45.active || L45.done) return;
  if(side === 'L') L45.handL = !!down;
  else L45.handR = !!down;
  if(down && L45.stage === 2){
    if(L45.last === side){
      L45.misses++;
      Sfx.thud();
      updateL45HUD();
      l45SetTask('左右手要交替，换另一只手');
      return;
    }
    L45.last = side;
    L45.steps++;
    Sfx.tick();
    updateL45HUD();
    if(L45.steps >= CONFIG.lvl45.claps){ l45NextStage(); return; }
    l45Task();
  }
}

function l45Foot(side, down){
  if(G.level !== 45 || !L45.active || L45.done) return;
  if(side === 'L') L45.footL = !!down;
  else L45.footR = !!down;
  if(!down){
    if(L45.stage === 3) L45.bothLocked = false;
    return;
  }
  if(L45.stage === 1){
    if(L45.last === side){
      L45.misses++;
      Sfx.thud();
      updateL45HUD();
      l45SetTask('左右脚要交替，换另一只脚');
      return;
    }
    L45.last = side;
    L45.steps++;
    L45.jumpT = 0;
    Sfx.step();
    updateL45HUD();
    if(L45.steps >= CONFIG.lvl45.steps){ l45NextStage(); return; }
    l45Task();
  }else if(L45.stage === 3){
    if(L45.bothLocked) return;
    if(L45.footL && L45.footR){
      L45.bothLocked = true;
      L45.steps++;
      L45.jumpT = 0;
      Sfx.perfect();
      updateL45HUD();
      if(L45.steps >= CONFIG.lvl45.jumps){ l45NextStage(); return; }
      l45Task();
    }
  }
}

function l45Win(){
  if(L45.done) return;
  L45.done = true; L45.active = false;
  Sfx.win();
  l45SetTask('🎉 四棒接力全部完成！');
  const used = L45.elapsed.toFixed(1);
  setTimeout(()=>{
    showOverlay('🏁 接力赛冠军！',
      '用时 <b>' + used + '</b> 秒 · 掉棒 <b>' + L45.misses + '</b> 次', '再跑一次');
  }, 1500);
}

function l45Pose(dt, now){
  baseTargets();
  const t = now * 0.0024;
  TGT.spine.x = 0.06;
  TGT.armL.z = (L45.handL ? 1.15 : 0.40) + Math.sin(t) * 0.05;
  TGT.armR.z = -((L45.handR ? 1.15 : 0.40) + Math.sin(t) * 0.05);
  TGT.legL.z = L45.footL ? 0.24 : 0.08;
  TGT.legR.z = L45.footR ? -0.24 : -0.08;
  if(L45.jumpT < 1){
    const s = Math.sin(Math.PI * L45.jumpT);
    TGT.legL.z = -0.28 * s + 0.08;
    TGT.legR.z = 0.28 * s - 0.08;
  }
  for(let i = 0; i < L45.gates.length; i++){
    L45.gates[i].material.color.setHex(i === L45.stage ? L45_GATE_COLORS[i] : 0x596274);
  }
  if(frog) frog.root.position.set(CONFIG.lvl45.x, L45.jumpT < 1 ? Math.sin(Math.PI * L45.jumpT) * 0.22 : 0, 0);
  applyPose(dt);
}

function l45Camera(dt){
  camFollow(dt, CONFIG.lvl45.x + 1.0, 2.6, 1.45);
}

function updateLevel45(dt, now){
  const C = CONFIG.lvl45;
  if(L45.active && !L45.done){
    L45.elapsed += dt;
    if(L45.jumpT < 1) L45.jumpT = Math.min(1, L45.jumpT + dt / 0.28);
    if(L45.stage === 0){
      if(L45.handL && L45.handR){
        L45.stageT += dt;
        if(L45.stageT >= C.holdTime){ l45NextStage(); }
      }else L45.stageT = 0;
    }
    if(el.l2ProgFill && !L45.done){
      const p = L45.stage === 0 ? Math.min(1, L45.stageT / C.holdTime) : 0;
      el.l2ProgFill.style.width = ((L45.stage + p) / 4 * 100).toFixed(1) + '%';
    }
    if(L45.stageKey !== L45.stage){
      L45.stageKey = L45.stage;
      l45Task();
    }
  }
  updateL45HUD();
  l45Pose(dt, now);
  l45Camera(dt);
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
  resetL11Scene();
  resetL12Scene();
  resetL13Scene();
  resetL14Scene();
  resetL15Scene();
  resetL16Scene();
  resetL17Scene();
  resetL18Scene();
  resetL19Scene();
  resetL20Scene();
  resetL21Scene();
  resetL22Scene();
  resetL23Scene();
  resetL24Scene();
  resetL25Scene();
  resetL26Scene();
  resetL27Scene();
  resetL28Scene();
  resetL29Scene();
  resetL30Scene();
  resetL31Scene();
  resetL32Scene();
  resetL33Scene();
  resetL34Scene();
  resetL35Scene();
  resetL36Scene();
  resetL37Scene();
  resetL38Scene();
  resetL39Scene();
  resetL40Scene();
  resetL41Scene();
  resetL42Scene();
  resetL43Scene();
  resetL44Scene();
  resetL45Scene();
  if(el.l7Zone) el.l7Zone.style.display = 'none';
  if(el.l2ProgWrap) el.l2ProgWrap.classList.remove('on');
  document.body.classList.remove('level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'level8', 'level9', 'level10', 'level11', 'level12', 'level13', 'level14', 'level15', 'level16', 'level17', 'level18', 'level19', 'level20', 'level21', 'level22', 'level23', 'level24', 'level25', 'level26', 'level27', 'level28', 'level29', 'level30', 'level31', 'level32', 'level33', 'level34', 'level35', 'level36', 'level37', 'level38', 'level39', 'level40', 'level41', 'level42', 'level43', 'level44', 'level45');
  setLabels('剩余', '台阶');
  for(const b of [el.btnL, el.btnR, el.footL, el.footR]) if(b) b.classList.remove('want', 'drop');
}

// ============================================================
// 每帧更新
// ============================================================
let lastT = performance.now();

function update(dt, now){
  if(G.level === 45){ updateLevel45(dt, now); return; }
  if(G.level === 44){ updateLevel44(dt, now); return; }
  if(G.level === 43){ updateLevel43(dt, now); return; }
  if(G.level === 42){ updateLevel42(dt, now); return; }
  if(G.level === 41){ updateLevel41(dt, now); return; }
  if(G.level === 40){ updateLevel40(dt, now); return; }
  if(G.level === 39){ updateLevel39(dt, now); return; }
  if(G.level === 38){ updateLevel38(dt, now); return; }
  if(G.level === 37){ updateLevel37(dt, now); return; }
  if(G.level === 36){ updateLevel36(dt, now); return; }
  if(G.level === 35){ updateLevel35(dt, now); return; }
  if(G.level === 34){ updateLevel34(dt, now); return; }
  if(G.level === 33){ updateLevel33(dt, now); return; }
  if(G.level === 32){ updateLevel32(dt, now); return; }
  if(G.level === 31){ updateLevel31(dt, now); return; }
  if(G.level === 30){ updateLevel30(dt, now); return; }
  if(G.level === 29){ updateLevel29(dt, now); return; }
  if(G.level === 28){ updateLevel28(dt, now); return; }
  if(G.level === 27){ updateLevel27(dt, now); return; }
  if(G.level === 26){ updateLevel26(dt, now); return; }
  if(G.level === 25){ updateLevel25(dt, now); return; }
  if(G.level === 24){ updateLevel24(dt, now); return; }
  if(G.level === 23){ updateLevel23(dt, now); return; }
  if(G.level === 22){ updateLevel22(dt, now); return; }
  if(G.level === 21){ updateLevel21(dt, now); return; }
  if(G.level === 20){ updateLevel20(dt, now); return; }
  if(G.level === 19){ updateLevel19(dt, now); return; }
  if(G.level === 18){ updateLevel18(dt, now); return; }
  if(G.level === 17){ updateLevel17(dt, now); return; }
  if(G.level === 16){ updateLevel16(dt, now); return; }
  if(G.level === 15){ updateLevel15(dt, now); return; }
  if(G.level === 14){ updateLevel14(dt, now); return; }
  if(G.level === 13){ updateLevel13(dt, now); return; }
  if(G.level === 12){ updateLevel12(dt, now); return; }
  if(G.level === 11){ updateLevel11(dt, now); return; }
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
  const code = { a: 'HL', d: 'HR', j: 'FL', k: 'FR' }[k];
  if(G.level === 45){
    if(k === 'a'){ e.preventDefault(); l45Hand('L', true); }
    else if(k === 'd'){ e.preventDefault(); l45Hand('R', true); }
    else if(k === 'j'){ e.preventDefault(); l45Foot('L', true); }
    else if(k === 'k'){ e.preventDefault(); l45Foot('R', true); }
    else if(k === 'r' && L45.done) startGame(45);
    return;
  }
  if(G.level === 44){
    if(k === 'j'){ e.preventDefault(); l44Press('L'); }
    else if(k === 'k'){ e.preventDefault(); l44Press('R'); }
    else if(k === 'r' && L44.done) startGame(44);
    return;
  }
  if(G.level === 43){
    if(code){ e.preventDefault(); l43Press(code); }
    else if(k === 'r' && L43.done) startGame(43);
    return;
  }
  if(G.level === 42){
    if(k === 'a'){ e.preventDefault(); l42Hand(true); }
    else if(k === 'j'){ e.preventDefault(); l42Step('L'); }
    else if(k === 'k'){ e.preventDefault(); l42Step('R'); }
    else if(k === 'r' && L42.done) startGame(42);
    return;
  }
  if(G.level === 41){
    if(k === 'j' || k === 'k'){ e.preventDefault(); l41Push(); }
    else if(k === 'r' && L41.done) startGame(41);
    return;
  }
  if(G.level === 40){
    if(code){ e.preventDefault(); l40Press(code); }
    else if(k === 'r' && L40.done) startGame(40);
    return;
  }
  if(G.level === 39){
    if(k === 'a'){ e.preventDefault(); l39Hand('L'); }
    else if(k === 'd'){ e.preventDefault(); l39Hand('R'); }
    else if(k === 'r' && L39.done) startGame(39);
    return;
  }
  if(G.level === 38){
    if(code){ e.preventDefault(); l38Press(code); }
    else if(k === 'r' && L38.done) startGame(38);
    return;
  }
  if(G.level === 37){
    if(k === 'j'){ e.preventDefault(); l37Foot('L', true); }
    else if(k === 'k'){ e.preventDefault(); l37Foot('R', true); }
    else if(k === 'r' && L37.done) startGame(37);
    return;
  }
  if(G.level === 36){
    if(code){ e.preventDefault(); l36Press(code); }
    else if(k === 'r' && L36.done) startGame(36);
    return;
  }
  if(G.level === 35){
    if(k === 'a'){ e.preventDefault(); l35Hand('L', true); }
    else if(k === 'd'){ e.preventDefault(); l35Hand('R', true); }
    else if(k === 'r' && L35.done) startGame(35);
    return;
  }
  if(G.level === 34){
    if(code){ e.preventDefault(); l34Down(code); }
    else if(k === 'r' && L34.done) startGame(34);
    return;
  }
  if(G.level === 33){
    if(code){ e.preventDefault(); l33Press(code); }
    else if(k === 'r' && L33.done) startGame(33);
    return;
  }
  if(G.level === 32){
    if(k === 'a' || k === 'd'){ e.preventDefault(); l32Press('H'); }
    else if(k === 'j' || k === 'k'){ e.preventDefault(); l32Press('F'); }
    else if(k === 'r' && L32.done) startGame(32);
    return;
  }
  if(G.level === 31){
    if(code){ e.preventDefault(); l31Press(code); }
    else if(k === 'r' && L31.done) startGame(31);
    return;
  }
  if(G.level === 30){
    // A / D 按住左右手压平衡
    if(k === 'a'){ e.preventDefault(); l30Hand('L', true); }
    else if(k === 'd'){ e.preventDefault(); l30Hand('R', true); }
    else if(k === 'r' && L30.done) startGame(30);
    return;
  }
  if(G.level === 29){
    // J / K 都能起跳
    if(k === 'j' || k === 'k'){ e.preventDefault(); l29Jump(); }
    else if(k === 'r' && L29.done) startGame(29);
    return;
  }
  if(G.level === 28){
    // A / D 左右手敲鼓
    if(k === 'a'){ e.preventDefault(); l28Hit('L'); }
    else if(k === 'd'){ e.preventDefault(); l28Hit('R'); }
    else if(k === 'r' && L28.done) startGame(28);
    return;
  }
  if(G.level === 27){
    // J / K 左右脚跳格子
    if(k === 'j'){ e.preventDefault(); l27StepFoot('L'); }
    else if(k === 'k'){ e.preventDefault(); l27StepFoot('R'); }
    else if(k === 'r' && L27.done) startGame(27);
    return;
  }
  if(G.level === 26){
    // A / D 按住双手举灯，J / K 左右脚交替迈步
    if(k === 'a'){ e.preventDefault(); l26Hand('L', true); }
    else if(k === 'd'){ e.preventDefault(); l26Hand('R', true); }
    else if(k === 'j'){ e.preventDefault(); l26Step('L'); }
    else if(k === 'k'){ e.preventDefault(); l26Step('R'); }
    else if(k === 'r' && L26.done) startGame(26);
    return;
  }
  if(G.level === 25){
    // 四个部位都可以按
    if(k === 'a'){ e.preventDefault(); l25Down('HL'); }
    else if(k === 'd'){ e.preventDefault(); l25Down('HR'); }
    else if(k === 'j'){ e.preventDefault(); l25Down('FL'); }
    else if(k === 'k'){ e.preventDefault(); l25Down('FR'); }
    else if(k === 'r' && L25.done) startGame(25);
    return;
  }
  if(G.level === 24){
    // J / K 左右脚交替冲刺
    if(k === 'j'){ e.preventDefault(); l24Step('L'); }
    else if(k === 'k'){ e.preventDefault(); l24Step('R'); }
    else if(k === 'r' && L24.done) startGame(24);
    return;
  }
  if(G.level === 23){
    // J / K 左右脚选择闸机
    if(k === 'j'){ e.preventDefault(); l23Step('L'); }
    else if(k === 'k'){ e.preventDefault(); l23Step('R'); }
    else if(k === 'r' && L23.done) startGame(23);
    return;
  }
  if(G.level === 22){
    // A / D 按住左右手拉风筝
    if(k === 'a'){ e.preventDefault(); l22Hand('L', true); }
    else if(k === 'd'){ e.preventDefault(); l22Hand('R', true); }
    else if(k === 'r' && L22.done) startGame(22);
    return;
  }
  if(G.level === 21){
    // J / K 都能起跳
    if(k === 'j' || k === 'k'){ e.preventDefault(); l21Jump(); }
    else if(k === 'r' && L21.done) startGame(21);
    return;
  }
  if(G.level === 20){
    // A / D 手，J / K 脚
    if(k === 'a'){ e.preventDefault(); l20Press('HL'); }
    else if(k === 'd'){ e.preventDefault(); l20Press('HR'); }
    else if(k === 'j'){ e.preventDefault(); l20Press('FL'); }
    else if(k === 'k'){ e.preventDefault(); l20Press('FR'); }
    else if(k === 'r' && L20.done) startGame(20);
    return;
  }
  if(G.level === 19){
    // J / K 按住蓄力，松开投篮（keyup 里处理）
    if(k === 'j' || k === 'k'){ e.preventDefault(); l19Down(); }
    else if(k === 'r' && L19.done) startGame(19);
    return;
  }
  if(G.level === 18){
    // A / D 左右手
    if(k === 'a'){ e.preventDefault(); l18Hand('L'); }
    else if(k === 'd'){ e.preventDefault(); l18Hand('R'); }
    else if(k === 'r' && L18.done) startGame(18);
    return;
  }
  if(G.level === 17){
    // J / K 左右脚，选对应方向的石头
    if(k === 'j'){ e.preventDefault(); l17Jump('L'); }
    else if(k === 'k'){ e.preventDefault(); l17Jump('R'); }
    else if(k === 'r' && L17.done) startGame(17);
    return;
  }
  if(G.level === 16){
    // J / K 左右脚走斑马线
    if(k === 'j'){ e.preventDefault(); l16Step('L'); }
    else if(k === 'k'){ e.preventDefault(); l16Step('R'); }
    else if(k === 'r' && L16.done) startGame(16);
    return;
  }
  if(G.level === 15){
    // A / D 按住左右手，把木板压回来
    if(k === 'a'){ e.preventDefault(); l15Hand('L', true); }
    else if(k === 'd'){ e.preventDefault(); l15Hand('R', true); }
    else if(k === 'r' && L15.done) startGame(15);
    return;
  }
  if(G.level === 14){
    // J / K 左右脚，在绿区时推
    if(k === 'j'){ e.preventDefault(); l14Press('L'); }
    else if(k === 'k'){ e.preventDefault(); l14Press('R'); }
    else if(k === 'r' && L14.done) startGame(14);
    return;
  }
  if(G.level === 13){
    // J / K 跳
    if(k === 'j' || k === 'k'){ e.preventDefault(); l13Jump(); }
    else if(k === 'r' && L13.done) startGame(13);
    return;
  }
  if(G.level === 12){
    // J / K 顶气球
    if(k === 'j'){ e.preventDefault(); l12Kick('L'); }
    else if(k === 'k'){ e.preventDefault(); l12Kick('R'); }
    else if(k === 'r' && L12.done) startGame(12);
    return;
  }
  if(G.level === 11){
    // A / D 手，J / K 脚
    if(k === 'a'){ e.preventDefault(); l11Press('HL'); }
    else if(k === 'd'){ e.preventDefault(); l11Press('HR'); }
    else if(k === 'j'){ e.preventDefault(); l11Press('FL'); }
    else if(k === 'k'){ e.preventDefault(); l11Press('FR'); }
    else if(k === 'r' && L11.done) startGame(11);
    return;
  }
  if(G.level === 10){
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
  const code = { a: 'HL', d: 'HR', j: 'FL', k: 'FR' }[k];
  if(G.level === 45){
    if(k === 'a') l45Hand('L', false);
    else if(k === 'd') l45Hand('R', false);
    else if(k === 'j') l45Foot('L', false);
    else if(k === 'k') l45Foot('R', false);
    return;
  }
  if(G.level === 42){
    if(k === 'a') l42Hand(false);
    return;
  }
  if(G.level === 37){
    if(k === 'j') l37Foot('L', false);
    else if(k === 'k') l37Foot('R', false);
    return;
  }
  if(G.level === 35){
    if(k === 'a') l35Hand('L', false);
    else if(k === 'd') l35Hand('R', false);
    return;
  }
  if(G.level === 34){
    if(code) l34Up(code);
    return;
  }
  if(G.level === 30){
    if(k === 'a') l30Hand('L', false);
    else if(k === 'd') l30Hand('R', false);
    return;
  }
  if(G.level === 26){
    if(k === 'a') l26Hand('L', false);
    else if(k === 'd') l26Hand('R', false);
    return;
  }
  if(G.level === 25){
    if(k === 'a') l25Up('HL');
    else if(k === 'd') l25Up('HR');
    else if(k === 'j') l25Up('FL');
    else if(k === 'k') l25Up('FR');
    return;
  }
  if(G.level === 22){
    if(k === 'a') l22Hand('L', false);
    else if(k === 'd') l22Hand('R', false);
    return;
  }
  if(G.level === 19){
    if(k === 'j' || k === 'k') l19Up();
    return;
  }
  if(G.level === 15){
    if(k === 'a') l15Hand('L', false);
    else if(k === 'd') l15Hand('R', false);
    return;
  }
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
    if(G.level === 45) l45Hand(side, true);
    else if(G.level === 43) l43Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 42){ if(side === 'L') l42Hand(true); }
    else if(G.level === 40) l40Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 39) l39Hand(side);
    else if(G.level === 38) l38Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 36) l36Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 35) l35Hand(side, true);
    else if(G.level === 34) l34Down(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 33) l33Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 32) l32Press('H');
    else if(G.level === 31) l31Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 30) l30Hand(side, true);
    else if(G.level === 28) l28Hit(side);
    else if(G.level === 26) l26Hand(side, true);
    else if(G.level === 25) l25Down(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 22) l22Hand(side, true);
    else if(G.level === 20) l20Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 18) l18Hand(side);
    else if(G.level === 15) l15Hand(side, true);
    else if(G.level === 11) l11Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 10) l10Down(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 8) l8Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 7) l7Down();
    else if(G.level === 5) l5Press(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 4) l4PadDown();
    else if(G.level === 3) l3HandDown(side);
    else if(G.level === 2) l2PadDown(side);
    else if(G.level === 1) pressFoot(side);
  }, { passive: false });   // 只监听 pointer 事件，避免触摸时重复触发
  node.addEventListener('pointerup', ()=>{
    if(G.level === 45) l45Hand(side, false);
    else if(G.level === 42){ if(side === 'L') l42Hand(false); }
    else if(G.level === 35) l35Hand(side, false);
    else if(G.level === 34) l34Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 30) l30Hand(side, false);
    else if(G.level === 26) l26Hand(side, false);
    else if(G.level === 25) l25Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 22) l22Hand(side, false);
    else if(G.level === 15) l15Hand(side, false);
    else if(G.level === 10) l10Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 7) l7Up();
    else if(G.level === 4) l4PadUp();
    else if(G.level === 3) l3HandUp(side);
    else if(G.level === 2) l2PadUp(side);
  });
  node.addEventListener('pointercancel', ()=>{
    if(G.level === 45) l45Hand(side, false);
    else if(G.level === 42){ if(side === 'L') l42Hand(false); }
    else if(G.level === 35) l35Hand(side, false);
    else if(G.level === 34) l34Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 30) l30Hand(side, false);
    else if(G.level === 26) l26Hand(side, false);
    else if(G.level === 25) l25Up(side === 'L' ? 'HL' : 'HR');
    else if(G.level === 22) l22Hand(side, false);
    else if(G.level === 15) l15Hand(side, false);
    else if(G.level === 10) l10Up(side === 'L' ? 'HL' : 'HR');
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
    if(G.level === 45) l45Foot(side, true);
    else if(G.level === 44) l44Press(side);
    else if(G.level === 43) l43Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 42) l42Step(side);
    else if(G.level === 41) l41Push();
    else if(G.level === 40) l40Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 38) l38Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 37) l37Foot(side, true);
    else if(G.level === 36) l36Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 34) l34Down(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 33) l33Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 32) l32Press('F');
    else if(G.level === 31) l31Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 29) l29Jump();
    else if(G.level === 27) l27StepFoot(side);
    else if(G.level === 26) l26Step(side);
    else if(G.level === 25) l25Down(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 24) l24Step(side);
    else if(G.level === 23) l23Step(side);
    else if(G.level === 21) l21Jump();
    else if(G.level === 20) l20Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 19) l19Down();
    else if(G.level === 17) l17Jump(side);
    else if(G.level === 16) l16Step(side);
    else if(G.level === 11) l11Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 12) l12Kick(side);
    else if(G.level === 13) l13Jump();
    else if(G.level === 14) l14Press(side);
    else if(G.level === 10) l10Down(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 8) l8Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 7) l7Down();
    else if(G.level === 6) l6Press(side);
    else if(G.level === 5) l5Press(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 4) l4FootTap(side);
    else if(G.level === 3) l3FootTap(side);
  }, { passive: false });
  node.addEventListener('pointerup', ()=>{
    if(G.level === 45) l45Foot(side, false);
    else if(G.level === 37) l37Foot(side, false);
    else if(G.level === 25) l25Up(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 19) l19Up();
    else if(G.level === 10) l10Up(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 7) l7Up();
  });
  node.addEventListener('pointercancel', ()=>{
    if(G.level === 45) l45Foot(side, false);
    else if(G.level === 37) l37Foot(side, false);
    else if(G.level === 25) l25Up(side === 'L' ? 'FL' : 'FR');
    else if(G.level === 19) l19Up();
    else if(G.level === 10) l10Up(side === 'L' ? 'FL' : 'FR');
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
el.lv11.addEventListener('click', ()=>startGame(11));
el.lv12.addEventListener('click', ()=>startGame(12));
el.lv13.addEventListener('click', ()=>startGame(13));
el.lv14.addEventListener('click', ()=>startGame(14));
el.lv15.addEventListener('click', ()=>startGame(15));
el.lv16.addEventListener('click', ()=>startGame(16));
el.lv17.addEventListener('click', ()=>startGame(17));
el.lv18.addEventListener('click', ()=>startGame(18));
el.lv19.addEventListener('click', ()=>startGame(19));
el.lv20.addEventListener('click', ()=>startGame(20));
el.lv21.addEventListener('click', ()=>startGame(21));
el.lv22.addEventListener('click', ()=>startGame(22));
el.lv23.addEventListener('click', ()=>startGame(23));
el.lv24.addEventListener('click', ()=>startGame(24));
el.lv25.addEventListener('click', ()=>startGame(25));
el.lv26.addEventListener('click', ()=>startGame(26));
el.lv27.addEventListener('click', ()=>startGame(27));
el.lv28.addEventListener('click', ()=>startGame(28));
el.lv29.addEventListener('click', ()=>startGame(29));
el.lv30.addEventListener('click', ()=>startGame(30));
el.lv31.addEventListener('click', ()=>startGame(31));
el.lv32.addEventListener('click', ()=>startGame(32));
el.lv33.addEventListener('click', ()=>startGame(33));
el.lv34.addEventListener('click', ()=>startGame(34));
el.lv35.addEventListener('click', ()=>startGame(35));
el.lv36.addEventListener('click', ()=>startGame(36));
el.lv37.addEventListener('click', ()=>startGame(37));
el.lv38.addEventListener('click', ()=>startGame(38));
el.lv39.addEventListener('click', ()=>startGame(39));
el.lv40.addEventListener('click', ()=>startGame(40));
el.lv41.addEventListener('click', ()=>startGame(41));
el.lv42.addEventListener('click', ()=>startGame(42));
el.lv43.addEventListener('click', ()=>startGame(43));
el.lv44.addEventListener('click', ()=>startGame(44));
el.lv45.addEventListener('click', ()=>startGame(45));
el.ovBtn.addEventListener('click', ()=>startGame(G.level || 1));
el.ovHomeBtn.addEventListener('click', ()=>showHome());
el.homeChip.addEventListener('click', ()=>showHome());

function startGame(level){
  if(!G.ready) return;      // 素材还没加载完
  const lv = Math.max(1, Math.min(45, Math.round(level || 1)));
  G.level = lv;
  G.screen = 'game';
  el.overlay.classList.remove('show');
  document.body.classList.add('ingame');
  if(lv === 45) startLevel45();
  else if(lv === 44) startLevel44();
  else if(lv === 43) startLevel43();
  else if(lv === 42) startLevel42();
  else if(lv === 41) startLevel41();
  else if(lv === 40) startLevel40();
  else if(lv === 39) startLevel39();
  else if(lv === 38) startLevel38();
  else if(lv === 37) startLevel37();
  else if(lv === 36) startLevel36();
  else if(lv === 35) startLevel35();
  else if(lv === 34) startLevel34();
  else if(lv === 33) startLevel33();
  else if(lv === 32) startLevel32();
  else if(lv === 31) startLevel31();
  else if(lv === 30) startLevel30();
  else if(lv === 29) startLevel29();
  else if(lv === 28) startLevel28();
  else if(lv === 27) startLevel27();
  else if(lv === 26) startLevel26();
  else if(lv === 25) startLevel25();
  else if(lv === 24) startLevel24();
  else if(lv === 23) startLevel23();
  else if(lv === 22) startLevel22();
  else if(lv === 21) startLevel21();
  else if(lv === 20) startLevel20();
  else if(lv === 19) startLevel19();
  else if(lv === 18) startLevel18();
  else if(lv === 17) startLevel17();
  else if(lv === 16) startLevel16();
  else if(lv === 15) startLevel15();
  else if(lv === 14) startLevel14();
  else if(lv === 13) startLevel13();
  else if(lv === 12) startLevel12();
  else if(lv === 11) startLevel11();
  else if(lv === 10) startLevel10();
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
