// app.js
import './networking.js'; // いまはダミー。存在チェック用に読み込むだけ

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let DPR = Math.max(1, window.devicePixelRatio || 1);
function resize() {
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.floor(w * DPR);
  cv.height = Math.floor(h * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize, { passive: true });
resize();

// --- 状態 ---
const state = {
  color: '#118AB2',
  width: 12,
  fadingSec: 25,
  strokes: [], // {pts:[{x,y,t}], color, width, start}
  drawing: { active: false, pts: [], start: 0, lastSent: 0 },
};
const now = () => performance.now();

// --- 入力 ---
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  state.drawing.active = true;
  state.drawing.pts = [];
  state.drawing.start = now();
  pushPoint(e, state.drawing.start);
});
cv.addEventListener('pointermove', (e) => {
  if (!state.drawing.active) return;
  pushPoint(e, now());
});
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);

function pushPoint(e, t) {
  const x = e.offsetX, y = e.offsetY;
  const pts = state.drawing.pts;
  const last = pts[pts.length - 1];
  if (last) {
    const dx = x - last.x, dy = y - last.y;
    if (dx*dx + dy*dy < 2*2) return; // 2px未満は捨てる
  }
  pts.push({ x, y, t });
}
function endStroke() {
  if (!state.drawing.active) return;
  state.strokes.push({
    pts: state.drawing.pts.slice(),
    color: state.color,
    width: state.width,
    start: state.drawing.start,
  });
  state.drawing.active = false;
}

// --- 色ボタン ---
document.querySelectorAll('.btn[data-color]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.color = btn.dataset.color;
  });
});

// --- 描画（フェード付き）---
function render() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  const tNow = now();

  // 進行中の線を半透明でプレビュー
  if (state.drawing.active && state.drawing.pts.length > 1) {
    drawPath(state.drawing.pts, state.color, state.width, 1);
  }

  // 完成線（時間で透明化→寿命で削除）
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    const s = state.strokes[i];
    const life = (tNow - s.start) / (state.fadingSec * 1000);
    const alpha = Math.max(0, 1 - life);
    if (alpha <= 0) { state.strokes.splice(i, 1); continue; }
    drawPath(s.pts, s.color, s.width, alpha);
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function drawPath(pts, color, width, alpha) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  ctx.globalAlpha = 1;
}
