import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("companion", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config: unknown) => ipcRenderer.invoke("config:save", config),
  onLaunchStatus: (callback: (status: { ok: boolean; message: string }) => void) =>
    ipcRenderer.on("launch:status", (_event, status) => callback(status)),
});
