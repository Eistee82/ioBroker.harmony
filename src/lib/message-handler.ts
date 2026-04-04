import type { MessageResponse, HarmonyHubInfo } from './types.js';
import { ConfigWriter } from './config-writer.js';
import { IRDBService } from './irdb-service.js';

export class MessageHandler {
    private adapter: any;
    private writer: ConfigWriter;
    private irdb: IRDBService;

    constructor(adapter: any) {
        this.adapter = adapter;
        this.writer = new ConfigWriter(adapter);
        this.irdb = new IRDBService(adapter.adapterDir || __dirname);
    }

    async handle(obj: ioBroker.Message): Promise<void> {
        if (!obj?.command) return;

        let response: MessageResponse;
        try {
            switch (obj.command) {
                case 'getHubs':
                    response = this.getHubs();
                    break;
                case 'getConfig':
                    response = await this.getConfig(obj.message as { hubName: string });
                    break;
                case 'getStateDigest':
                    response = await this.getStateDigest(obj.message as { hubName: string });
                    break;
                case 'getDiscoveryInfo':
                    response = await this.getDiscoveryInfo(obj.message as { hubName: string });
                    break;
                case 'testCommand':
                    response = await this.testCommand(obj.message as { hubName: string; deviceId: string; command: string; type: string });
                    break;
                case 'writeConfig':
                    response = await this.writer.writeConfig(
                        (obj.message as { hubName: string; changes: Record<string, unknown> }).hubName,
                        (obj.message as { hubName: string; changes: Record<string, unknown> }).changes,
                    );
                    break;
                case 'addDevice':
                    response = await this.writer.addDevice(
                        (obj.message as { hubName: string; device: Record<string, unknown> }).hubName,
                        (obj.message as { hubName: string; device: Record<string, unknown> }).device,
                    );
                    break;
                case 'deleteDevice':
                    response = await this.writer.deleteDevice(
                        (obj.message as { hubName: string; deviceId: string }).hubName,
                        (obj.message as { hubName: string; deviceId: string }).deviceId,
                    );
                    break;
                case 'saveDevice':
                    response = await this.writer.saveDevice(
                        (obj.message as { hubName: string; device: Record<string, unknown> }).hubName,
                        (obj.message as { hubName: string; device: Record<string, unknown> }).device,
                    );
                    break;
                case 'generateActivity':
                    response = await this.writer.generateActivity(
                        (obj.message as { hubName: string; activityDef: Record<string, unknown> }).hubName,
                        (obj.message as { hubName: string; activityDef: Record<string, unknown> }).activityDef,
                    );
                    break;
                case 'updateActivityRoles':
                    response = await this.writer.updateActivityRoles(
                        (obj.message as { hubName: string; roles: Record<string, unknown> }).hubName,
                        (obj.message as { hubName: string; roles: Record<string, unknown> }).roles,
                    );
                    break;
                case 'deleteActivity':
                    response = await this.writer.deleteActivity(
                        (obj.message as { hubName: string; activityId: string }).hubName,
                        (obj.message as { hubName: string; activityId: string }).activityId,
                    );
                    break;
                case 'renameHub':
                    response = await this.renameHub(obj.message as { hubName: string; newName: string });
                    break;
                case 'setSleepTimer':
                    response = await this.setSleepTimer(obj.message as { hubName: string; minutes: number });
                    break;
                case 'syncHub':
                    response = await this.writer.syncHub(
                        (obj.message as { hubName: string }).hubName,
                    );
                    break;
                case 'startActivity':
                    response = await this.startActivity(obj.message as { hubName: string; activityId: string });
                    break;
                case 'getCurrentActivity':
                    response = await this.getCurrentActivity(obj.message as { hubName: string });
                    break;
                case 'changeChannel':
                    response = await this.changeChannel(obj.message as { hubName: string; channel: string });
                    break;
                case 'checkFirmware':
                    response = await this.checkFirmware(obj.message as { hubName: string });
                    break;
                case 'startFirmwareUpdate':
                    response = await this.startFirmwareUpdate(obj.message as { hubName: string });
                    break;
                case 'getSysInfo':
                    response = await this.getSysInfo(obj.message as { hubName: string });
                    break;
                case 'getProvisionInfo':
                    response = await this.getProvisionInfo(obj.message as { hubName: string });
                    break;
                case 'getCapabilities':
                    response = await this.getCapabilities(obj.message as { hubName: string });
                    break;
                case 'getAutomationState':
                    response = await this.getAutomationState(obj.message as { hubName: string });
                    break;
                case 'setAutomationState':
                    response = await this.setAutomationState(obj.message as { hubName: string; deviceId: string; state: Record<string, unknown> });
                    break;
                case 'runSequence':
                    response = await this.runSequence(obj.message as { hubName: string; actions: Array<{ deviceId: string; command: string; duration: number; delay: number }> });
                    break;
                case 'searchIRDB':
                    response = await this.searchIRDB(obj.message as { query: string });
                    break;
                case 'getIRDBDeviceTypes':
                    response = await this.getIRDBDeviceTypes(obj.message as { manufacturer: string });
                    break;
                case 'getIRDBCodeSets':
                    response = await this.getIRDBCodeSets(obj.message as { manufacturer: string; deviceType: string });
                    break;
                default:
                    response = { success: false, error: `Unknown command: ${obj.command}` };
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`Message handler error: ${msg}`);
            response = { success: false, error: msg };
        }

        if (obj.callback) {
            this.adapter.sendTo(obj.from, obj.command, response, obj.callback);
        }
    }

    private getHubs(): MessageResponse {
        const hubs: HarmonyHubInfo[] = [];
        for (const [name, hub] of Object.entries(this.adapter.hubs as Record<string, any>)) {
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

    private async getConfig(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub client not available: ${msg.hubName}` };

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'Config request timed out' });
            }, 30000);

            hub.client.requestConfig();
            hub.client.once('config', (config: unknown) => {
                clearTimeout(timeout);
                resolve({ success: true, data: config });
            });
        });
    }

    private async getStateDigest(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub not found: ${msg.hubName}` };

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'State request timed out' });
            }, 10000);

            hub.client.requestState();
            hub.client.once('state', (state: unknown) => {
                clearTimeout(timeout);
                resolve({ success: true, data: state });
            });
        });
    }

    private async getDiscoveryInfo(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];

        // Build combined info from all available sources
        const info: Record<string, unknown> = {
            friendlyName: hub?.friendlyName || msg.hubName,
            ip: hub?.ip || '',
        };

        // Get provision info via WebSocket (full vnd.logitech path works without auth token)
        if (hub?.client) {
            try {
                const provResult = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.setup/vnd.logitech.account?getProvisionInfo', {});
                const provData = (provResult as Record<string, unknown>)?.params ?? provResult;
                const prov = provData as Record<string, unknown>;
                if (prov.email) info.email = prov.email;
                if (prov.accountId) info.accountId = prov.accountId;
                if (prov.activeRemoteId) info.remoteId = String(prov.activeRemoteId);
                if (prov.language) info.locale = prov.language;
            } catch {
                // Fallback to HTTP POST
                try {
                    const raw = await this.writer.sendHttpPost(msg.hubName, 'setup.account?getProvisionInfo', {}) as Record<string, unknown>;
                    const provData = (raw?.data ?? raw) as Record<string, unknown>;
                    if (provData.email) info.email = provData.email;
                    if (provData.accountId) info.accountId = provData.accountId;
                    if (provData.activeRemoteId) info.remoteId = String(provData.activeRemoteId);
                    if (provData.language) info.locale = provData.language;
                } catch { /* ignore */ }
            }

            // Get system info via WebSocket
            try {
                const sysResult = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.harmony/vnd.logitech.harmony.system?systeminfo', {});
                const sysData = (sysResult as Record<string, unknown>)?.params ?? sysResult;
                const sys = sysData as Record<string, unknown>;
                if (sys.fw_ver) info.firmwareVersion = sys.fw_ver;
                if (sys.hw_ver) info.hardwareVersion = sys.hw_ver;
                if (sys.bt_ver) info.bluetoothVersion = sys.bt_ver;
                if (sys.wifi_ver) info.wifiVersion = sys.wifi_ver;
                Object.assign(info, sys);
            } catch { /* ignore */ }

            // Get device/pair info via WebSocket
            try {
                const pairResult = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.connect/vnd.logitech.pair', { verb: 'get' });
                const pairData = (pairResult as Record<string, unknown>)?.params ?? pairResult;
                const pair = pairData as Record<string, unknown>;
                if (pair.hubType) info.hubType = pair.hubType;
                if (pair.uuid) info.uuid = pair.uuid;
                if (pair.productId) info.productId = pair.productId;
                Object.assign(info, pair);
            } catch { /* ignore */ }
        }

        return { success: true, data: info };
    }

    private async searchIRDB(msg: { query: string }): Promise<MessageResponse> {
        if (!msg?.query) return { success: false, error: 'query required' };
        try {
            const results = await this.irdb.searchManufacturers(msg.query);
            return { success: true, data: results };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`IRDB search error: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }

    private async getIRDBDeviceTypes(msg: { manufacturer: string }): Promise<MessageResponse> {
        if (!msg?.manufacturer) return { success: false, error: 'manufacturer required' };
        try {
            const types = await this.irdb.getDeviceTypes(msg.manufacturer);
            return { success: true, data: types };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`IRDB device types error: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }

    private async getIRDBCodeSets(msg: { manufacturer: string; deviceType: string }): Promise<MessageResponse> {
        if (!msg?.manufacturer || !msg?.deviceType) return { success: false, error: 'manufacturer and deviceType required' };
        try {
            const codeSets = await this.irdb.getCodeSets(msg.manufacturer, msg.deviceType);
            return { success: true, data: codeSets };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`IRDB code sets error: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }

    private async renameHub(msg: { hubName: string; newName: string }): Promise<MessageResponse> {
        if (!msg?.hubName || !msg?.newName) return { success: false, error: 'hubName and newName required' };
        try {
            await this.writer.sendHttpPost(msg.hubName, 'connect.discoveryinfo?set', { friendlyName: msg.newName });
            return { success: true, data: { renamed: true } };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async setSleepTimer(msg: { hubName: string; minutes: number }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub not found: ${msg.hubName}` };

        try {
            if (msg.minutes <= 0) {
                // Cancel sleep timer
                await this.writer.sendHubQuery(msg.hubName, 'harmony.engine?setsleeptimer', { interval: -1 });
            } else {
                await this.writer.sendHubQuery(msg.hubName, 'harmony.engine?setsleeptimer', { interval: msg.minutes * 60 });
            }
            return { success: true, data: { set: true } };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async testCommand(msg: { hubName: string; deviceId: string; command: string; type: string }): Promise<MessageResponse> {
        if (!msg?.hubName || !msg?.command) return { success: false, error: 'hubName and command required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub not found: ${msg.hubName}` };

        const action = JSON.stringify({
            command: msg.command,
            type: msg.type || 'IRCommand',
            deviceId: msg.deviceId,
        });

        try {
            hub.client.requestKeyPress(action, 'press', 100);
            return { success: true, data: { sent: true } };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async startActivity(msg: { hubName: string; activityId: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub not found: ${msg.hubName}` };

        try {
            hub.client.requestActivityChange(msg.activityId || '-1');
            return { success: true, data: { started: true } };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async getCurrentActivity(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHubQuery(msg.hubName,
                'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity',
                { verb: 'get' });
            return { success: true, data: result };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async changeChannel(msg: { hubName: string; channel: string }): Promise<MessageResponse> {
        if (!msg?.hubName || !msg?.channel) return { success: false, error: 'hubName and channel required' };
        try {
            await this.writer.sendHubQuery(msg.hubName, 'harmony.engine?changeChannel', {
                timestamp: 0,
                channel: msg.channel,
            });
            return { success: true, data: { changed: true } };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async checkFirmware(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        try {
            // Use the full vnd.logitech path over WebSocket (from decompiled APK BaseHub.java)
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logtech.setup/vnd.logitech.firmware?check', {});
            const data = (result as Record<string, unknown>)?.params ?? result;
            return { success: true, data };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async startFirmwareUpdate(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub client not available: ${msg.hubName}` };

        try {
            // Use the full vnd.logitech path (from decompiled APK BaseHub.java)
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logtech.setup/vnd.logitech.firmware?update', {}, 60000);
            return { success: true, data: result };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async getSysInfo(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHubQuery(msg.hubName, 'vnd.logitech.harmony/vnd.logitech.harmony.system?systeminfo', {});
            const data = (result as Record<string, unknown>)?.params ?? result;
            return { success: true, data };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async getProvisionInfo(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHttpPost(msg.hubName, 'setup.account?getProvisionInfo', {});
            return { success: true, data: result };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async getCapabilities(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHttpPost(msg.hubName, 'proxy.resource?get', {
                uri: `harmony://Account/0/CapabilityList`,
            });
            return { success: true, data: result };
        } catch {
            return { success: true, data: {} };
        }
    }

    private async getAutomationState(msg: { hubName: string }): Promise<MessageResponse> {
        if (!msg?.hubName) return { success: false, error: 'hubName required' };
        try {
            const result = await this.writer.sendHubQuery(msg.hubName, 'harmony.automation?getstate', {});
            return { success: true, data: result };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async setAutomationState(msg: { hubName: string; deviceId: string; state: Record<string, unknown> }): Promise<MessageResponse> {
        if (!msg?.hubName || !msg?.deviceId) return { success: false, error: 'hubName and deviceId required' };
        try {
            await this.writer.sendHubQuery(msg.hubName, 'harmony.automation?setstate', {
                state: { [msg.deviceId]: msg.state },
            });
            return { success: true, data: { set: true } };
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }

    private async runSequence(msg: { hubName: string; actions: Array<{ deviceId: string; command: string; duration: number; delay: number }> }): Promise<MessageResponse> {
        if (!msg?.hubName || !msg?.actions?.length) return { success: false, error: 'hubName and actions required' };
        const hub = this.adapter.hubs[msg.hubName];
        if (!hub?.client) return { success: false, error: `Hub not found: ${msg.hubName}` };

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
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errMsg };
        }
    }
}
