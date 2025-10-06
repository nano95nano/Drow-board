// networking.js（デモ用：同一端末ループバック。実機間はPhotonに差し替え）
export const Networking = (() => {
  const handlers = { begin:()=>{}, append:()=>{}, end:()=>{}, presence:()=>{} };
  let connected = false;
  let roomId = null;

  return {
    on: handlers,
    async connect(id) {
      roomId = (id || "").trim();
      connected = !!roomId;
      if (connected) setTimeout(() => handlers.presence({ roomId, count: 1 }), 0);
      return connected;
    },
    isConnected() { return connected; },
    sendBegin(meta)  { if (!connected) return; setTimeout(() => handlers.begin(meta), 0); },
    sendAppend(id,b) { if (!connected) return; setTimeout(() => handlers.append(id,b), 0); },
    sendEnd(id)      { if (!connected) return; setTimeout(() => handlers.end(id), 0); },
  };
})();

