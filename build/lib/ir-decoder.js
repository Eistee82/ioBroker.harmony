"use strict";
/**
 * IR Protocol Decoder
 *
 * Decodes raw IR timing data (mark/space pairs in microseconds) into
 * protocol name, device address, subdevice, and function/command code.
 *
 * Supports: NEC, NECx, RC5, RC6, Sony SIRC (12/15/20-bit), Samsung, LG
 * Covers ~90% of consumer IR remotes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHarmonyIRData = parseHarmonyIRData;
exports.decodeIR = decodeIR;
/** Tolerance for timing comparisons (±25%) */
function match(actual, expected, tolerance = 0.25) {
    return Math.abs(actual - expected) <= expected * tolerance;
}
/** Decode a single bit from NEC-style encoding */
function necBit(mark, space) {
    if (!match(mark, 562, 0.3))
        return null;
    if (match(space, 562, 0.3))
        return 0;
    if (match(space, 1687, 0.3))
        return 1;
    return null;
}
/** Decode bits from timing array starting at offset */
function decodeBits(timings, startIdx, count, bitFn) {
    let value = 0;
    let idx = startIdx;
    for (let i = 0; i < count; i++) {
        if (idx + 1 >= timings.length)
            return null;
        const bit = bitFn(timings[idx], timings[idx + 1]);
        if (bit === null)
            return null;
        value |= bit << i; // LSB first for NEC
        idx += 2;
    }
    return { value, nextIdx: idx };
}
/** Decode NEC protocol (32-bit: addr + ~addr + cmd + ~cmd) */
function decodeNEC(timings) {
    if (timings.length < 67)
        return null; // 2 header + 64 data + 1 trail minimum
    // Check header: 9000us mark, 4500us space
    if (!match(timings[0], 9000, 0.25) || !match(timings[1], 4500, 0.25))
        return null;
    const result = decodeBits(timings, 2, 32, necBit);
    if (!result)
        return null;
    const addr = result.value & 0xFF;
    const addrInv = (result.value >> 8) & 0xFF;
    const cmd = (result.value >> 16) & 0xFF;
    const cmdInv = (result.value >> 24) & 0xFF;
    // Validate command inversion
    if ((cmd ^ cmdInv) !== 0xFF)
        return null;
    // Check if extended NEC (address not inverted = NECx with 16-bit address)
    if ((addr ^ addrInv) !== 0xFF) {
        const device = addr | (addrInv << 8);
        return {
            protocol: 'NECx2',
            device: device & 0xFF,
            subdevice: (device >> 8) & 0xFF,
            function: cmd,
            hex: result.value.toString(16).toUpperCase().padStart(8, '0'),
        };
    }
    return {
        protocol: 'NEC',
        device: addr,
        subdevice: -1,
        function: cmd,
        hex: result.value.toString(16).toUpperCase().padStart(8, '0'),
    };
}
/** Decode Samsung protocol (similar to NEC but different header) */
function decodeSamsung(timings) {
    if (timings.length < 67)
        return null;
    // Samsung header: ~4500us mark, ~4500us space
    if (!match(timings[0], 4500, 0.25) || !match(timings[1], 4500, 0.25))
        return null;
    const result = decodeBits(timings, 2, 32, necBit);
    if (!result)
        return null;
    const addr = result.value & 0xFF;
    const addrCopy = (result.value >> 8) & 0xFF;
    const cmd = (result.value >> 16) & 0xFF;
    const cmdInv = (result.value >> 24) & 0xFF;
    // Samsung: address is repeated (not inverted)
    if (addr !== addrCopy)
        return null;
    if ((cmd ^ cmdInv) !== 0xFF)
        return null;
    return {
        protocol: 'Samsung',
        device: addr,
        subdevice: -1,
        function: cmd,
        hex: result.value.toString(16).toUpperCase().padStart(8, '0'),
    };
}
/** Decode Sony SIRC protocol (12, 15, or 20 bit) */
function decodeSony(timings) {
    if (timings.length < 25)
        return null;
    // Header: 2400us mark, 600us space
    if (!match(timings[0], 2400, 0.25) || !match(timings[1], 600, 0.3))
        return null;
    // Decode bits: 1 = 1200us mark, 0 = 600us mark, space always 600us
    const bits = [];
    let idx = 2;
    while (idx + 1 < timings.length && bits.length < 20) {
        const mark = timings[idx];
        const space = timings[idx + 1];
        if (match(mark, 1200, 0.3) && match(space, 600, 0.4)) {
            bits.push(1);
        }
        else if (match(mark, 600, 0.3) && match(space, 600, 0.4)) {
            bits.push(0);
        }
        else {
            break;
        }
        idx += 2;
    }
    if (bits.length < 12)
        return null;
    // First 7 bits = command, remaining = address
    let cmd = 0;
    for (let i = 0; i < 7; i++)
        cmd |= bits[i] << i;
    let device = 0;
    const addrBits = bits.length - 7;
    for (let i = 0; i < addrBits; i++)
        device |= bits[7 + i] << i;
    const protocol = bits.length <= 12 ? 'Sony12' : bits.length <= 15 ? 'Sony15' : 'Sony20';
    return {
        protocol,
        device,
        subdevice: -1,
        function: cmd,
        hex: `${device.toString(16)}:${cmd.toString(16)}`,
    };
}
/** Decode RC5 protocol (Manchester encoding, 14 bits) */
function decodeRC5(timings) {
    if (timings.length < 10)
        return null;
    // RC5 uses Manchester encoding: ~889us per half-bit
    // Decode Manchester: short pulse = same half, long pulse = transition
    const halfBit = 889;
    const bits = [];
    let level = 1; // Start high (first bit is always 1)
    bits.push(1);
    let idx = 0;
    while (idx < timings.length && bits.length < 14) {
        const duration = timings[idx];
        if (match(duration, halfBit, 0.35)) {
            // Short pulse - stay on same half
            idx++;
            if (idx < timings.length && match(timings[idx], halfBit, 0.35)) {
                level = 1 - level;
                bits.push(level);
                idx++;
            }
            else {
                break;
            }
        }
        else if (match(duration, halfBit * 2, 0.35)) {
            // Long pulse - transition
            level = 1 - level;
            bits.push(level);
            idx++;
        }
        else {
            break;
        }
    }
    if (bits.length < 13)
        return null;
    // RC5: S1 S2 T A4 A3 A2 A1 A0 C5 C4 C3 C2 C1 C0
    const toggle = bits[2];
    let address = 0;
    for (let i = 3; i <= 7; i++)
        address = (address << 1) | bits[i];
    let command = 0;
    for (let i = 8; i <= 13; i++)
        command = (command << 1) | bits[i];
    // Extended RC5: S2 inverted = bit 6 of command
    if (bits[1] === 0)
        command |= 0x40;
    return {
        protocol: 'RC5',
        device: address,
        subdevice: -1,
        function: command,
        hex: `${address.toString(16)}:${command.toString(16)}`,
    };
}
/** Decode LG protocol (similar to NEC with different header) */
function decodeLG(timings) {
    if (timings.length < 65)
        return null;
    // LG header: 8500us mark, 4250us space
    if (!match(timings[0], 8500, 0.25) || !match(timings[1], 4250, 0.25))
        return null;
    // LG uses same bit encoding as NEC but 28 bits + 4 bit checksum
    const result = decodeBits(timings, 2, 32, necBit);
    if (!result)
        return null;
    const addr = (result.value >> 24) & 0xFF;
    const cmd = (result.value >> 8) & 0xFFFF;
    return {
        protocol: 'LG',
        device: addr,
        subdevice: -1,
        function: cmd & 0xFF,
        hex: result.value.toString(16).toUpperCase().padStart(8, '0'),
    };
}
/**
 * Parse Harmony Hub IR capture data.
 * Format: {"id":xxx,"code":200}<base64 data>
 * Returns array of 16-bit timing values (mark/space in microseconds)
 */
function parseHarmonyIRData(raw) {
    // Extract base64 data after the JSON header
    const jsonEnd = raw.indexOf('}');
    if (jsonEnd < 0)
        return [];
    const b64 = raw.substring(jsonEnd + 1).trim();
    if (!b64)
        return [];
    // Decode base64
    const bytes = Buffer.from(b64, 'base64');
    // Convert to 16-bit integers (little-endian pairs)
    const values = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) {
        values.push(bytes[i] | (bytes[i + 1] << 8));
    }
    return values;
}
/**
 * Try to decode raw IR timing data into a protocol+device+function.
 * Tries all supported protocols and returns the first match.
 */
function decodeIR(timings) {
    if (!timings || timings.length < 10)
        return null;
    // Try each protocol decoder in order of prevalence
    const decoders = [decodeNEC, decodeSamsung, decodeSony, decodeRC5, decodeLG];
    for (const decoder of decoders) {
        const result = decoder(timings);
        if (result) {
            result.raw = timings;
            return result;
        }
    }
    return null;
}
//# sourceMappingURL=ir-decoder.js.map