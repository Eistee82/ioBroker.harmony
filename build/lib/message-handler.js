"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
const config_writer_js_1 = require("./config-writer.js");
const irdb_service_js_1 = require("./irdb-service.js");
class MessageHandler {
    constructor(adapter) {
        this.adapter = adapter;
        this.writer = new config_writer_js_1.ConfigWriter(adapter);
        this.irdb = new irdb_service_js_1.IRDBService(adapter.adapterDir || __dirname);
    }
    async handle(obj) {
        if (!(obj === null || obj === void 0 ? void 0 : obj.command))
            return;
        let response;
        try {
            switch (obj.command) {
                case 'getHubs':
                    response = this.getHubs();
                    break;
                case 'getConfig':
                    response = await this.getConfig(obj.message);
                    break;
                case 'getStateDigest':
                    response = await this.getStateDigest(obj.message);
                    break;
                case 'getDiscoveryInfo':
                    response = await this.getDiscoveryInfo(obj.message);
                    break;
                case 'testCommand':
                    response = await this.testCommand(obj.message);
                    break;
                case 'writeConfig':
                    response = await this.writer.writeConfig(obj.message.hubName, obj.message.changes);
                    break;
                case 'addDevice':
                    response = await this.writer.addDevice(obj.message.hubName, obj.message.device);
                    break;
                case 'deleteDevice':
                    response = await this.writer.deleteDevice(obj.message.hubName, obj.message.deviceId);
                    break;
                case 'saveDevice':
                    response = await this.writer.saveDevice(obj.message.hubName, obj.message.device);
                    break;
                case 'generateActivity':
                    response = await this.writer.generateActivity(obj.message.hubName, obj.message.activityDef);
                    break;
                case 'updateActivityRoles':
                    response = await this.writer.updateActivityRoles(obj.message.hubName, obj.message.roles);
                    break;
                case 'deleteActivity':
                    response = await this.writer.deleteActivity(obj.message.hubName, obj.message.activityId);
                    break;
                case 'renameHub':
                    response = await this.renameHub(obj.message);
                    break;
                case 'setSleepTimer':
                    response = await this.setSleepTimer(obj.message);
                    break;
                case 'syncHub':
                    response = await this.writer.syncHub(obj.message.hubName);
                    break;
                case 'startActivity':
                    response = await this.startActivity(obj.message);
                    break;
                case 'getCurrentActivity':
                    response = await this.getCurrentActivity(obj.message);
                    break;
                case 'changeChannel':
                    response = await this.changeChannel(obj.message);
                    break;
                case 'checkFirmware':
                    response = await this.checkFirmware(obj.message);
                    break;
                case 'startFirmwareUpdate':
                    response = await this.startFirmwareUpdate(obj.message);
                    break;
                case 'getSysInfo':
                    response = await this.getSysInfo(obj.message);
                    break;
                case 'getProvisionInfo':
                    response = await this.getProvisionInfo(obj.message);
                    break;
                case 'getCapabilities':
                    response = await this.getCapabilities(obj.message);
                    break;
                case 'getAutomationState':
                    response = await this.getAutomationState(obj.message);
                    break;
                case 'setAutomationState':
                    response = await this.setAutomationState(obj.message);
                    break;
                case 'runSequence':
                    response = await this.runSequence(obj.message);
                    break;
                case 'searchIRDB':
                    response = await this.searchIRDB(obj.message);
                    break;
                case 'getIRDBDeviceTypes':
                    response = await this.getIRDBDeviceTypes(obj.message);
                    break;
                case 'getIRDBCodeSets':
                    response = await this.getIRDBCodeSets(obj.message);
                    break;
                default:
                    response = { success: false, error: `Unknown command: ${obj.command}` };
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`Message handler error: ${msg}`);
            response = { success: false, error: msg };
        }
        if (obj.callback) {
            this.adapter.sendTo(obj.from, obj.command, response, obj.callback);
        }
    }
    getHubs() {
        const hubs = [];
        for (const [name, hub] of Object.entries(this.adapter.hubs)) {
            hubs.push({
                name,
                friendlyName: hub.friendlyName || name,
                ip: hub.ip || '',
                uuid: '',
                firmware: '',
                hubType: '',
                remoteId: '',
                connected: hub.connected || false,
                activities: Object.keys(hub.activities || {}).length,
                devices: Object.keys(hub.devices || {}).length,
            });
        }
        return { success: true, data: hubs };
    }
    async getConfig(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub client not available: ${msg.hubName}` };
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'Config request timed out' });
            }, 30000);
            hub.client.requestConfig();
            hub.client.once('config', (config) => {
                clearTimeout(timeout);
                resolve({ success: true, data: config });
            });
        });
    }
    async getStateDigest(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub not found: ${msg.hubName}` };
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'State request timed out' });
            }, 10000);
            hub.client.requestState();
            hub.client.once('state', (state) => {
                clearTimeout(timeout);
                resolve({ success: true, data: state });
            });
        });
    }
    async getDiscoveryInfo(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        // Build combined info from all available sources
        const info = {
            friendlyName: (hub === null || hub === void 0 ? void 0 : hub.friendlyName) || msg.hubName,
            ip: (hub === null || hub === void 0 ? void 0 : hub.ip) || '',
        };
        // All queries go over WebSocket using full vnd.logitech paths (tested and confirmed working)
        if (hub === null || hub === void 0 ? void 0 : hub.client) {
            // Discovery info: firmware, uuid, IP, port, protocols
            try {
                const disc = await this.writer.sendHubQuery(msg.hubName, 'connect.discoveryinfo?get', { format: 'json' });
                Object.assign(info, disc);
            }
            catch { /* ignore */ }
            // Provision info: email, accountId, remoteId, language
            try {
                const prov = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.setup/vnd.logitech.account?getProvisionInfo', { verb: 'get' });
                if (prov.email)
                    info.email = prov.email;
                if (prov.accountId)
                    info.accountId = prov.accountId;
                if (prov.activeRemoteId)
                    info.remoteId = String(prov.activeRemoteId);
                if (prov.language)
                    info.locale = prov.language;
            }
            catch { /* ignore */ }
            // System info: fw_ver, hw_ver, unit_id
            try {
                const sys = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.harmony/vnd.logitech.harmony.system?systeminfo', { verb: 'get' });
                if (sys.fw_ver)
                    info.firmwareVersion = sys.fw_ver;
                Object.assign(info, sys);
            }
            catch { /* ignore */ }
            // Pair info: hubType, productId, protocolVersion
            try {
                const pair = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.connect/vnd.logitech.pair', { verb: 'get' });
                if (pair.hubId)
                    info.hubType = pair.hubId;
                if (pair.productId)
                    info.productId = pair.productId;
                if (pair.protocolVersion)
                    info.protocolVersion = pair.protocolVersion;
            }
            catch { /* ignore */ }
        }
        return { success: true, data: info };
    }
    async searchIRDB(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.query))
            return { success: false, error: 'query required' };
        try {
            const results = await this.irdb.searchManufacturers(msg.query);
            return { success: true, data: results };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`IRDB search error: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }
    async getIRDBDeviceTypes(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.manufacturer))
            return { success: false, error: 'manufacturer required' };
        try {
            const types = await this.irdb.getDeviceTypes(msg.manufacturer);
            return { success: true, data: types };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`IRDB device types error: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }
    async getIRDBCodeSets(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.manufacturer) || !(msg === null || msg === void 0 ? void 0 : msg.deviceType))
            return { success: false, error: 'manufacturer and deviceType required' };
        try {
            const codeSets = await this.irdb.getCodeSets(msg.manufacturer, msg.deviceType);
            return { success: true, data: codeSets };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`IRDB code sets error: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }
    async renameHub(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName) || !(msg === null || msg === void 0 ? void 0 : msg.newName))
            return { success: false, error: 'hubName and newName required' };
        try {
            await this.writer.sendHttpPost(msg.hubName, 'connect.discoveryinfo?set', { friendlyName: msg.newName });
            return { success: true, data: { renamed: true } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async setSleepTimer(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub not found: ${msg.hubName}` };
        try {
            if (msg.minutes <= 0) {
                // Cancel sleep timer
                await this.writer.sendHubQuery(msg.hubName, 'harmony.engine?setsleeptimer', { interval: -1 });
            }
            else {
                await this.writer.sendHubQuery(msg.hubName, 'harmony.engine?setsleeptimer', { interval: msg.minutes * 60 });
            }
            return { success: true, data: { set: true } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async testCommand(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName) || !(msg === null || msg === void 0 ? void 0 : msg.command))
            return { success: false, error: 'hubName and command required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub not found: ${msg.hubName}` };
        const action = JSON.stringify({
            command: msg.command,
            type: msg.type || 'IRCommand',
            deviceId: msg.deviceId,
        });
        try {
            hub.client.requestKeyPress(action, 'press', 100);
            return { success: true, data: { sent: true } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async startActivity(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub not found: ${msg.hubName}` };
        try {
            hub.client.requestActivityChange(msg.activityId || '-1');
            return { success: true, data: { started: true } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async getCurrentActivity(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity', { verb: 'get' });
            return { success: true, data: result };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async changeChannel(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName) || !(msg === null || msg === void 0 ? void 0 : msg.channel))
            return { success: false, error: 'hubName and channel required' };
        try {
            await this.writer.sendHubQuery(msg.hubName, 'harmony.engine?changeChannel', {
                timestamp: 0,
                channel: msg.channel,
            });
            return { success: true, data: { changed: true } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async checkFirmware(msg) {
        var _a;
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        try {
            // Use the full vnd.logitech path over WebSocket (from decompiled APK BaseHub.java)
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logtech.setup/vnd.logitech.firmware?check', {});
            const data = (_a = result === null || result === void 0 ? void 0 : result.params) !== null && _a !== void 0 ? _a : result;
            return { success: true, data };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async startFirmwareUpdate(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub client not available: ${msg.hubName}` };
        try {
            // Use the full vnd.logitech path (from decompiled APK BaseHub.java)
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logtech.setup/vnd.logitech.firmware?update', {}, 60000);
            return { success: true, data: result };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async getSysInfo(msg) {
        var _a;
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.harmony/vnd.logitech.harmony.system?systeminfo', {});
            const data = (_a = result === null || result === void 0 ? void 0 : result.params) !== null && _a !== void 0 ? _a : result;
            return { success: true, data };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async getProvisionInfo(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHttpPost(msg.hubName, 'setup.account?getProvisionInfo', {});
            return { success: true, data: result };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async getCapabilities(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHttpPost(msg.hubName, 'proxy.resource?get', {
                uri: `harmony://Account/0/CapabilityList`,
            });
            return { success: true, data: result };
        }
        catch {
            return { success: true, data: {} };
        }
    }
    async getAutomationState(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName))
            return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHubQuery(msg.hubName, 'harmony.automation?getstate', {});
            return { success: true, data: result };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async setAutomationState(msg) {
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName) || !(msg === null || msg === void 0 ? void 0 : msg.deviceId))
            return { success: false, error: 'hubName and deviceId required' };
        try {
            await this.writer.sendHubQuery(msg.hubName, 'harmony.automation?setstate', {
                state: { [msg.deviceId]: msg.state },
            });
            return { success: true, data: { set: true } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
    async runSequence(msg) {
        var _a;
        if (!(msg === null || msg === void 0 ? void 0 : msg.hubName) || !((_a = msg === null || msg === void 0 ? void 0 : msg.actions) === null || _a === void 0 ? void 0 : _a.length))
            return { success: false, error: 'hubName and actions required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!(hub === null || hub === void 0 ? void 0 : hub.client))
            return { success: false, error: `Hub not found: ${msg.hubName}` };
        try {
            for (const action of msg.actions) {
                if (action.delay > 0) {
                    await new Promise((resolve) => setTimeout(resolve, action.delay));
                }
                if (action.command && action.deviceId) {
                    const actionJson = JSON.stringify({
                        command: action.command,
                        type: 'IRCommand',
                        deviceId: action.deviceId,
                    });
                    hub.client.requestKeyPress(actionJson, 'press', action.duration || 100);
                }
            }
            return { success: true, data: { executed: true, steps: msg.actions.length } };
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
}
exports.MessageHandler = MessageHandler;
//# sourceMappingURL=message-handler.js.map