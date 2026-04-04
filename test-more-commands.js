const HarmonyWS = require('./node_modules/harmonyhubws');
const hub = new HarmonyWS('192.168.178.39');
let reqId = 0;

function send(cmd, params = {}) {
    return new Promise((resolve) => {
        const id = `m-${reqId++}`;
        const timer = setTimeout(() => { console.log(`  TIMEOUT\n`); resolve(null); }, 8000);
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

    // Test harmony.engine commands with correct params
    const tests = [
        // Channel change needs: channel, timestamp, maybe deviceId
        ['harmony.engine?changeChannel', {channel: '1', timestamp: 0}],
        // BT pairing status check
        ['harmony.engine?bluetoothPairing', {}],
        // Start activity (legacy format)
        ['harmony.engine?startactivity', {activityId: '-1', timestamp: 0}],
        // Activity engine run
        ['harmony.activityengine?runactivity', {activityId: '-1'}],
        // Sleep timer get
        ['harmony.engine?gettimerinterval', {}],
        // Set sleep timer
        ['harmony.engine?setsleeptimer', {interval: -1}],
        // Set HID device (keyboard)
        ['harmony.engine?sethiddevice', {}],
        // Finish IP pairing
        ['harmony.engine?finishippair', {}],
        // IP device sync channels
        ['setup.content?syncChannels', {}],
        // Get BT settings
        ['setup.content?getbtsettings', {}],
        // Get all metadata
        ['setup.content?getAllMetadata', {deviceId: '0'}],
        // Automation state
        ['harmony.automation?getstate', {}],
        ['harmony.automation?getState', {}],
        // Automation set state
        ['harmony.automation?setstate', {state: {}}],
    ];

    for (const [cmd, params] of tests) {
        console.log(`→ ${cmd} ${JSON.stringify(params)}`);
        const result = await send(cmd, params);
        if (result) {
            const code = result.code || '?';
            const ok = code == 200 || code == '200';
            console.log(`  ${ok ? '✓' : '✗'} code=${code}: ${JSON.stringify(result.data || result.msg || result).substring(0, 200)}\n`);
        }
    }

    hub.close();
    process.exit(0);
});

setTimeout(() => { hub.close(); process.exit(1); }, 120000);
