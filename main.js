const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const Store = require("electron-store");
const { Client } = require("ssh2");
const store = new Store();

let mainWindow;
// 将 Connection 和 Stream 分开存储，方便全局访问
let activeSSHConnection = null;
let activeStream = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // 推荐的安全配置：关闭 Node 集成，使用 Preload
      nodeIntegration: false, 
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(app.getAppPath(), "preload.js"),
    },
  });

  // mainWindow.maximize(); // 可选：启动时最大化

  if (process.env.NODE_ENV === "development") {
    console.log("Running in development mode");
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- Store 处理 (保持不变) ---
ipcMain.handle("saveServerConfig", async (event, config) => {
  const servers = store.get("servers", []);
  servers.push(config);
  store.set("servers", servers);
  return servers;
});

ipcMain.handle("getServerConfigs", async () => {
  return store.get("servers", []);
});

ipcMain.handle("deleteServerConfig", async (event, id) => {
  const servers = store.get("servers", []);
  const updatedServers = servers.filter((server) => server.id !== id);
  store.set("servers", updatedServers);
  return updatedServers;
});

ipcMain.handle("updateServerConfig", async (event, config) => {
  const servers = store.get("servers", []);
  const index = servers.findIndex((server) => server.id === config.id);
  if (index !== -1) {
    servers[index] = config;
    store.set("servers", servers);
  }
  return servers;
});

// --- SSH 核心逻辑 (重构后) ---

/**
 * 辅助函数：清理当前连接资源
 */
function cleanupSSH() {
  if (activeStream) {
    activeStream.end();
    activeStream = null;
  }
  if (activeSSHConnection) {
    activeSSHConnection.end();
    activeSSHConnection.destroy(); // 强制销毁
    activeSSHConnection = null;
  }
}

ipcMain.handle("connectSSH", async (event, server) => {
  // 1. 如果有旧连接，先清理
  cleanupSSH();

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      activeSSHConnection = conn;
      
      // 开启 Shell，设置默认终端类型为 xterm，以此支持颜色
      conn.shell({ term: 'xterm-256color', rows: 24, cols: 80 }, (err, stream) => {
        if (err) {
          cleanupSSH();
          reject(err.message);
          return;
        }

        activeStream = stream;

        // 监听数据：发给前端
        stream.on("data", (data) => {
          // 建议使用 Buffer 传输，防止中文乱码，前端 xterm 能处理 Uint8Array
          event.sender.send("ssh-data", data.toString()); 
        });

        // 监听关闭
        stream.on("close", () => {
          event.sender.send("ssh-closed");
          cleanupSSH();
        });

        resolve("connected");
      });
    });

    conn.on("error", (err) => {
      cleanupSSH();
      // 如果还没 resolve，这里 reject；如果已经连接中途断开，前端通过 ssh-closed 处理
      reject(err.message);
    });

    // 监听底层 Socket 关闭
    conn.on("end", () => {
        cleanupSSH();
    });

    try {
        conn.connect({
          host: server.host,
          port: parseInt(server.port) || 22,
          username: server.username,
          password: server.password,
          // 建议添加超时设置
          readyTimeout: 20000, 
        });
    } catch (err) {
        reject(err.message);
    }
  });
});

ipcMain.handle("disconnectSSH", async () => {
  cleanupSSH();
  return true;
});

// --- 数据发送逻辑 ---

// 接收前端的输入，写入 SSH 流
// 对应 preload.js: sendSSHData: (data) => ipcRenderer.send('ssh-input', data)
// 注意：这里改用了 ipcMain.on 而不是 handle，因为输入通常不需要等待回复，速度更快
ipcMain.on("ssh-data", (event, data) => {
  if (activeStream && !activeStream.destroyed) {
    try {
      activeStream.write(data);
    } catch (err) {
      console.error("Write error:", err);
    }
  }
});

// --- [新功能] 终端尺寸调整 ---
// 对应 xterm-addon-fit 的 onResize 事件
// preload.js 需要暴露: resizeSSH: (cols, rows) => ipcRenderer.send('ssh-resize', {cols, rows})
ipcMain.on("ssh-resize", (event, { cols, rows }) => {
  if (activeStream && !activeStream.destroyed) {
    try {
      activeStream.setWindow(rows, cols, 0, 0);
    } catch (err) {
      // 忽略错误
    }
  }
});