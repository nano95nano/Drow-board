// networking.js (Photon 版)
const EV = { BEGIN: 1, APPEND: 2, END: 3 };

export const Networking = (() => {
  const handlers = { begin:()=>{}, append:()=>{}, end:()=>{}, presence:()=>{} };

  // ---- 内部状態 ----
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

  function setupClient(appId, appVersion = "1.0") {
    // WSS + JPリージョンを想定（必要なら変更可）
    client = new Photon.LoadBalancing.LoadBalancingClient(
      Photon.ConnectionProtocol.Wss,
      appId,
      appVersion
    );

    // ログ（必要ならコメントアウト）
    client.logger.level = Photon.LogLevel.ERROR;

    // ---- コールバック群 ----
    client.onStateChange = (state) => {
      // console.log("state:", state, client.stateToString(state));
    };

    client.onJoinRoom = () => {
      joined = true;
      updatePresence();
    };

    client.onActorJoin = () => updatePresence();
    client.onActorLeave = () => updatePresence();

    client.onEvent = (code, content/*, actor*/) => {
      switch (code) {
        case EV.BEGIN:
          handlers.begin(content);
          break;
        case EV.APPEND:
          handlers.append(content.strokeId, content.batch);
          break;
        case EV.END:
          handlers.end(content.strokeId);
          break;
      }
    };
  }

  async function connectToRoom(roomId, appId, region = "jp") {
    return new Promise((resolve) => {
      currentRoomId = roomId;

      setupClient(appId);

      // 1) 接続 → 2) ルーム参加
      client.connectToRegionMaster(region);

      // ポーリングで state を見て joinOrCreate
      const timer = setInterval(() => {
        // 5 = JoinedLobby, 3 = ConnectedToMaster など（SDKの内部状態）
        if (client.isConnectedToMaster()) {
          clearInterval(timer);
          // 非公開・1対1
          client.opJoinOrCreateRoom({
            name: roomId,
            isVisible: false,
            maxPlayers: 2,
          });
          // join 完了は onJoinRoom で検出
          const waitJoin = setInterval(() => {
            if (joined) {
              clearInterval(waitJoin);
              resolve(true);
            }
            if (!client.isConnected()) {
              clearInterval(waitJoin);
              resolve(false);
            }
          }, 50);
        } else if (!client.isConnected()) {
          clearInterval(timer);
          resolve(false);
        }
      }, 50);
    });
  }

  return {
    on: handlers,

    async connect(roomId, userId /* userIdは今は未使用 */) {
      // ★ ここを自分の AppId に置き換える
      const APP_ID = "836234e9-3882-4cfa-91f3-576be9382171";
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
      // 自分の画面にも反映（ローカルエコー）
      handlers.begin(meta);
    },

    sendAppend(strokeId, batch) {
      if (!this.isConnected()) return;
      const payload = { strokeId, batch };
      client.raiseEvent(EV.APPEND, payload, {
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

