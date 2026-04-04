const HarmonyWS = require('./node_modules/harmonyhubws');
const hub = new HarmonyWS('192.168.178.39');

let reqId = 0;

function send(cmd, params = {}) {
    return new Promise((resolve) => {
        const id = `auth-${reqId++}`;
        const timer = setTimeout(() => {
            console.log(`TIMEOUT: ${cmd}\n`);
            resolve(null);
        }, 8000);

        const handler = (raw) => {
            try {
                const data = JSON.parse(raw);
                if ((data.id || data.hbus?.id) === id) {
                    clearTimeout(timer);
                    hub.ws.removeListener('message', handler);
                    console.log(`[${cmd}] code=${data.code || '?'}`);
                    console.log(`  ${JSON.stringify(data.data || data).substring(0, 300)}\n`);
                    resolve(data);
                }
            } catch {}
        };
        hub.ws.on('message', handler);
        hub.ws.send(JSON.stringify({ hbus: { cmd, id, params } }));
    });
}

hub.on('online', async () => {
    console.log('Connected!\n');

    // Test home.initialize first
    console.log('=== Step 1: home.initialize ===');
    await send('home.initialize', {});

    // Test home.login
    console.log('=== Step 2: home.login ===');
    await send('home.login', {});

    // Test home.hub.login
    console.log('=== Step 3: home.hub.login ===');
    await send('home.hub.login', {});

    // Now retry some home.hub commands
    console.log('=== Step 4: Retry after auth ===');
    await send('home.hub.device.list', {});
    await send('home.hub.getCapabilities', {});
    await send('home.hub.getSysInfo', {});
    await send('home.hub.surface.getRootButtons', {});
    await send('home.hub.getPairings', {});

    // Try with the config writer approach - proxy.resource
    console.log('=== Step 5: proxy.resource commands ===');
    await send('proxy.resource?get', {uri: 'harmony://Account/0/CapabilityList'});
    await send('proxy.resource?get', {uri: 'harmony://Account/0/ActivityList'});
    await send('proxy.resource?get', {uri: 'harmony://Account/0/DeviceList'});

    // Try home.hub.device.add format (this works in ConfigWriter!)
    console.log('=== Step 6: home.hub commands that ConfigWriter uses ===');
    await send('home.hub.sync', {});

    hub.close();
    process.exit(0);
});

setTimeout(() => { hub.close(); process.exit(1); }, 120000);
