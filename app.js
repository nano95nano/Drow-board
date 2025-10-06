// 通信は一旦外す：まず描けることだけ確認
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

const state = { color:'#118AB2', width:12, fadingSec:25,
  strokes:[], drawing:{ active:false, pts:[], start:0 } };
const now = () => performance.now();

cv.addEventListener('pointerdown', e=>{
  cv.setPointerCapture(e.pointerId);
  state.drawing.active = true;
  state.drawing.pts = [{x:e.offsetX, y:e.offsetY, t: now()}];
  state.drawing.start = now();
});
cv.addEventListener('pointermove', e=>{
  if (!state.drawing.active) return;
  const pts = state.drawing.pts;
  const last = pts[pts.length-1];
  const dx = e.offsetX-last.x, dy = e.offsetY-last.y;
  if (dx*dx+dy*dy < 4) return;
  pts.push({x:e.offsetX, y:e.offsetY, t: now()});
});
cv.addEventListener('pointerup', ()=> {
  if (!state.drawing.active) return;
  state.strokes.push({ pts:[...state.drawing.pts], color:state.color,
                       width:state.width, start:state.drawing.start });
  state.drawing.active = false;
});

document.querySelectorAll('.btn[data-color]').forEach(b=>{
  b.addEventListener('click', ()=> { state.color = b.dataset.color; });
});

function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);
  const t = now();

  if (state.drawing.active && state.drawing.pts.length>1)
    stroke(state.drawing.pts, state.color, state.width, 1);

  for (let i=state.strokes.length-1;i>=0;i--){
    const s = state.strokes[i];
    const a = 1 - ( (t - s.start) / (state.fadingSec*1000) );
    if (a<=0){ state.strokes.splice(i,1); continue; }
    stroke(s.pts, s.color, s.width, a);
  }
  requestAnimationFrame(draw);
}
function stroke(pts, color, width, alpha){
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.lineWidth=width; ctx.strokeStyle=color; ctx.globalAlpha=alpha;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke(); ctx.globalAlpha=1;
}
requestAnimationFrame(draw);

