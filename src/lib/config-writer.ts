import type { MessageResponse } from './types.js';
import http from 'http';

/**
 * Writes configuration changes to Harmony Hubs via WebSocket.
 *
 * CRITICAL RULES (from reverse engineering):
 * - Every write MUST include `forceUpdate: true` or changes are lost on hub restart
 * - Every write MUST be followed by `home.hub.sync`
 * - Activity generation can take 10+ seconds, use 60000ms timeout
 * - Don't batch multiple writes - sync between each one
 */
export class ConfigWriter {
    private adapter: any;
    private msgCounter = 0;

    constructor(adapter: any) {
        this.adapter = adapter;
    }

    /**
     * Send a query to the hub and return the result. Used by message-handler for read operations.
     */
    async sendHubQuery(hubName: string, cmd: string, params: Record<string, unknown>, timeout = 10000): Promise<unknown> {
        return this.sendCommand(hubName, cmd, params, timeout);
    }

    /**
     * Send a command via HTTP POST to the hub (for commands that don't work over WebSocket).
     * The Harmony app uses this for connect.discoveryinfo, setup.firmware, setup.account etc.
     */
    sendHttpPost(hubName: string, cmd: string, params: Record<string, unknown>, timeout = 10000): Promise<unknown> {
        const hub = this.adapter.hubs[hubName];
        if (!hub) {
            return Promise.reject(new Error(`Hub not found: ${hubName}`));
        }
        const ip = hub.ip || hub.client?.ip;
        if (!ip) {
            return Promise.reject(new Error(`Hub IP not available: ${hubName}`));
        }

        const body = JSON.stringify({ id: ++this.msgCounter, cmd, params, timeout });

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`HTTP command '${cmd}' timed out after ${timeout}ms`));
            }, timeout);

            const req = http.request({
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
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    clearTimeout(timer);
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch {
                        resolve(data);
                    }
                });
            });

            req.on('error', (err: Error) => {
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
    private sendCommand(hubName: string, cmd: string, params: Record<string, unknown>, timeout = 30000): Promise<unknown> {
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

            const onMessage = (raw: string): void => {
                try {
                    const data = JSON.parse(raw);
                    if (data?.hbus?.id === id) {
                        clearTimeout(timer);
                        ws.removeListener('message', onMessage);
                        if (data.hbus.error) {
                            reject(new Error(`Hub error for '${cmd}': ${JSON.stringify(data.hbus.error)}`));
                        } else {
                            resolve(data.hbus);
                        }
                    }
                } catch {
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
     * Sync the hub to persist all pending changes.
     */
    async syncHub(hubName: string): Promise<MessageResponse> {
        try {
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`Hub '${hubName}' sync completed`);
            return { success: true, data: { synced: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`syncHub failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Write configuration changes via proxy.resource?put with forceUpdate.
     */
    async writeConfig(hubName: string, changes: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...changes, forceUpdate: true };
            await this.sendCommand(hubName, 'proxy.resource?put', params);
            this.adapter.log.debug(`writeConfig: proxy.resource?put succeeded for '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`writeConfig: sync completed for '${hubName}'`);
            return { success: true, data: { written: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`writeConfig failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Add a new device to the hub, then sync.
     */
    async addDevice(hubName: string, device: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...device, forceUpdate: true };
            const result = await this.sendCommand(hubName, 'home.hub.device.add', params);
            this.adapter.log.debug(`addDevice: device added to '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`addDevice: sync completed for '${hubName}'`);
            return { success: true, data: result };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`addDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Delete a device from the hub, then sync.
     */
    async deleteDevice(hubName: string, deviceId: string): Promise<MessageResponse> {
        try {
            const params = { deviceId, forceUpdate: true };
            await this.sendCommand(hubName, 'home.hub.device.delete', params);
            this.adapter.log.debug(`deleteDevice: device '${deviceId}' deleted from '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`deleteDevice: sync completed for '${hubName}'`);
            return { success: true, data: { deleted: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`deleteDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Save (update) a device on the hub, then sync.
     */
    async saveDevice(hubName: string, device: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...device, forceUpdate: true };
            await this.sendCommand(hubName, 'home.hub.device.save', params);
            this.adapter.log.debug(`saveDevice: device saved on '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`saveDevice: sync completed for '${hubName}'`);
            return { success: true, data: { saved: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`saveDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Generate an activity on the hub. Uses 60s timeout since generation can take 10+ seconds.
     */
    async generateActivity(hubName: string, activityDef: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...activityDef, forceUpdate: true };
            const result = await this.sendCommand(hubName, 'home.hub.activity.generate', params, 60000);
            this.adapter.log.debug(`generateActivity: activity generated on '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`generateActivity: sync completed for '${hubName}'`);
            return { success: true, data: result };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`generateActivity failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Update activity roles on the hub, then sync.
     */
    async updateActivityRoles(hubName: string, roles: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...roles, forceUpdate: true };
            await this.sendCommand(hubName, 'home.hub.activity.updateRoles', params);
            this.adapter.log.debug(`updateActivityRoles: roles updated on '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`updateActivityRoles: sync completed for '${hubName}'`);
            return { success: true, data: { updated: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`updateActivityRoles failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Delete an activity from the hub, then sync.
     */
    async deleteActivity(hubName: string, activityId: string): Promise<MessageResponse> {
        try {
            const params = { activityId, forceUpdate: true };
            await this.sendCommand(hubName, 'home.hub.activity.delete', params);
            this.adapter.log.debug(`deleteActivity: activity '${activityId}' deleted from '${hubName}'`);
            await this.sendCommand(hubName, 'home.hub.sync', {});
            this.adapter.log.info(`deleteActivity: sync completed for '${hubName}'`);
            return { success: true, data: { deleted: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`deleteActivity failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
}
