const HarmonyWS = require('./node_modules/harmonyhubws');
const hub = new HarmonyWS('192.168.178.39');
let reqId = 0;

function send(cmd, params = {}) {
    return new Promise((resolve) => {
        const id = `pr-${reqId++}`;
        const timer = setTimeout(() => { console.log(`TIMEOUT: ${cmd}\n`); resolve(null); }, 10000);
        const handler = (raw) => {
            try {
                const data = JSON.parse(raw);
                if ((data.id || data.hbus?.id) === id) {
                    clearTimeout(timer);
                    hub.ws.removeListener('message', handler);
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

    // Get all available proxy.resource URIs
    const uris = [
        'harmony://Account/0/CapabilityList',
        'harmony://Account/0/ActivityList',
        'harmony://Account/0/DeviceList',
        'harmony://Account/0/ActivityDeviceList',
        'harmony://Account/0/RemoteList',
        'harmony://Account/0/FavoriteList',
        'harmony://Account/0/ContentList',
        'harmony://Account/0/AutomationConfig',
        'harmony://Account/0/AutomationDeviceList',
        'harmony://Account/0/UserProfile',
        'harmony://Account/0/SequenceList',
        'harmony://Account/0/ZoneList',
        'harmony://Account/0/InstallerInfo',
        'dynamite://HomeAutomationService/Config/',
    ];

    for (const uri of uris) {
        console.log(`→ proxy.resource?get ${uri}`);
        const result = await send('proxy.resource?get', { uri });
        if (result) {
            const code = result.code || '?';
            const preview = JSON.stringify(result.data || result).substring(0, 200);
            console.log(`  code=${code}: ${preview}\n`);
        }
    }

    // Test proxy.resource?put (read-only test, no actual changes)
    console.log('=== Write commands ===');

    // Test harmony.engine commands
    const engineCmds = [
        ['harmony.engine?setsleeptimer', {interval: -1}],
        ['harmony.engine?changeChannel', {timestamp: 0, channel: '1'}],
        ['connect.discoveryinfo?set', {friendlyName: 'Kino Harmony Hub'}],  // set back to same name
    ];

    for (const [cmd, params] of engineCmds) {
        console.log(`→ ${cmd}`);
        const result = await send(cmd, params);
        if (result) {
            console.log(`  code=${result.code}: ${JSON.stringify(result.data || result.msg || result).substring(0, 200)}\n`);
        }
    }

    hub.close();
    process.exit(0);
});

setTimeout(() => { hub.close(); process.exit(1); }, 120000);
