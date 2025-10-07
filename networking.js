// networking.js（Photon Realtime JS v4.x 用・完成版）
const EV = { BEGIN: 1, APPEND: 2, END: 3 };

// SDKは index.html で先に vendor/photon.min.js を読み込む前提
function ensurePhotonLoaded() {
  return new Promise((resolve, reject) => {
    if (window.Photon) return resolve();
    reject(new Error('Photon SDK not found. Include ./vendor/photon.min.js before app.js'));
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
      Photon.ConnectionProtocol.Wss, appId, appVersion
    );
    client.logger.level = Photon.LogLevel.INFO; // 必要なら ERROR に

    client.onStateChange = s => {
  // v4 には stateToString が無いので自前で名前化（なければ数値を出す）
  const StateNames = Photon.LoadBalancing.LoadBalancingClient.State
                     ? Object.keys(Photon.LoadBalancing.LoadBalancingClient.State)
                     : null;
  const name = StateNames && StateNames[s] ? StateNames[s] : s;
  console.log('Client: State:', name);
};

    client.onError = (code, msg) => console.error('Photon onError:', code, msg);
    client.onOperationResponse = (errCode, errMsg, opCode, resp) =>
      console.warn('OpResp:', {opCode, errCode, errMsg, resp});

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

  // ★ ここが connectToRoom（この関数ブロックが全部です）
  async function connectToRoom(roomId, appId, region = 'asia') {
    return new Promise((resolve) => {
      currentRoomId = roomId;
      setupClient(appId);

      // 1) マスターへ接続
      console.log('Connecting to region:', region);
      client.connectToRegionMaster(region);

      // 2) マスター接続完了を待って joinRoom（なければ作成）
      const t1 = setInterval(() => {
        const masterOK = client.isConnectedToMaster && client.isConnectedToMaster();
        if (masterOK) {
          clearInterval(t1);

          // まず join、なければ create → join にフォールバック
          let triedCreate = false;

          const tryJoin = () => {
            console.log('joinRoom:', roomId);
            client.joinRoom(roomId);
          };
          const tryCreate = () => {
            console.log('createRoom:', roomId);
            client.createRoom(roomId, { maxPlayers: 2, isVisible: false });
          };

          // 参加完了待ち
          const t2 = setInterval(() => {
            if (client.isJoinedToRoom && client.isJoinedToRoom()) {
              clearInterval(t2);
              resolve(true);
            }
            // 断線検知
            const lost = !client.isConnectedToMaster || !client.isConnectedToMaster();
            if (lost) { clearInterval(t2); resolve(false); }
          }, 80);

          // join してみる
          tryJoin();

          // join失敗→create→join のフォールバック
          const orig = client.onOperationResponse;
          client.onOperationResponse = (errCode, errMsg, opCode, resp) => {
            orig && orig(errCode, errMsg, opCode, resp);
            const OPC = Photon.LoadBalancing.Constants.OperationCode;
            if (opCode === OPC.Join) {
              if (errCode && !triedCreate) { triedCreate = true; tryCreate(); }
            } else if (opCode === OPC.CreateGame) {
              if (!errCode) tryJoin();
            }
          };
        } else {
          // 接続失敗
          const lost = !client.isConnectedToMaster || !client.isConnectedToMaster();
          if (lost) { clearInterval(t1); resolve(false); }
        }
      }, 100);
    });
  }

  return {
    on: handlers,

    async connect(roomId /*, userId */) {
      const APP_ID = '836234e9-3882-4cfa-91f3-576be9382171'; // ←あなたの Realtime AppId
      await ensurePhotonLoaded();
      joined = false;
      return await connectToRoom(roomId, APP_ID, 'asia'); // jpがダメな環境があるのでまず asia
    },

    isConnected() {
      return !!(client && client.isJoinedToRoom && client.isJoinedToRoom());
    },

    sendBegin(meta) {
      if (!this.isConnected()) return;
      client.raiseEvent(EV.BEGIN, meta, {
        receivers: Photon.LoadBalancing.Constants.ReceiverGroup.Others,
      });
      handlers.begin(meta); // 自分にも反映
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

