/**
 * IRDB Lookup Service
 *
 * Uses the probonopd/irdb database (accessed via jsdelivr CDN) to identify
 * devices from decoded IR protocol data (protocol + device + subdevice + function).
 *
 * Database format: CSV files at
 *   https://cdn.jsdelivr.net/gh/probonopd/irdb@master/codes/<Manufacturer>/<DeviceType>/<device>,<subdevice>.csv
 *
 * Each CSV row: functionname,protocol,device,subdevice,function
 */

import https from 'https';

export interface IRDBMatch {
    manufacturer: string;
    deviceType: string;
    functionName: string;
    protocol: string;
    device: number;
    subdevice: number;
    function: number;
}

export interface IRDBDeviceCandidate {
    manufacturer: string;
    deviceType: string;
    matchedFunctions: string[];
    totalFunctions: number;
    confidence: number;
}

/** Known manufacturers with their device types from the irdb index */
const IRDB_CDN = 'https://cdn.jsdelivr.net/gh/probonopd/irdb@master';

/**
 * Fetch a URL and return the body as string
 */
function fetchUrl(url: string, timeout = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => { clearTimeout(timer); resolve(data); });
        }).on('error', (err: Error) => { clearTimeout(timer); reject(err); });
    });
}

/**
 * Parse a CSV file from the irdb into an array of matches
 */
function parseCSV(csv: string, manufacturer: string, deviceType: string): IRDBMatch[] {
    const lines = csv.split('\n').filter((l) => l.trim() && !l.startsWith('functionname'));
    return lines.map((line) => {
        const parts = line.split(',');
        if (parts.length < 5) return null;
        return {
            manufacturer,
            deviceType,
            functionName: parts[0].trim(),
            protocol: parts[1].trim(),
            device: parseInt(parts[2].trim(), 10),
            subdevice: parseInt(parts[3].trim(), 10),
            function: parseInt(parts[4].trim(), 10),
        };
    }).filter(Boolean) as IRDBMatch[];
}

/**
 * Search the irdb for a specific protocol + device + function combination.
 * Downloads and parses relevant CSV files from CDN.
 *
 * Returns matching devices with their function names.
 */
export async function lookupIRCode(
    protocol: string,
    device: number,
    subdevice: number,
    func: number,
    log?: (msg: string) => void,
): Promise<IRDBMatch[]> {
    const matches: IRDBMatch[] = [];

    // Map our protocol names to irdb protocol names
    const protocolMap: Record<string, string[]> = {
        'NEC': ['NEC', 'NECx1', 'NECx2'],
        'NECx2': ['NECx2', 'NEC', 'NECx1'],
        'Samsung': ['Samsung32', 'Samsung', 'NECx2'],
        'Sony12': ['Sony12', 'Sony15', 'Sony20'],
        'Sony15': ['Sony15', 'Sony12', 'Sony20'],
        'Sony20': ['Sony20', 'Sony15', 'Sony12'],
        'RC5': ['RC5', 'RC5x'],
        'RC6': ['RC6'],
        'LG': ['LG', 'NEC', 'NECx2'],
    };

    const protocolNames = protocolMap[protocol] || [protocol];

    // Try to find the CSV file for this device+subdevice combination
    // The irdb organizes files as: codes/<Manufacturer>/<DeviceType>/<device>,<subdevice>.csv
    // We need to search across manufacturers - use the irdb index

    try {
        // First, try to get the directory listing for this device,subdevice
        const subdevStr = subdevice < 0 ? '-1' : String(subdevice);
        const searchFile = `${device},${subdevStr}.csv`;

        // The irdb doesn't have a global index, so we search known major manufacturers
        const manufacturers = [
            'Samsung', 'LG', 'Sony', 'Panasonic', 'Philips', 'Sharp', 'Toshiba',
            'Denon', 'Yamaha', 'Onkyo', 'Pioneer', 'Marantz', 'Harman_Kardon',
            'Bose', 'JVC', 'Sanyo', 'Hitachi', 'Mitsubishi', 'Epson', 'BenQ',
            'Vizio', 'TCL', 'Hisense', 'Apple', 'Microsoft', 'Amazon', 'Google',
            'Roku', 'Nvidia', 'Acer', 'Asus', 'Dell', 'HP', 'Logitech',
        ];

        const deviceTypes = ['TV', 'Blu-ray', 'DVD', 'Receiver', 'Amplifier', 'Projector',
            'Cable', 'Satellite', 'Streaming', 'Game', 'CD', 'Soundbar'];

        if (log) log(`Searching irdb for protocol=${protocol} device=${device} subdevice=${subdevice} function=${func}`);

        // Search in parallel across manufacturers and device types
        const fetchPromises: Promise<void>[] = [];

        for (const mfr of manufacturers) {
            for (const dt of deviceTypes) {
                const url = `${IRDB_CDN}/codes/${mfr}/${dt}/${searchFile}`;
                fetchPromises.push(
                    fetchUrl(url, 5000)
                        .then((csv) => {
                            if (csv && !csv.includes('404') && !csv.includes('<!DOCTYPE')) {
                                const entries = parseCSV(csv, mfr, dt);
                                for (const entry of entries) {
                                    if (protocolNames.includes(entry.protocol) && entry.function === func) {
                                        matches.push(entry);
                                    }
                                }
                            }
                        })
                        .catch(() => { /* ignore 404s */ }),
                );
            }
        }

        // Limit concurrent requests
        const batchSize = 20;
        for (let i = 0; i < fetchPromises.length; i += batchSize) {
            await Promise.all(fetchPromises.slice(i, i + batchSize));
        }
    } catch (e) {
        if (log) log(`IRDB lookup error: ${e}`);
    }

    return matches;
}

/**
 * Given multiple decoded IR captures, narrow down device candidates.
 * Each capture adds a filter - the more captures, the fewer candidates.
 */
export function narrowCandidates(
    allMatches: IRDBMatch[][],
): IRDBDeviceCandidate[] {
    if (allMatches.length === 0) return [];

    // Build a map of manufacturer+deviceType → matched function names
    const candidateMap = new Map<string, { manufacturer: string; deviceType: string; matchedFunctions: Set<string> }>();

    // First capture establishes the initial candidate set
    for (const match of allMatches[0]) {
        const key = `${match.manufacturer}|${match.deviceType}`;
        if (!candidateMap.has(key)) {
            candidateMap.set(key, {
                manufacturer: match.manufacturer,
                deviceType: match.deviceType,
                matchedFunctions: new Set([match.functionName]),
            });
        } else {
            candidateMap.get(key)!.matchedFunctions.add(match.functionName);
        }
    }

    // Each subsequent capture narrows the candidates
    for (let i = 1; i < allMatches.length; i++) {
        const currentKeys = new Set(allMatches[i].map((m) => `${m.manufacturer}|${m.deviceType}`));
        // Remove candidates that don't appear in this capture
        for (const key of candidateMap.keys()) {
            if (!currentKeys.has(key)) {
                candidateMap.delete(key);
            } else {
                // Add matched function names
                for (const match of allMatches[i]) {
                    if (`${match.manufacturer}|${match.deviceType}` === key) {
                        candidateMap.get(key)!.matchedFunctions.add(match.functionName);
                    }
                }
            }
        }
    }

    // Convert to sorted array
    return Array.from(candidateMap.values())
        .map((c) => ({
            manufacturer: c.manufacturer,
            deviceType: c.deviceType,
            matchedFunctions: Array.from(c.matchedFunctions),
            totalFunctions: c.matchedFunctions.size,
            confidence: Math.min(100, c.matchedFunctions.size * 25),
        }))
        .sort((a, b) => b.confidence - a.confidence);
}
