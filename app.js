import { Networking } from './networking.js?v=8';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

let DPR = Math.max(1, window.devicePixelRatio || 1);
function resize(){
  cv.width  = Math.floor(cv.clientWidth  * DPR);
  cv.height = Math.floor(cv.clientHeight * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize, {passive:true}); resize();

// ---------------- 状態 ----------------
const state = {
  color:'#118AB2', width:12, fadingSec:25,
  // 自分が描き終えた線（配列）
  strokes:[],
  // 進行中の線（自分）
  drawing:{ active:false, pts:[], start:0, strokeId:null, lastFlush:0, pending:[] },
  // 受信した線（Map: id -> {meta, pts:[] }）
  remote: new Map(),
};
const now = () => performance.now();
const newId = () => Math.random().toString(36).slice(2);

// ---------------- 接続（ルームIDのみ） ----------------
(async function connectByRoomId(){
  let roomId = localStorage.getItem('roomId');
  if (!roomId) {
    roomId = prompt('ルームIDを入力（英数20文字くらい推奨）');
    if (!roomId) return;
    localStorage.setItem('roomId', roomId);
  }
  const ok = await Networking.connect(roomId);
  console.log('connect result:', ok); // ←追加（trueなら接続成功）
  if (!ok) alert('接続できませんでした');
})();

// ---------------- 入力 ----------------
cv.addEventListener('pointerdown', e=>{
  if (!Networking.isConnected || !Networking.isConnected()) return; // 未接続なら描かせない
  cv.setPointerCapture(e.pointerId);
  state.drawing.active = true;
  state.drawing.pts = [];
  state.drawing.pending = [];
  state.drawing.start = now();
  state.drawing.strokeId = newId();

  // メタを発行（相手にも通知）
  const meta = {
    strokeId: state.drawing.strokeId,
    color: state.color,
    width: state.width,
    startMs: state.drawing.start,
    durationMs: state.fadingSec * 1000,
  };
  state.remote.set(meta.strokeId, { ...meta, pts: [] }); // 自分側でもIDを確保
  Networking.sendBegin(meta);

  pushPoint(e, state.drawing.start);
});
cv.addEventListener('pointermove', e=>{
  if (!state.drawing.active) return;
  pushPoint(e, now());
});
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);

function pushPoint(e, t){
  const x = e.offsetX, y = e.offsetY;
  const pts = state.drawing.pts;
  const last = pts[pts.length-1];
  if (last){
    const dx = x-last.x, dy = y-last.y;
    if (dx*dx + dy*dy < 4) return; // 2pxしきい値
  }
  const pt = { x, y, t };
  pts.push(pt);
  state.drawing.pending.push({ x, y, t: t - state.drawing.start }); // ネット送信用は相対時刻

  // バッチ送信（~15msごと）
  const n = now();
  if (n - state.drawing.lastFlush > 15){
    Networking.sendAppend(state.drawing.strokeId, state.drawing.pending);
    state.drawing.pending = [];
    state.drawing.lastFlush = n;
  }
}

function endStroke(){
  if (!state.drawing.active) return;
  // 送り残し
  if (state.drawing.pending.length){
    Networking.sendAppend(state.drawing.strokeId, state.drawing.pending);
    state.drawing.pending = [];
  }
  Networking.sendEnd(state.drawing.strokeId);

  // 自分の完成線として保存（ローカル描画用）
  state.strokes.push({
    pts: state.drawing.pts.slice(),
    color: state.color,
    width: state.width,
    start: state.drawing.start,
  });

  state.drawing.active = false;
  state.drawing.pts = [];
  state.drawing.strokeId = null;
}

// ---------------- 受信（いまは同一端末にループバック） ----------------
Networking.on = Networking.on || {};
Networking.on.begin = (meta) => {
  if (!state.remote.has(meta.strokeId)) {
    // iPadなど、送信端末の「開始時間」を受信端末のローカル時間に補正
    const delta = now() - meta.startMs; 
    state.remote.set(meta.strokeId, { 
      ...meta, 
      pts: [], 
      startAdj: meta.startMs + delta // 補正済みの開始時間を記録
    });
  }
};

Networking.on.append = (strokeId, batch) => {
  const s = state.remote.get(strokeId);
  if (!s) return;
  // 受信は相対時刻で来る → 絶対時刻に戻して保持
  for (const p of batch) s.pts.push({ x:p.x, y:p.y, t: s.startMs + p.t });
};
Networking.on.end = (strokeId) => {
  // 必要なら完了フラグ等を立てる
};
Networking.on.presence = ({ roomId, count }) => {
  // 参加人数やroomIdを画面に出したい場合はここでDOM更新
  // 例）console.log(`room=${roomId}, count=${count}`);
};

// ---------------- 色ボタン ----------------
document.querySelectorAll('.btn[data-color]').forEach(b=>{
  b.addEventListener('click', ()=> { state.color = b.dataset.color; });
});

// ---------------- 描画ループ ----------------
function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);
  const t = now();

  // 進行中の自分の線（プレビュー）
  if (state.drawing.active && state.drawing.pts.length>1)
    stroke(state.drawing.pts, state.color, state.width, 1);

  // 受信中の相手の線
  for (const s of state.remote.values()){
    if (s.pts.length>1){
      const base = s.startAdj ?? s.startMs;
      const alpha = fadeAlpha(t, base, state.fadingSec*1000);
      if (alpha>0){
        stroke(s.pts, s.color, s.width, alpha);
      }
    }
  }

  // 完成線（自分）
  for (let i=state.strokes.length-1;i>=0;i--){
    const s = state.strokes[i];
    const a = fadeAlpha(t, s.start, state.fadingSec*1000);
    if (a<=0){ state.strokes.splice(i,1); continue; }
    stroke(s.pts, s.color, s.width, a);
  }

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---------------- ヘルパ ----------------
function fadeAlpha(nowMs, startMs, durationMs){
  return Math.max(0, 1 - ( (nowMs - startMs) / durationMs ));
}
function stroke(pts, color, width, alpha){
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.lineWidth=width; ctx.strokeStyle=color; ctx.globalAlpha=alpha;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke(); ctx.globalAlpha=1;
}







