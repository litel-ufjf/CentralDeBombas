const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bomba", {
  listPorts: () => ipcRenderer.invoke("serial:list"),
  connect: (portPath) => ipcRenderer.invoke("serial:connect", portPath),
  disconnect: () => ipcRenderer.invoke("serial:disconnect"),
  write: (line) => ipcRenderer.invoke("serial:write", line),
  onData: (handler) => {
    const listener = (_event, line) => handler(line);
    ipcRenderer.on("serial:data", listener);
    return () => ipcRenderer.removeListener("serial:data", listener);
  },
  onClosed: (handler) => {
    const listener = (_event, reason) => handler(reason);
    ipcRenderer.on("serial:closed", listener);
    return () => ipcRenderer.removeListener("serial:closed", listener);
  },
  store: {
    currentUser: () => ipcRenderer.invoke("store:currentUser"),
    load: () => ipcRenderer.invoke("store:load"),
    saveCalibrations: (calibrations) =>
      ipcRenderer.invoke("store:saveCalibrations", calibrations),
    saveRecipes: (recipes) => ipcRenderer.invoke("store:saveRecipes", recipes),
    saveCharts: (layouts) => ipcRenderer.invoke("store:saveCharts", layouts),
    saveExperiments: (programs) =>
      ipcRenderer.invoke("store:saveExperiments", programs),
    importLocal: (snapshot) => ipcRenderer.invoke("store:importLocal", snapshot),
    savePreferences: (preferences) =>
      ipcRenderer.invoke("store:savePreferences", preferences),
  },
});
