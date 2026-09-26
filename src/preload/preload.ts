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
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  stashRefresh: () => ipcRenderer.invoke("stash:refresh"),
  stashSetQty: (tabId, name, qty) => ipcRenderer.invoke("stash:setQty", tabId, name, qty),
  stashDeleteTab: (tabId) => ipcRenderer.invoke("stash:deleteTab", tabId),
  updateWaystoneMods: () => ipcRenderer.invoke("waystoneMods:update"),
  checkTabSetup: () => ipcRenderer.invoke("stash:checkSetup"),
  gfnStart: () => ipcRenderer.invoke("gfn:start"),
  gfnEnd: () => ipcRenderer.invoke("gfn:end"),
  setCustomPrice: (name, div) => ipcRenderer.invoke("price:custom", name, div),
  captureRect: (rect, mode) => ipcRenderer.invoke("capture:rect", rect, mode),
  copyText: (text) => ipcRenderer.send("clipboard:write", text),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  resizeOverlay: (height) => ipcRenderer.send("overlay:resize", height),
  showMain: () => ipcRenderer.send("main:show"),
  setOverlayFocus: (focus) => ipcRenderer.send("overlay:focus", focus),
};

contextBridge.exposeInMainWorld("api", api);
