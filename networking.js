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

 // networking.js の connectToRoom をこの実装に置換
// ★ここを丸ごと置換
async function connectToRoom(roomId, appId, region = 'asia') {
  return new Promise((resolve) => {
    currentRoomId = roomId;
    setupClient(appId);

    let triedCreate = false;

    // v4用の定数を取得（無ければ空オブジェクト）
    const LBC   = Photon.LoadBalancing.LoadBalancingClient;
    const State = (LBC && LBC.State) || {};
    const OPC   = Photon.LoadBalancing.Constants.OperationCode;

    // 状態ログ（Stateが無い環境でも動くようガード）
    client.onStateChange = (s) => {
      const name = State ? (Object.keys(State)[s] || s) : s;
      console.log('Client: State:', name);

      // Master 接続後にロビーへ
      if (State.ConnectedToMaster !== undefined ? s === State.ConnectedToMaster : name === 'ConnectedToMaster') {
        console.log('Connected to Master → joinLobby()');
        client.joinLobby();
      }
    };

    // ロビー参加後に部屋へ join（無ければ後で create にフォールバック）
    client.onJoinLobby = () => {
      console.log('Joined Lobby → joinRoom:', roomId);
      client.joinRoom(roomId);
    };

    // 部屋参加完了
    client.onJoinRoom = () => {
      console.log('Joined room:', roomId);
      updatePresence();
      resolve(true);
    };

    // Join/Create の結果でフォールバック
    const origOp = client.onOperationResponse;
    client.onOperationResponse = (errCode, errMsg, opCode, resp) => {
      origOp && origOp(errCode, errMsg, opCode, resp);
      console.warn('OpResp:', { opCode, errCode, errMsg, resp });

      if (opCode === OPC.Join) {
        if (errCode && !triedCreate) {
          triedCreate = true;
          console.log('createRoom:', roomId);
          client.createRoom(roomId, { maxPlayers: 2, isVisible: false });
        } else if (errCode) {
          resolve(false);
        }
      } else if (opCode === OPC.CreateGame) {
        if (!errCode) {
          console.log('joinRoom (after create):', roomId);
          client.joinRoom(roomId);
        } else {
          resolve(false);
        }
      }
    };

    client.onError = (code, msg) => {
      console.error('Photon onError:', code, msg);
      resolve(false);
    };

    console.log('Connecting to region:', region);
    client.connectToRegionMaster(region);
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




