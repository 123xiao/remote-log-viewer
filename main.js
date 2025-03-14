const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const Store = require("electron-store");
const { Client } = require("ssh2");
const store = new Store();

let activeSSHConnection = null;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 开发环境下连接到Vite开发服务器
  if (process.env.NODE_ENV === "development") {
    console.log("Running in development mode");
    console.log("Loading URL:", "http://localhost:5173");
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    console.log("Running in production mode");
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

// 处理服务器配置的存储
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

let sshDataHandler = null;

ipcMain.handle("connectSSH", async (event, server) => {
  if (activeSSHConnection) {
    activeSSHConnection.end();
    activeSSHConnection = null;
  }

  if (sshDataHandler) {
    ipcMain.removeListener("ssh-data", sshDataHandler);
    sshDataHandler = null;
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      activeSSHConnection = conn;
      conn.shell((err, stream) => {
        if (err) {
          reject(err.message);
          return;
        }

        stream.on("data", (data) => {
          event.sender.send("ssh-data", data.toString());
        });

        stream.on("close", () => {
          event.sender.send("ssh-closed");
          if (sshDataHandler) {
            ipcMain.removeListener("ssh-data", sshDataHandler);
            sshDataHandler = null;
          }
          activeSSHConnection = null;
        });

        sshDataHandler = (event, data) => {
          if (stream && !stream.destroyed) {
            stream.write(data);
          }
        };
        ipcMain.on("ssh-data", sshDataHandler);

        resolve("connected");
      });
    });

    conn.on("error", (err) => {
      reject(err.message);
    });

    conn.connect({
      host: server.host,
      port: parseInt(server.port) || 22,
      username: server.username,
      password: server.password,
    });
  });
});

ipcMain.handle("disconnectSSH", async () => {
  if (activeSSHConnection) {
    // 确保清理所有事件监听器
    if (sshDataHandler) {
      ipcMain.removeListener("ssh-data", sshDataHandler);
      sshDataHandler = null;
    }
    // 强制结束SSH连接
    activeSSHConnection.end();
    activeSSHConnection.destroy();
    activeSSHConnection = null;
  }
  return true;
});

ipcMain.handle("sendSSHData", async (event, data) => {
  if (!activeSSHConnection) {
    event.sender.send("ssh-data", "Error: No active SSH connection\n");
    return;
  }

  try {
    if (sshDataHandler) {
      sshDataHandler(event, data);
    } else {
      event.sender.send("ssh-data", "Error: SSH stream is not available\n");
    }
  } catch (error) {
    console.error("Error writing to SSH connection:", error);
    event.sender.send("ssh-data", "Error: Failed to send data to SSH connection\n");
    
    // 如果发生错误，尝试清理连接
    if (activeSSHConnection) {
      activeSSHConnection.end();
      activeSSHConnection = null;
    }
    if (sshDataHandler) {
      ipcMain.removeListener("ssh-data", sshDataHandler);
      sshDataHandler = null;
    }
  }
});
