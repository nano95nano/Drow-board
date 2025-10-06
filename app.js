import { Networking } from './networking.js';

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
  if (!ok) alert('接続できませんでした');
})();

// ---------------- 入力 ----------------
cv.addEventListener('pointerdown', e=>{
  if (!Networking.isConnected()) return; // 未接続なら描かせない
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

  // 自分の完成線として保存（ロ
