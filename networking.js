// networking.js
// 最初はページ内でループバックするダミー。Photon導入時は中身を差し替えるだけ。
const handlers = { begin:()=>{}, append:()=>{}, end:()=>{}, presence:()=>{}, joinRequest:()=>{}, approved:()=>{}, roomPropsChanged:()=>{} };

export const Networking = {
  on: handlers,
  async connect(roomId, userId) {
    // TODO：Photon Realtime JS SDK で初期化→room joinへ
    handlers.presence({ count: 1 });
    return true;
  },
  requestJoin(userId) {
    // TODO：PhotonならホストにJOIN_REQイベント送信
    setTimeout(()=>handlers.approved({ userId, roomId: localStorage.getItem('roomId') }), 200);
  },
  sendBegin(meta){ setTimeout(()=>handlers.begin(meta), 0); },
  sendAppend(id, batch){ setTimeout(()=>handlers.append(id, batch), 0); },
  sendEnd(id){ setTimeout(()=>handlers.end(id), 0); },
  approveJoin(userId){ /* Photonなら allowlist 更新→対象へ承認イベント */ },
};
