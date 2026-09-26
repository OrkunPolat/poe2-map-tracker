import { contextBridge, ipcRenderer } from "electron";
import type { Api, Snapshot } from "../shared/ipc";

const api: Api = {
  getSnapshot: () => ipcRenderer.invoke("snapshot:get"),
  onSnapshot: (cb) => {
    const listener = (_: unknown, s: Snapshot) => cb(s);
    ipcRenderer.on("snapshot", listener);
    return () => ipcRenderer.removeListener("snapshot", listener);
  },
  dispatch: (ev) => ipcRenderer.invoke("dispatch", ev),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  pickLogFile: () => ipcRenderer.invoke("log:pick"),
  exportCsv: () => ipcRenderer.invoke("export:csv"),
  refreshPrices: () => ipcRenderer.invoke("prices:refresh"),
  openDataFolder: () => ipcRenderer.invoke("folder:data"),
  resizeOverlay: (height) => ipcRenderer.send("overlay:resize", height),
  showMain: () => ipcRenderer.send("main:show"),
};

contextBridge.exposeInMainWorld("api", api);
