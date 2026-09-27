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
  itemHistory: (name) => ipcRenderer.invoke("prices:history", name),
  priceCheckGet: () => ipcRenderer.invoke("pricecheck:get"),
  onPriceCheck: (cb) => {
    const listener = (_: unknown, s: Parameters<typeof cb>[0]) => cb(s);
    ipcRenderer.on("pricecheck:state", listener);
    return () => ipcRenderer.removeListener("pricecheck:state", listener);
  },
  priceCheckSearch: (q) => ipcRenderer.invoke("pricecheck:search", q),
  priceCheckClose: () => ipcRenderer.send("pricecheck:close"),
  priceCheckAddToMap: (div) => ipcRenderer.invoke("pricecheck:addToMap", div),
  openDataFolder: () => ipcRenderer.invoke("folder:data"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  stashRefresh: () => ipcRenderer.invoke("stash:refresh"),
  stashSetQty: (tabId, name, qty) => ipcRenderer.invoke("stash:setQty", tabId, name, qty),
  stashDeleteTab: (tabId) => ipcRenderer.invoke("stash:deleteTab", tabId),
  updateWaystoneMods: () => ipcRenderer.invoke("waystoneMods:update"),
  checkTabSetup: () => ipcRenderer.invoke("stash:checkSetup"),
  gfnStart: () => ipcRenderer.invoke("gfn:start"),
  gfnEnd: () => ipcRenderer.invoke("gfn:end"),
  answerNewLeague: (switchTo) => ipcRenderer.invoke("league:answer", switchTo),
  setCustomPrice: (name, div) => ipcRenderer.invoke("price:custom", name, div),
  captureRect: (rect, mode) => ipcRenderer.invoke("capture:rect", rect, mode),
  copyText: (text) => ipcRenderer.send("clipboard:write", text),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  resizeOverlay: (height) => ipcRenderer.send("overlay:resize", height),
  showMain: () => ipcRenderer.send("main:show"),
  setOverlayFocus: (focus) => ipcRenderer.send("overlay:focus", focus),
};

contextBridge.exposeInMainWorld("api", api);
