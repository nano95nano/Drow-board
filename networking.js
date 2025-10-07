// networking.js (堅牢版 / Realtime JS)
const EV = { BEGIN: 1, APPEND: 2, END: 3 };

// --- SDKを確実に読み込む（ローカル同梱版）---
function ensurePhotonLoaded() {
  return new Promise((resolve, reject) => {
    if (window.Photon) return resolve(); // すでに読み込み済みなら即OK
    reject(new Error('Photon SDK not found. Did you include vendor/photon.min.js in index.html?'));
  });
}


export const Networking = (() => {
  const handlers = { begin:()=>{}, append:()=>{}, end:()=>{}, presence:()=>{} };

  let client = null;
  let joined = false;
  let currentRoomId = null;

  function updatePresence() {
    try {
      const room = client && client.myRoom();
      const count = room ? room.playerCount : 0;
      handlers.presence({ roomId: currentRoomId, count });
    } catch {}
  }

  function setupClient(appId, appVersion = '1.0') {
    client = new Photon.LoadBalancing.LoadBalancingClient(
      Photon.ConnectionProtocol.Wss,
      appId,
      appVersion
    );
    client.logger.level = Photon.LogLevel.ERROR;

    client.onJoinRoom = () => { joined = true; updatePresence(); };
    client.onActorJoin = () => updatePresence();
    client.onActorLeave = () => updatePresence();

    client.onEvent = (code, content) => {
      switch (code) {
        case EV.BEGIN:  handlers.begin(content); break;
        case EV.APPEND: handlers.append(content.strokeId, content.batch); break;
        case EV.END:    handlers.end(content.strokeId); break;
      }
    };
  }

  async function connectToRoom(roomId, appId, region = 'jp') {
    return new Promise((resolve) => {
      currentRoomId = roomId;
      setupClient(appId);
      client.connectToRegionMaster(region);

      const t1 = setInterval(() => {
        if (client.isConnectedToMaster()) {
          clearInterval(t1);
          client.opJoinOrCreateRoom({ name: roomId, isVisible: false, maxPlayers: 2 });
          const t2 = setInterval(() => {
            if (joined) { clearInterval(t2); resolve(true); }
            if (!client.isConnected()) { clearInterval(t2); resolve(false); }
          }, 50);
        } else if (!client.isConnected()) {
          clearInterval(t1);
          resolve(false);
        }
      }, 50);
    });
  }

  return {
    on: handlers,

    async connect(roomId /*, userId */) {
      const APP_ID = '836234e9-3882-4cfa-91f3-576be9382171'; // ←ここを置換！
      await ensurePhotonLoaded();
      joined = false;
      return await connectToRoom(roomId, APP_ID);
    },

    isConnected() {
      return !!(client && client.isJoinedToRoom && client.isJoinedToRoom());
    },

    sendBegin(meta) {
      if (!this.isConnected()) return;
      client.raiseEvent(EV.BEGIN, meta, {
        receivers: Photon.LoadBalancing.Constants.ReceiverGroup.Others,
      });
      handlers.begin(meta); // ローカルにも反映
    },

    sendAppend(strokeId, batch) {
      if (!this.isConnected()) return;
      client.raiseEvent(EV.APPEND, { strokeId, batch }, {
        receivers: Photon.LoadBalancing.Constants.ReceiverGroup.Others,
      });
      handlers.append(strokeId, batch);
    },

    sendEnd(strokeId) {
      if (!this.isConnected()) return;
      client.raiseEvent(EV.END, { strokeId }, {
        receivers: Photon.LoadBalancing.Constants.ReceiverGroup.Others,
      });
      handlers.end(strokeId);
    },
  };
})();

