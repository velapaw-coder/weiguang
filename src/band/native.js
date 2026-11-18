import { Capacitor, registerPlugin } from '@capacitor/core';

export const UteBand = registerPlugin('UteBand', {
  web: () => ({
    async getState() {
      return {
        platform: 'web',
        sdk: 'unavailable',
        bluetooth: 'unavailable',
        connection: 'disconnected',
        scanning: false,
        error: '需要安装了优创 SDK 的安卓客户端',
        permissions: false,
        notifications: false,
        backgroundPolling: false,
      };
    },
    async requestBlePermissions() { return this.getState(); },
    async requestNotifyPermission() { return { granted: false }; },
    async startScan() { return { ok: false, error: 'web_unavailable' }; },
    async stopScan() { return { ok: true }; },
    async connect() { return { ok: false, error: 'web_unavailable' }; },
    async disconnect() { return { ok: true }; },
    async syncNow() { return { ok: false, error: 'web_unavailable' }; },
    async addListener() { return { remove() {} }; },
  }),
});

export const WeiguangStore = registerPlugin('WeiguangStore', {
  web: () => ({
    async snapshot() {
      return {
        database: 'unavailable',
        error: '健康数据只保存在安卓 SQLite。浏览器预览不会用 localStorage 冒充数据库。',
        devices: [],
        sync: [],
        goals: [],
        tasks: [],
        latest: {},
        meta: {},
        coachResults: [],
        uninstallDeletesData: true,
        crossDeviceSync: false,
      };
    },
    async listObservations() { return { rows: [] }; },
    async saveGoal() { return { ok: false, error: 'sqlite_android_only' }; },
    async createTask() { return { ok: false, error: 'sqlite_android_only' }; },
    async updateTask() { return { ok: false, error: 'sqlite_android_only' }; },
    async setTaskStatus() { return { ok: false, error: 'sqlite_android_only' }; },
    async setReminder() { return { ok: false, error: 'sqlite_android_only' }; },
    async deleteAll() { return { ok: false, error: 'sqlite_android_only' }; },
    async setMeta() { return { ok: false, error: 'sqlite_android_only' }; },
    async debugModelStatus() { return { debug: false, configured: false }; },
    async setDebugModelKey() { return { ok: false, error: 'sqlite_android_only', debug: false, configured: false }; },
    async postDebugModel() { return { sent: false, reason: 'sqlite_android_only', httpStatus: 0, bodyText: '' }; },
    async saveGraphSnapshot() { return { ok: false, error: 'sqlite_android_only' }; },
    async getGraphSnapshot() { return {}; },
    async saveCoachResult() { return { ok: false, error: 'sqlite_android_only' }; },
  }),
});

export function isAndroidApp() {
  return Capacitor.getPlatform() === 'android';
}
