function bytesToRecord(value) {
  if (value instanceof Uint8Array) {
    let binary = '';
    for (let i = 0; i < value.length; i += 1) binary += String.fromCharCode(value[i]);
    return { __u8: btoa(binary) };
  }
  if (Array.isArray(value)) return value.map(bytesToRecord);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = bytesToRecord(item);
    return out;
  }
  return value;
}

function recordToBytes(value) {
  if (value && typeof value === 'object' && typeof value.__u8 === 'string' && Object.keys(value).length === 1) {
    const binary = atob(value.__u8);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  if (Array.isArray(value)) return value.map(recordToBytes);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = recordToBytes(item);
    return out;
  }
  return value;
}

export function encodeSaver(saver) {
  return JSON.stringify(bytesToRecord({ storage: saver.storage, writes: saver.writes }));
}

export function restoreSaver(saver, json) {
  if (!json) return false;
  const decoded = recordToBytes(JSON.parse(json));
  saver.storage = decoded.storage || Object.create(null);
  saver.writes = decoded.writes || Object.create(null);
  return true;
}
