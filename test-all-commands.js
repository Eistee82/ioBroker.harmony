const HarmonyWS = require('./node_modules/harmonyhubws');
const hub = new HarmonyWS('192.168.178.39');

const commands = [
    // Device management
    ['home.hub.device.search', {query:'Samsung', type:'TV'}],
    ['home.hub.device.getManufacturers', {}],
    ['home.hub.device.list', {}],
    ['home.hub.device.getGlobalDevice', {}],
    ['home.hub.device.getFavorites', {}],
    ['home.hub.device.startScan', {}],
    ['home.hub.device.bluetooth.status', {}],
    ['home.hub.device.getCriticalFaqs', {}],

    // Activity management
    ['home.hub.activity.list', {}],
    ['home.hub.activity.getActivityInputs', {}],
    ['home.hub.activity.getMissingRoles', {}],
    ['home.hub.activity.getSimilarActivities', {}],

    // Smart Home / Automation
    ['home.hub.gateway.discover', {}],
    ['home.hub.gateway.discoverHue', {}],
    ['home.hub.automation.get', {}],
    ['home.hub.automation.gateway.status', {}],

    // Remote / Surface
    ['home.hub.surface.getRootButtons', {}],
    ['home.hub.surface.status', {}],
    ['home.hub.getPairings', {}],
    ['home.hub.getCapabilities', {}],

    // Hub management
    ['home.hub.getSysInfo', {}],
    ['home.hub.getProvisionInfo', {}],
    ['home.hub.ping', {}],

    // Firmware
    ['home.hub.firmware.startDownload', {}],

    // Other info commands (vnd.logitech paths)
    ['setup.content?getbtsettings', {}],
    ['setup.content?getAllMetadata', {}],
    ['wifi.networks', {}],
    ['harmony.engine?gettimerinterval', {}],
    ['connect.discoveryinfo?get', {format:'json'}],

    // Power management
    ['home.hub.wakeUpDevices', {}],
    ['home.hub.powerOffDevices', {}],
];

let idx = 0;
let timer;
const results = [];

hub.on('online', () => {
    console.log(`Connected! Testing ${commands.length} commands against Kino Hub...\n`);
    hub.ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const respId = data.id || data.hbus?.id;
            if (respId && respId.startsWith('t-')) {
                clearTimeout(timer);
                const i = parseInt(respId.split('-')[1]);
                const code = data.code || data.hbus?.code || '?';
                const payload = data.data || data.hbus || data;
                const preview = JSON.stringify(payload).substring(0, 200);
                const ok = code == 200 || code == '200';
                results.push({cmd: commands[i][0], code, ok});
                console.log(`${ok ? '✓' : '✗'} [${commands[i][0]}] code=${code}`);
                console.log(`  ${preview}`);
                console.log();
                idx++;
                setTimeout(next, 300);
            }
        } catch {}
    });
    next();
});

function next() {
    if (idx >= commands.length) {
        console.log('\n===== SUMMARY =====');
        console.log(`Tested: ${results.length}/${commands.length}`);
        console.log(`Working: ${results.filter(r=>r.ok).length}`);
        console.log(`Failed: ${results.filter(r=>!r.ok).length}`);
        console.log(`Timeout: ${commands.length - results.length}`);
        console.log('\nWorking commands:');
        results.filter(r=>r.ok).forEach(r => console.log(`  ✓ ${r.cmd}`));
        console.log('\nFailed commands:');
        results.filter(r=>!r.ok).forEach(r => console.log(`  ✗ ${r.cmd} (code ${r.code})`));
        hub.close();
        process.exit(0);
        return;
    }
    const [cmd, params] = commands[idx];
    console.log(`→ ${cmd}`);
    timer = setTimeout(() => {
        results.push({cmd, code:'TIMEOUT', ok:false});
        console.log(`✗ TIMEOUT: ${cmd}\n`);
        idx++;
        next();
    }, 8000);
    hub.ws.send(JSON.stringify({ hbus: { cmd, id: `t-${idx}`, params } }));
}

setTimeout(() => {
    console.log('\nGlobal timeout reached');
    hub.close();
    process.exit(1);
}, 300000);
