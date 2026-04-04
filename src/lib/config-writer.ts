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
                    // Hub responds in two formats:
                    // 1) Direct: { cmd, code, id, msg, data } (most commands)
                    // 2) Wrapped: { hbus: { cmd, id, ... } } (some internal commands)
                    const msgId = data?.id || data?.hbus?.id;
                    if (msgId === id) {
                        clearTimeout(timer);
                        ws.removeListener('message', onMessage);
                        const error = data?.hbus?.error;
                        if (error) {
                            reject(new Error(`Hub error for '${cmd}': ${JSON.stringify(error)}`));
                        } else {
                            // Return the data payload - include even for non-200 codes
                            // (e.g. firmware check returns code 1001 but still has useful data)
                            resolve(data?.data ?? data?.hbus ?? data);
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
     * Sync hub config. setup.sync triggers cloud sync (no response expected).
     * proxy.resource?put already persists changes, so sync is optional.
     */
    async syncHub(hubName: string): Promise<MessageResponse> {
        try {
            // setup.sync triggers cloud sync - fire and forget (no response)
            const hub = this.adapter.hubs[hubName];
            if (hub?.client?.ws) {
                hub.client.ws.send(JSON.stringify({
                    hbus: { cmd: 'setup.sync', id: `sync-${++this.msgCounter}`, params: {} },
                }));
            }
            this.adapter.log.info(`Hub '${hubName}' sync triggered`);
            return { success: true, data: { synced: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`syncHub failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Write configuration changes via proxy.resource?put.
     * This is the native hub command for persisting config changes (tested & confirmed).
     */
    async writeConfig(hubName: string, changes: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...changes, forceUpdate: true };
            await this.sendCommand(hubName, 'proxy.resource?put', params);
            this.adapter.log.info(`writeConfig: proxy.resource?put succeeded for '${hubName}'`);
            return { success: true, data: { written: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`writeConfig failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Add a device by reading the current DeviceList, appending the new device,
     * and writing it back via proxy.resource?put.
     */
    async addDevice(hubName: string, device: Record<string, unknown>): Promise<MessageResponse> {
        try {
            // Read current device list
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/DeviceList',
            }) as Record<string, unknown>;
            const resource = (currentList as any)?.resource;
            const devices = resource?.DevicesWithFeatures || [];
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
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`addDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Delete a device by reading the current DeviceList, removing the device,
     * and writing it back via proxy.resource?put.
     */
    async deleteDevice(hubName: string, deviceId: string): Promise<MessageResponse> {
        try {
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/DeviceList',
            }) as Record<string, unknown>;
            const resource = (currentList as any)?.resource;
            const devices = resource?.DevicesWithFeatures || [];
            const filtered = devices.filter((d: any) =>
                String(d?.Device?.Id ?? d?.Device?.id) !== String(deviceId),
            );
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/DeviceList',
                resource: { ...resource, DevicesWithFeatures: filtered },
                forceUpdate: true,
            });
            this.adapter.log.info(`deleteDevice: device '${deviceId}' deleted from '${hubName}'`);
            return { success: true, data: { deleted: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`deleteDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Save (update) a device via proxy.resource?put.
     */
    async saveDevice(hubName: string, device: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const params = { ...device, forceUpdate: true };
            await this.sendCommand(hubName, 'proxy.resource?put', params);
            this.adapter.log.info(`saveDevice: device saved on '${hubName}'`);
            return { success: true, data: { saved: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`saveDevice failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Create an activity by reading the current ActivityList, appending the new
     * activity, and writing it back via proxy.resource?put.
     */
    async generateActivity(hubName: string, activityDef: Record<string, unknown>): Promise<MessageResponse> {
        try {
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/ActivityList',
            }) as Record<string, unknown>;
            const resource = (currentList as any)?.resource;
            const activities = resource?.Activities || [];
            activities.push(activityDef);
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/ActivityList',
                resource: { ...resource, Activities: activities },
                forceUpdate: true,
            }, 60000);
            this.adapter.log.info(`generateActivity: activity created on '${hubName}'`);
            return { success: true, data: { created: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`generateActivity failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Update activity roles via proxy.resource?put with the full config.
     */
    async updateActivityRoles(hubName: string, roles: Record<string, unknown>): Promise<MessageResponse> {
        try {
            await this.sendCommand(hubName, 'proxy.resource?put', {
                ...roles,
                forceUpdate: true,
            });
            this.adapter.log.info(`updateActivityRoles: roles updated on '${hubName}'`);
            return { success: true, data: { updated: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`updateActivityRoles failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * Delete an activity by reading the current ActivityList, removing the activity,
     * and writing it back via proxy.resource?put.
     */
    async deleteActivity(hubName: string, activityId: string): Promise<MessageResponse> {
        try {
            const currentList = await this.sendCommand(hubName, 'proxy.resource?get', {
                uri: 'harmony://Account/0/ActivityList',
            }) as Record<string, unknown>;
            const resource = (currentList as any)?.resource;
            const activities = resource?.Activities || [];
            const filtered = activities.filter((a: any) =>
                String(a?.['Id-'] ?? a?.Id ?? a?.id) !== String(activityId),
            );
            await this.sendCommand(hubName, 'proxy.resource?put', {
                uri: 'harmony://Account/0/ActivityList',
                resource: { ...resource, Activities: filtered },
                forceUpdate: true,
            });
            this.adapter.log.info(`deleteActivity: activity '${activityId}' deleted from '${hubName}'`);
            return { success: true, data: { deleted: true } };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.adapter.log.error(`deleteActivity failed: ${msg}`);
            return { success: false, error: msg };
        }
    }
}
