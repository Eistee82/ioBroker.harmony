"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigWriter = void 0;
const http_1 = __importDefault(require("http"));
/**
 * Writes configuration changes to Harmony Hubs via WebSocket.
 *
 * CRITICAL RULES (from reverse engineering):
 * - Every write MUST include `forceUpdate: true` or changes are lost on hub restart
 * - Every write MUST be followed by `home.hub.sync`
 * - Activity generation can take 10+ seconds, use 60000ms timeout
 * - Don't batch multiple writes - sync between each one
 */
class ConfigWriter {
    constructor(adapter) {
        this.msgCounter = 0;
        this.adapter = adapter;
    }
    /**
     * Send a query to the hub and return the result. Used by message-handler for read operations.
     */
    async sendHubQuery(hubName, cmd, params, timeout = 10000) {
        return this.sendCommand(hubName, cmd, params, timeout);
    }
    /**
     * Send a command via HTTP POST to the hub (for commands that don't work over WebSocket).
     * The Harmony app uses this for connect.discoveryinfo, setup.firmware, setup.account etc.
     */
    sendHttpPost(hubName, cmd, params, timeout = 10000) {
        var _a;
        const hub = this.adapter.hubs[hubName];
        if (!hub) {
            return Promise.reject(new Error(`Hub not found: ${hubName}`));
        }
        const ip = hub.ip || ((_a = hub.client) === null || _a === void 0 ? void 0 : _a.ip);
        if (!ip) {
            return Promise.reject(new Error(`Hub IP not available: ${hubName}`));
        }
        const body = JSON.stringify({ id: ++this.msgCounter, cmd, params, timeout });
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`HTTP command '${cmd}' timed out after ${timeout}ms`));
            }, timeout);
            const req = http_1.default.request({
                hostname: ip,
                port: 8088,
                method: 'POST',
                headers: {
                    'Origin': 'http://localhost.nebula.myharmony.com',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Charset': 'utf-8',
                    'Content-Length': Buffer.byteLength(body),
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk.toString(); });
                res.on('end', () => {
                    clearTimeout(timer);
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    }
                    catch {
                        resolve(data);
                    }
                });
            });
            req.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
            this.adapter.log.debug(`ConfigWriter HTTP POST: ${cmd} to ${ip}:8088`);
            req.write(body);
            req.end();
        });
    }
    /**
     * Send a raw command to the hub's WebSocket and wait for the matching response.
     */
    sendCommand(hubName, cmd, params, timeout = 30000) {
        const hub = this.adapter.hubs[hubName];
        if (!hub) {
            return Promise.reject(new Error(`Hub not found: ${hubName} (available: ${Object.keys(this.adapter.hubs).join(', ')})`));
        }
        if (!hub.client) {
            return Promise.reject(new Error(`Hub client not initialized: ${hubName}`));
        }
        if (!hub.client.ws) {
            return Promise.reject(new Error(`Hub WebSocket not connected: ${hubName} (client status: ${hub.client.status})`));
        }
        const ws = hub.client.ws;
        const id = `config-writer-${++this.msgCounter}-${Date.now()}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                ws.removeListener('message', onMessage);
                reject(new Error(`Command '${cmd}' timed out after ${timeout}ms`));
            }, timeout);
            const onMessage = (raw) => {
                var _a, _b, _c, _d;
                try {
                    const data = JSON.parse(raw);
                    // Hub responds in two formats:
                    // 1) Direct: { cmd, code, id, msg, data } (most commands)
                    // 2) Wrapped: { hbus: { cmd, id, ... } } (some internal commands)
                    const msgId = (data === null || data === void 0 ? void 0 : data.id) || ((_a = data === null || data === void 0 ? void 0 : data.hbus) === null || _a === void 0 ? void 0 : _a.id);
                    if (msgId === id) {
                        clearTimeout(timer);
                        ws.removeListener('message', onMessage);
                        const error = (_b = data === null || data === void 0 ? void 0 : data.hbus) === null || _b === void 0 ? void 0 : _b.error;
                        if (error) {
                            reject(new Error(`Hub error for '${cmd}': ${JSON.stringify(error)}`));
                        }
                        else {
                            // Return the data payload - include even for non-200 codes
                            // (e.g. firmware check returns code 1001 but still has useful data)
                            resolve((_d = (_c = data === null || data === void 0 ? void 0 : data.data) !== null && _c !== void 0 ? _c : data === null || data === void 0 ? void 0 : data.hbus) !== null && _d !== void 0 ? _d : data);
                        }
                    }
                }
                catch {
                    // Ignore non-JSON messages
                }
            };
            ws.on('message', onMessage);
            const message = JSON.stringify({
                hbus: { cmd, id, params },
            });
            this.adapter.log.debug(`ConfigWriter sending: ${cmd} (id=${id})`);
            ws.send(message);
        });
    }
    /**
     * Sync hub config. setup.sync triggers cloud sync (no response expected).
     * proxy.resource?put already persists changes, so sync is optional.
     */
    async syncHub(hubName) {
        var _a;
        try {
            // setup.sync triggers cloud sync - fire and forget (no response)
            const hub = this.adapter.hubs[hubName];
            if ((_a = hub === null || hub === void 0 ? void 0 : hub.client) === null || _a === void 0 ? void 0 : _a.ws) {
                hub.client.ws.send(JSON.stringify({
                    hbus: { cmd: 'setup.sync', id: `sync-${++this.msgCounter}`, params: {} },
                }));
            }
            this.adapter.log.info(`Hub '${hubName}' sync triggered`);
            return { success: true, data: { synced: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`syncHub failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Write configuration changes via proxy.resource?put.
     * This is the native hub command for persisting config changes (tested & confirmed).
     */
    async writeConfig(hubName, changes) {
        try {
            const params = { ...changes, forceUpdate: true };
            await this.sendCommand(hubName, 'proxy.resource?put', params);
            this.adapter.log.info(`writeConfig: proxy.resource?put succeeded for '${hubName}'`);
            return { success: true, data: { written: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`writeConfig failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Add a device by reading the current DeviceList, appending the new device,
     * and writing it back via proxy.resource?put.
     */
    async addDevice(hubName, device) {
        try {
            // Read current device list
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/DeviceList',
            });
            const resource = currentList === null || currentList === void 0 ? void 0 : currentList.resource;
            const devices = (resource === null || resource === void 0 ? void 0 : resource.DevicesWithFeatures) || [];
            // Append new device
            devices.push({ Device: device, Features: [] });
            // Write back
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/DeviceList',
                resource: { ...resource, DevicesWithFeatures: devices },
                forceUpdate: true,
            });
            this.adapter.log.info(`addDevice: device added to '${hubName}'`);
            return { success: true, data: { added: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`addDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Delete a device by reading the current DeviceList, removing the device,
     * and writing it back via proxy.resource?put.
     */
    async deleteDevice(hubName, deviceId) {
        try {
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/DeviceList',
            });
            const resource = currentList === null || currentList === void 0 ? void 0 : currentList.resource;
            const devices = (resource === null || resource === void 0 ? void 0 : resource.DevicesWithFeatures) || [];
            const filtered = devices.filter((d) => { var _a, _b, _c; return String((_b = (_a = d === null || d === void 0 ? void 0 : d.Device) === null || _a === void 0 ? void 0 : _a.Id) !== null && _b !== void 0 ? _b : (_c = d === null || d === void 0 ? void 0 : d.Device) === null || _c === void 0 ? void 0 : _c.id) !== String(deviceId); });
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/DeviceList',
                resource: { ...resource, DevicesWithFeatures: filtered },
                forceUpdate: true,
            });
            this.adapter.log.info(`deleteDevice: device '${deviceId}' deleted from '${hubName}'`);
            return { success: true, data: { deleted: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`deleteDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Save (update) a device via proxy.resource?put.
     */
    async saveDevice(hubName, device) {
        try {
            const params = { ...device, forceUpdate: true };
            await this.sendCommand(hubName, 'proxy.resource?put', params);
            this.adapter.log.info(`saveDevice: device saved on '${hubName}'`);
            return { success: true, data: { saved: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`saveDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Create an activity by reading the current ActivityList, appending the new
     * activity, and writing it back via proxy.resource?put.
     */
    async generateActivity(hubName, activityDef) {
        try {
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/ActivityList',
            });
            const resource = currentList === null || currentList === void 0 ? void 0 : currentList.resource;
            const activities = (resource === null || resource === void 0 ? void 0 : resource.Activities) || [];
            activities.push(activityDef);
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/ActivityList',
                resource: { ...resource, Activities: activities },
                forceUpdate: true,
            }, 60000);
            this.adapter.log.info(`generateActivity: activity created on '${hubName}'`);
            return { success: true, data: { created: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`generateActivity failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Update activity roles via proxy.resource?put with the full config.
     */
    async updateActivityRoles(hubName, roles) {
        try {
            await this.sendCommand(hubName, 'proxy.resource?put', {
                ...roles,
                forceUpdate: true,
            });
            this.adapter.log.info(`updateActivityRoles: roles updated on '${hubName}'`);
            return { success: true, data: { updated: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`updateActivityRoles failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
    /**
     * Delete an activity by reading the current ActivityList, removing the activity,
     * and writing it back via proxy.resource?put.
     */
    async deleteActivity(hubName, activityId) {
        try {
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/ActivityList',
            });
            const resource = currentList === null || currentList === void 0 ? void 0 : currentList.resource;
            const activities = (resource === null || resource === void 0 ? void 0 : resource.Activities) || [];
            const filtered = activities.filter((a) => { var _a, _b; return String((_b = (_a = a === null || a === void 0 ? void 0 : a['Id-']) !== null && _a !== void 0 ? _a : a === null || a === void 0 ? void 0 : a.Id) !== null && _b !== void 0 ? _b : a === null || a === void 0 ? void 0 : a.id) !== String(activityId); });
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/ActivityList',
                resource: { ...resource, Activities: filtered },
                forceUpdate: true,
            });
            this.adapter.log.info(`deleteActivity: activity '${activityId}' deleted from '${hubName}'`);
            return { success: true, data: { deleted: true } };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`deleteActivity failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
}
exports.ConfigWriter = ConfigWriter;
//# sourceMappingURL=config-writer.js.map