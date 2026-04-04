const HarmonyWS = require('./node_modules/harmonyhubws');
const hub = new HarmonyWS('192.168.178.39');

const commands = [
    ['vnd.logitech.harmony/vnd.logitech.harmony.system?systeminfo', {verb:'get'}],
    ['vnd.logitech.connect/vnd.logitech.pair', {verb:'get'}],
    ['vnd.logitech.connect/vnd.logitech.deviceinfo?get', {verb:'get'}],
    ['vnd.logitech.setup/vnd.logitech.account?getProvisionInfo', {verb:'get'}],
    ['vnd.logtech.setup/vnd.logitech.firmware?check', {verb:'get'}],
    ['vnd.logitech.setup/vnd.logitech.firmware?check', {verb:'get'}],
    ['harmony.engine?gettimerinterval', {}],
    ['setup.content?getbtsettings', {}],
    ['harmony.automation?getState', {}],
    ['harmony.automation?getstate', {}],
    ['connect.discoveryinfo?get', {format:'json'}],
    ['wifi.networks', {}],
    ['vnd.logitech.connect/vnd.logitech.statedigest?get', {verb:'get',format:'json'}],
];

let idx = 0;
let timer;

hub.on('online', () => {
    console.log('Connected to hub. Testing ' + commands.length + ' commands...\n');
    hub.ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            if (data?.id?.startsWith?.('t-') || data?.hbus?.id?.startsWith?.('t-')) {
                clearTimeout(timer);
                const respId = data.id || data.hbus?.id;
                const i = parseInt(respId.split('-')[1]);
                const code = data.code || data.hbus?.code || '?';
                console.log(`✓ [${commands[i][0]}]`);
                console.log(`  code=${code}`);
                console.log(`  data=${JSON.stringify(data.data || data.hbus || data).substring(0, 300)}`);
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
        console.log('Done!');
        hub.close();
        process.exit(0);
        return;
    }
    const [cmd, params] = commands[idx];
    console.log(`→ Sending: ${cmd}`);
    timer = setTimeout(() => {
        console.log(`✗ TIMEOUT: ${cmd}\n`);
        idx++;
        next();
    }, 5000);
    hub.ws.send(JSON.stringify({ hbus: { cmd, id: `t-${idx}`, params } }));
}

setTimeout(() => { hub.close(); process.exit(1); }, 120000);
