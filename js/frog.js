// ============================================================
// frog.js —— 奶蛙：程序化绑骨 + 距离蒙皮
//
// rigged.glb 是“单块网格、没有骨骼”的静态模型。
// 这里在代码里给奶蛙造 7 根骨：
//   pelvis(胯) / spine(脊) / head(头) / armL(左臂) / armR(右臂) / legL(左腿) / legR(右腿)
// 然后给每个顶点按“离哪根骨的线段最近”自动分配权重，绑成 SkinnedMesh。
// 之后只改 parts[k].pose.{x,y,z}（弧度）就能随意摆姿势。
//
// 这套做法沿用班级网站里 naiwa-step/js/dancer.js 的成熟方案。
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 身体分段位置（0~1，模型自下而上）：蛙头很大，所以头线在 62% 高
const SPLIT = {
  HEAD_YN : 0.62,   // 脖子高度
  HIP_YN  : 0.33,   // 胯部高度
  SPINE_YN: 0.50,   // 脊柱中段（手臂挂这里）
  LEG_YN  : 0.30,   // 腿/身体分界
  ARM_XN  : 0.42,   // 左右臂分界（相对于半宽）
  TARGET_H: 1.15,   // 归一化后的身高（世界单位）
};

const BONE_NAMES = ['pelvis','spine','head','armL','armR','legL','legR'];

// ---------- 小工具 ----------
function pct(arr, p){
  if(!arr.length) return 0;
  const a = arr.slice().sort((x,y)=>x-y);
  return a[Math.min(a.length-1, Math.floor((a.length-1)*p))];
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _tmp = new THREE.Vector3();
function distToSeg(px,py,pz, ax,ay,az, bx,by,bz){
  _v1.set(bx-ax, by-ay, bz-az);
  _v2.set(px-ax, py-ay, pz-az);
  const len2 = _v1.lengthSq();
  let t = len2 > 0 ? _v2.dot(_v1)/len2 : 0;
  t = Math.max(0, Math.min(1, t));
  _tmp.copy(_v1).multiplyScalar(t);
  return _v2.distanceTo(_tmp);
}

// ---------- 加载 + 建骨 ----------
export function loadFrog(url, targetH){
  return new Promise((resolve, reject)=>{
    new GLTFLoader().load(url, gltf=>{
      try{ resolve(buildFrog(gltf, targetH || SPLIT.TARGET_H)); }
      catch(e){ reject(e); }
    }, undefined, reject);
  });
}

function buildFrog(gltf, targetH){
  let srcMesh = null;
  gltf.scene.traverse(n=>{ if(!srcMesh && n.isMesh) srcMesh = n; });
  if(!srcMesh) throw new Error('rigged.glb 里没找到网格');

  const box = new THREE.Box3().setFromObject(gltf.scene);
  srcMesh.updateWorldMatrix(true, false);
  const mw = srcMesh.matrixWorld.clone();

  const size = box.getSize(new THREE.Vector3());
  const H = size.y, W = size.x;
  const cx = (box.min.x + box.max.x) / 2;
  const midz = (box.min.z + box.max.z) / 2;

  // 把原始顶点烘到世界坐标（模型内部可能带旋转/缩放）
  const srcGeo = srcMesh.geometry;
  const sp = srcGeo.attributes.position;
  const VN = sp.count;
  const baked = new Float32Array(VN*3);
  const _v = new THREE.Vector3();
  for(let i=0;i<VN;i++){
    _v.fromBufferAttribute(sp, i).applyMatrix4(mw);
    baked[i*3] = _v.x; baked[i*3+1] = _v.y; baked[i*3+2] = _v.z;
  }
  const geo = srcGeo.clone();
  geo.setAttribute('position', new THREE.BufferAttribute(baked, 3));
  const sn = srcGeo.attributes.normal;
  if(sn){
    const na = new Float32Array(VN*3);
    const _nv = new THREE.Vector3();
    for(let i=0;i<VN;i++){
      _nv.fromBufferAttribute(sn, i).applyQuaternion(srcMesh.quaternion).normalize();
      na[i*3] = _nv.x; na[i*3+1] = _nv.y; na[i*3+2] = _nv.z;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(na, 3));
  }
  const pos = geo.attributes.position;

  // ---------- 顶点分类（同时用于蒙皮和涂装） ----------
  const labels = new Array(VN);
  const xs = new Array(VN), ys = new Array(VN);
  const armLV = [], armRV = [], legLV = [], legRV = [], headV = [], bellyV = [];
  for(let i=0;i<VN;i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const yn = (y - box.min.y) / H;
    const xn = (x - cx) / (W/2);
    let lb;
    if(yn >= SPLIT.HEAD_YN) lb = 'head';
    else if(yn <= SPLIT.LEG_YN) lb = xn < 0 ? 'legL' : 'legR';
    else if(Math.abs(xn) >= SPLIT.ARM_XN) lb = xn < 0 ? 'armL' : 'armR';
    else lb = 'belly';
    labels[i] = lb;
    xs[i] = x; ys[i] = y;
    if(lb === 'head') headV.push(i);
    else if(lb === 'belly') bellyV.push(i);
    if(yn > SPLIT.LEG_YN - 0.04 && yn < SPLIT.HEAD_YN + 0.02){
      if(xn < -SPLIT.ARM_XN + 0.06) armLV.push(i);
      if(xn >  SPLIT.ARM_XN - 0.06) armRV.push(i);
    }
    if(yn < SPLIT.LEG_YN + 0.06){
      if(xn < 0) legLV.push(i); else legRV.push(i);
    }
  }

  const hipY   = box.min.y + H * SPLIT.HIP_YN;
  const spineY = box.min.y + H * SPLIT.SPINE_YN;
  const neckY  = box.min.y + H * SPLIT.HEAD_YN;

  function shoulderPoint(ids, side){
    if(ids.length < 4) return new THREE.Vector3(cx + side*H*0.16, neckY - H*0.06, midz);
    const oxs = ids.map(i=>Math.abs(xs[i]-cx));
    const yys = ids.map(i=>ys[i]);
    const zzs = ids.map(i=>pos.getZ(i));
    return new THREE.Vector3(cx + side*pct(oxs,0.25), pct(yys,0.8), zzs.reduce((a,b)=>a+b,0)/zzs.length);
  }
  function handPoint(ids, side){
    if(ids.length < 4) return new THREE.Vector3(cx + side*H*0.3, spineY - H*0.22, midz);
    const oxs = ids.map(i=>Math.abs(xs[i]-cx));
    const yys = ids.map(i=>ys[i]);
    return new THREE.Vector3(cx + side*pct(oxs,0.9), pct(yys,0.12), midz);
  }
  function footPoint(ids, side){
    if(ids.length < 4) return new THREE.Vector3(cx + side*H*0.07, box.min.y+0.01, midz);
    const xxs = ids.map(i=>xs[i]);
    return new THREE.Vector3(pct(xxs,0.5), pct(ids.map(i=>ys[i]),0.02), midz);
  }
  const shL = shoulderPoint(armLV,-1), shR = shoulderPoint(armRV, 1);
  const handL = handPoint(armLV,-1),  handR = handPoint(armRV, 1);
  const footL = footPoint(legLV,-1),  footR = footPoint(legRV, 1);

  // ---------- 造骨 ----------
  const pelvis = new THREE.Bone(); pelvis.position.set(cx, hipY, midz);
  const spine  = new THREE.Bone(); spine.position.set(0, spineY - hipY, 0);
  const head   = new THREE.Bone(); head.position.set(0, neckY - spineY, 0);
  const armL   = new THREE.Bone(); armL.position.set(shL.x-cx, shL.y-spineY, shL.z-midz);
  const armR   = new THREE.Bone(); armR.position.set(shR.x-cx, shR.y-spineY, shR.z-midz);
  const legL   = new THREE.Bone(); legL.position.set(footL.x-cx, 0, footL.z-midz);
  const legR   = new THREE.Bone(); legR.position.set(footR.x-cx, 0, footR.z-midz);
  pelvis.add(spine);
  spine.add(head); spine.add(armL); spine.add(armR);
  pelvis.add(legL); pelvis.add(legR);
  const bones = [pelvis, spine, head, armL, armR, legL, legR];

  // ---------- 每根骨的“粗细半径”，用来算权重 ----------
  function limbRadius(ids, a, b){
    if(ids.length < 4) return H*0.06;
    const ds = ids.map(i=>distToSeg(pos.getX(i), pos.getY(i), pos.getZ(i), a.x,a.y,a.z, b.x,b.y,b.z));
    return Math.max(H*0.02, pct(ds,0.7)*1.5);
  }
  const rArmL = limbRadius(armLV, shL, handL);
  const rArmR = limbRadius(armRV, shR, handR);
  const rLegL = limbRadius(legLV, new THREE.Vector3(cx,hipY,midz), footL);
  const rLegR = limbRadius(legRV, new THREE.Vector3(cx,hipY,midz), footR);
  let rHead = H*0.16;
  if(headV.length){
    const ds = headV.map(i=>Math.max(Math.abs(pos.getX(i)-cx), Math.abs(pos.getZ(i)-midz)));
    rHead = pct(ds,0.8)*1.3;
  }
  let rBelly = H*0.22;
  if(bellyV.length){
    const ds = bellyV.map(i=>{ _v1.set(pos.getX(i)-cx, 0, pos.getZ(i)-midz); return _v1.length(); });
    rBelly = pct(ds,0.8)*1.2;
  }
  const segs = [
    [cx, hipY,   midz, cx, spineY, midz, rBelly*1.15],
    [cx, spineY, midz, cx, neckY,  midz, rBelly],
    [cx, neckY,  midz, cx, box.max.y, midz, rHead],
    [shL.x, shL.y, shL.z, handL.x, handL.y, handL.z, rArmL],
    [shR.x, shR.y, shR.z, handR.x, handR.y, handR.z, rArmR],
    [cx, hipY, midz, footL.x, footL.y, footL.z, rLegL],
    [cx, hipY, midz, footR.x, footR.y, footR.z, rLegR],
  ];

  // ---------- 逐顶点算权重（最多 4 根骨） ----------
  const skinIdx = new Uint16Array(VN*4);
  const skinW   = new Float32Array(VN*4);
  const ws = new Array(bones.length);
  for(let i=0;i<VN;i++){
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let sum = 0, best = -1, bestW = 1e-6;
    for(let b=0;b<bones.length;b++){
      const s = segs[b];
      const d = distToSeg(px,py,pz, s[0],s[1],s[2], s[3],s[4],s[5]);
      let w = 1 - d/s[6];
      if(w < 0) w = 0;
      w = w*w;
      ws[b] = w; sum += w;
      if(w > bestW){ bestW = w; best = b; }
    }
    if(sum < 1e-4){
      for(let k=0;k<4;k++){ skinIdx[i*4+k] = best<0?0:best; skinW[i*4+k] = k===0?1:0; }
      continue;
    }
    const order = ws.map((w,b)=>[w/sum, b]).sort((a,b)=>b[0]-a[0]).slice(0,4);
    for(let k=0;k<4;k++){ skinIdx[i*4+k] = order[k][1]; skinW[i*4+k] = order[k][0]; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));

  // ---------- 组装 ----------
  const root = new THREE.Group();
  const body = new THREE.Group();
  const rig  = new THREE.Group();
  root.add(body); body.add(rig);
  rig.position.set(-cx, -box.min.y, -midz);   // 脚底对齐 y=0，左右居中

  const mat = srcMesh.material.clone();
  mat.side = THREE.DoubleSide;
  mat.vertexColors = true;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VN*3).fill(1), 3));

  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.frustumCulled = false;
  rig.add(mesh);
  rig.add(pelvis);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  mesh.bind(skeleton);

  root.scale.setScalar(targetH / H);
  gltf.scene.traverse(n=>{ if(n.isMesh) n.geometry.dispose(); });

  const parts = {};
  bones.forEach((b,i)=>{
    parts[BONE_NAMES[i]] = { bone:b, pose:{x:0,y:0,z:0} };
  });

  return { root, body, mesh, mat, parts, labels };
}

// ---------- 涂装：只染“头”和“肚子”，其它保持原色 ----------
const _cHead = new THREE.Color(), _cBelly = new THREE.Color();
export function setSkin(frog, headHex = 0xfff08a, bellyHex = 0xffd93d){
  const attr = frog.mesh.geometry.attributes.color;
  _cHead.setHex(headHex);
  _cBelly.setHex(bellyHex);
  for(let i=0;i<frog.labels.length;i++){
    const lb = frog.labels[i];
    if(lb === 'head') attr.setXYZ(i, _cHead.r, _cHead.g, _cHead.b);
    else if(lb === 'belly') attr.setXYZ(i, _cBelly.r, _cBelly.g, _cBelly.b);
    else attr.setXYZ(i, 1, 1, 1);
  }
  attr.needsUpdate = true;
}
