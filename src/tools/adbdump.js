// Minimal browser adbdump for apk v3 Packages.adb
// - No filesystem APIs (reads via <input type="file">)
// - Supports ADBd and ADBc(deflate/none) envelopes using DecompressionStream where available

const ADB_FORMAT_MAGIC = 0x2e424441; // 'ADB.'
const ADB_SCHEMA_INDEX = 0x78646e69; // 'indx'

const ADB_BLOCK_ADB = 0;
const ADB_BLOCK_EXT = 3;

const ADB_TYPE_INT = 0x10000000 >>> 0;
const ADB_TYPE_INT_32 = 0x20000000 >>> 0;
const ADB_TYPE_INT_64 = 0x30000000 >>> 0;
const ADB_TYPE_BLOB_8 = 0x80000000 >>> 0;
const ADB_TYPE_BLOB_16 = 0x90000000 >>> 0;
const ADB_TYPE_BLOB_32 = 0xa0000000 >>> 0;
const ADB_TYPE_ARRAY = 0xd0000000 >>> 0;
const ADB_TYPE_OBJECT = 0xe0000000 >>> 0;
const ADB_VALUE_MASK = 0x0fffffff;

const ADBI_NDX_DESCRIPTION = 0x01;
const ADBI_NDX_PACKAGES = 0x02;

const Pkg = {
  ADBI_PI_NAME: 0x01,
  ADBI_PI_VERSION: 0x02,
  ADBI_PI_HASHES: 0x03,
  ADBI_PI_DESCRIPTION: 0x04,
  ADBI_PI_ARCH: 0x05,
  ADBI_PI_LICENSE: 0x06,
  ADBI_PI_ORIGIN: 0x07,
  ADBI_PI_MAINTAINER: 0x08,
  ADBI_PI_URL: 0x09,
  ADBI_PI_REPO_COMMIT: 0x0a,
  ADBI_PI_BUILD_TIME: 0x0b,
  ADBI_PI_INSTALLED_SIZE: 0x0c,
  ADBI_PI_FILE_SIZE: 0x0d,
  ADBI_PI_PROVIDER_PRIORITY: 0x0e,
  ADBI_PI_DEPENDS: 0x0f,
  ADBI_PI_PROVIDES: 0x10,
  ADBI_PI_REPLACES: 0x11,
  ADBI_PI_INSTALL_IF: 0x12,
  ADBI_PI_RECOMMENDS: 0x13,
  ADBI_PI_LAYER: 0x14,
  ADBI_PI_TAGS: 0x15,
};

const Dep = { ADBI_DEP_NAME: 0x01, ADBI_DEP_VERSION: 0x02, ADBI_DEP_MATCH: 0x03 };
const OP = { EQUAL:1, LESS:2, GREATER:4, FUZZY:8, CONFLICT:16 };
OP.DEPMASK_ANY = OP.EQUAL | OP.LESS | OP.GREATER; // 7
OP.DEPMASK_CHECKSUM = OP.LESS | OP.GREATER; // 6

const tdAscii = new TextDecoder('ascii');
const tdUtf8 = new TextDecoder('utf-8');

function readU32(dv, off) { return dv.getUint32(off, true) >>> 0; }
function readU64(dv, off) { return (BigInt(dv.getUint32(off, true)) | (BigInt(dv.getUint32(off+4, true)) << 32n)); }
function hexOf(u8) { return [...u8].map(b => b.toString(16).padStart(2,'0')).join(''); }
function toSafeNumber(v) { return (typeof v === 'bigint' && v > BigInt(Number.MAX_SAFE_INTEGER)) ? v.toString() : Number(v); }

function isDebug() {
  const el = document.getElementById('debug');
  return !!(el && el.checked);
}

function dlog(msg) {
  if (!isDebug()) return;
  console.log(msg);
  const el = document.getElementById('log');
  if (el) el.textContent += msg + '\n';
}

dlog('browser-adbdump.js loaded');

async function maybeDecompress(u8) {
  if (u8.byteLength < 4) throw new Error('File too small');
  const head = tdAscii.decode(u8.subarray(0,4));
  dlog(`head: '${head.replace(/\n/g,"\\n")}', bytes: [${[...u8.subarray(0,4)].join(', ')}]`);
  if (head === 'ADBd') {
    dlog(`envelope: ADBd (deflate)`);
    const out = await inflate(u8.subarray(4));
    dlog(`decompressed len: ${out.length}`);
    return out;
  } else if (head === 'ADBc') {
    if (u8.byteLength < 6) throw new Error('Truncated ADBc header');
    const alg = u8[4];
    const level = u8[5];
    const rest = u8.subarray(6);
    dlog(`envelope: ADBc alg=${alg} level=${level} restLen=${rest.length}`);
    if (alg === 0x00) { dlog('ADBc: none'); return rest; }
    if (alg === 0x01) { const out = await inflate(rest); dlog(`ADBc: deflate => ${out.length}`); return out; }
    if (alg === 0x02) throw new Error('ADB zstd not supported in browser');
    throw new Error('Unknown ADBc compression algorithm');
  }
  return u8; // already raw ADB file
}

async function inflate(u8) {
  if (typeof DecompressionStream !== 'function') throw new Error('Deflate not supported by this browser');
  try {
    return await pipeDecompress(u8, 'deflate');
  } catch (e1) {
    dlog(`deflate failed: ${e1 && e1.message ? e1.message : e1}`);
    try {
      return await pipeDecompress(u8, 'deflate-raw');
    } catch (e2) {
      dlog(`deflate-raw failed: ${e2 && e2.message ? e2.message : e2}`);
      throw e2;
    }
  }
}

async function pipeDecompress(u8, format) {
  const readable = new Blob([u8]).stream().pipeThrough(new DecompressionStream(format));
  const ab = await new Response(readable).arrayBuffer();
  return new Uint8Array(ab);
}

function parseADBBlocks(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 8) throw new Error('File too small');
  const magic = readU32(dv, 0);
  if (magic !== ADB_FORMAT_MAGIC) throw new Error('Not an ADB file (missing ADB. header)');
  const schema = readU32(dv, 4);
  dlog(`file header ok, schema=0x${schema.toString(16).padStart(8,'0')}`);
  let off = 8;
  let adbPayload = null;
  while (off < u8.byteLength) {
    if (off + 4 > u8.byteLength) throw new Error('Truncated block header');
    const typeSize = readU32(dv, off);
    const typeIndicator = typeSize >>> 30;
    let blockType, hdrSize, rawSize;
    if (typeIndicator === ADB_BLOCK_EXT) {
      if (off + 16 > u8.byteLength) throw new Error('Truncated extended block header');
      blockType = typeSize & 0x3fffffff;
      hdrSize = 16;
      rawSize = Number(readU64(dv, off + 8));
    } else {
      blockType = typeIndicator;
      hdrSize = 4;
      rawSize = typeSize & 0x3fffffff;
    }
    const payloadLen = rawSize - hdrSize;
    const payloadOff = off + hdrSize;
    dlog(`block@${off}: type=${blockType} hdr=${hdrSize} raw=${rawSize} payloadOff=${payloadOff} payloadLen=${payloadLen}`);
    if (payloadOff + payloadLen > u8.byteLength) throw new Error('Truncated block payload');
    if (blockType === ADB_BLOCK_ADB) {
      adbPayload = u8.subarray(payloadOff, payloadOff + payloadLen);
      dlog(`ADB block found len=${adbPayload.length}`);
      break;
    }
    const blockSize = (rawSize + 7) & ~7; // align to 8
    off += blockSize;
  }
  if (!adbPayload) throw new Error('No ADB block found');
  return { schema, adbPayload };
}

class ADBReader {
  constructor(u8) {
    if (u8.byteLength < 8) throw new Error('ADB payload too small');
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const compat = this.dv.getUint8(0);
    const ver = this.dv.getUint8(1);
    this.rootTag = readU32(this.dv, 4);
    dlog(`adb hdr: compat=${compat} ver=${ver} rootTag=0x${this.rootTag.toString(16)}`);
  }
  _slice(tag, localOff, size) {
    const base = tag & ADB_VALUE_MASK;
    const start = base + localOff;
    const end = start + size;
    if (end > this.u8.byteLength) throw new Error('Out-of-bounds deref');
    return this.u8.subarray(start, end);
  }
  readInt(tag) {
    const t = tag >>> 0;
    const type = (t & 0xf0000000) >>> 0;
    if (type === ADB_TYPE_INT) return t & ADB_VALUE_MASK;
    if (type === ADB_TYPE_INT_32) return new DataView(this._slice(t, 0, 4).buffer, this._slice(t, 0, 4).byteOffset, 4).getUint32(0, true);
    if (type === ADB_TYPE_INT_64) return readU64(new DataView(this._slice(t, 0, 8).buffer, this._slice(t, 0, 8).byteOffset, 8), 0);
    return 0;
  }
  readBlob(tag) {
    const t = tag >>> 0;
    const type = (t & 0xf0000000) >>> 0;
    if (type === ADB_TYPE_BLOB_8) {
      const len = this._slice(t, 0, 1)[0];
      return this._slice(t, 1, len);
    }
    if (type === ADB_TYPE_BLOB_16) {
      const v = this._slice(t, 0, 2);
      const len = new DataView(v.buffer, v.byteOffset, 2).getUint16(0, true);
      return this._slice(t, 2, len);
    }
    if (type === ADB_TYPE_BLOB_32) {
      const v = this._slice(t, 0, 4);
      const len = new DataView(v.buffer, v.byteOffset, 4).getUint32(0, true);
      return this._slice(t, 4, len);
    }
    return new Uint8Array(0);
  }
  readString(tag) { return tdUtf8.decode(this.readBlob(tag)); }
  readHex(tag) { return hexOf(this.readBlob(tag)); }
  readObj(tag) {
    const t = tag >>> 0;
    const type = (t & 0xf0000000) >>> 0;
    if (type !== ADB_TYPE_OBJECT && type !== ADB_TYPE_ARRAY) throw new Error('Not an object/array tag');
    const first = this._slice(t, 0, 4);
    const numSlots = new DataView(first.buffer, first.byteOffset, 4).getUint32(0, true);
    const bytes = this._slice(t, 0, 4 * numSlots);
    const out = new Array(numSlots);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < numSlots; i++) out[i] = dv.getUint32(4 * i, true) >>> 0;
    return out;
  }
}

function versionOpString(op) {
  const o = op & ~OP.CONFLICT;
  switch (o) {
    case OP.LESS: return '<';
    case OP.LESS | OP.EQUAL: return '<=';
    case OP.LESS | OP.EQUAL | OP.FUZZY: return '<~';
    case OP.EQUAL | OP.FUZZY:
    case OP.FUZZY: return '~';
    case OP.EQUAL: return '=';
    case OP.GREATER | OP.EQUAL: return '>=';
    case OP.GREATER | OP.EQUAL | OP.FUZZY: return '>~';
    case OP.GREATER: return '>';
    case OP.DEPMASK_CHECKSUM: return '><';
    case OP.DEPMASK_ANY: return '';
    default: return '?';
  }
}

function dependencyToString(rdr, tag) {
  const obj = rdr.readObj(tag);
  const nameTag = (Dep.ADBI_DEP_NAME < obj.length ? obj[Dep.ADBI_DEP_NAME] >>> 0 : 0);
  if (!nameTag) return '';
  const name = rdr.readString(nameTag);
  const verTag = (Dep.ADBI_DEP_VERSION < obj.length ? obj[Dep.ADBI_DEP_VERSION] >>> 0 : 0);
  const matchTag = (Dep.ADBI_DEP_MATCH < obj.length ? obj[Dep.ADBI_DEP_MATCH] >>> 0 : 0);
  let op = matchTag ? Number(rdr.readInt(matchTag)) : 0;
  if (op === 0) op = OP.EQUAL;
  if (!verTag) return (op & OP.CONFLICT) ? ('!' + name) : name;
  const ver = rdr.readString(verTag);
  const sgn = (op & OP.CONFLICT) ? '!' : '';
  return `${sgn}${name}${versionOpString(op)}${ver}`;
}

function parseStringArray(rdr, tag) {
  const arr = rdr.readObj(tag);
  const out = [];
  for (let i = 1; i < arr.length; i++) {
    const t = arr[i] >>> 0; if (!t) continue;
    out.push(rdr.readString(t));
  }
  return out;
}

function parseDependencyArray(rdr, tag) {
  const arr = rdr.readObj(tag);
  const out = [];
  for (let i = 1; i < arr.length; i++) {
    const t = arr[i] >>> 0; if (!t) continue;
    out.push(dependencyToString(rdr, t));
  }
  return out;
}

function parsePkginfo(rdr, tag) {
  const obj = rdr.readObj(tag);
  const g = (f) => (f < obj.length ? (obj[f] >>> 0) : 0);
  const out = {};
  if (g(Pkg.ADBI_PI_NAME)) out.name = rdr.readString(g(Pkg.ADBI_PI_NAME));
  if (g(Pkg.ADBI_PI_VERSION)) out.version = rdr.readString(g(Pkg.ADBI_PI_VERSION));
  if (g(Pkg.ADBI_PI_DESCRIPTION)) out.description = rdr.readString(g(Pkg.ADBI_PI_DESCRIPTION));
  if (g(Pkg.ADBI_PI_ARCH)) out.arch = rdr.readString(g(Pkg.ADBI_PI_ARCH));
  if (g(Pkg.ADBI_PI_LICENSE)) out.license = rdr.readString(g(Pkg.ADBI_PI_LICENSE));
  if (g(Pkg.ADBI_PI_ORIGIN)) out.origin = rdr.readString(g(Pkg.ADBI_PI_ORIGIN));
  if (g(Pkg.ADBI_PI_MAINTAINER)) out.maintainer = rdr.readString(g(Pkg.ADBI_PI_MAINTAINER));
  if (g(Pkg.ADBI_PI_URL)) out.url = rdr.readString(g(Pkg.ADBI_PI_URL));
  if (g(Pkg.ADBI_PI_REPO_COMMIT)) out['repo-commit'] = rdr.readHex(g(Pkg.ADBI_PI_REPO_COMMIT));
  if (g(Pkg.ADBI_PI_HASHES)) out.hashes = rdr.readHex(g(Pkg.ADBI_PI_HASHES));
  if (g(Pkg.ADBI_PI_BUILD_TIME)) out['build-time'] = toSafeNumber(rdr.readInt(g(Pkg.ADBI_PI_BUILD_TIME)));
  if (g(Pkg.ADBI_PI_INSTALLED_SIZE)) out['installed-size'] = toSafeNumber(rdr.readInt(g(Pkg.ADBI_PI_INSTALLED_SIZE)));
  if (g(Pkg.ADBI_PI_FILE_SIZE)) out['file-size'] = toSafeNumber(rdr.readInt(g(Pkg.ADBI_PI_FILE_SIZE)));
  if (g(Pkg.ADBI_PI_PROVIDER_PRIORITY)) out['provider-priority'] = toSafeNumber(rdr.readInt(g(Pkg.ADBI_PI_PROVIDER_PRIORITY)));
  if (g(Pkg.ADBI_PI_LAYER)) out.layer = toSafeNumber(rdr.readInt(g(Pkg.ADBI_PI_LAYER)));
  if (g(Pkg.ADBI_PI_TAGS)) out.tags = parseStringArray(rdr, g(Pkg.ADBI_PI_TAGS));
  if (g(Pkg.ADBI_PI_DEPENDS)) out.depends = parseDependencyArray(rdr, g(Pkg.ADBI_PI_DEPENDS));
  if (g(Pkg.ADBI_PI_PROVIDES)) out.provides = parseDependencyArray(rdr, g(Pkg.ADBI_PI_PROVIDES));
  if (g(Pkg.ADBI_PI_REPLACES)) out.replaces = parseDependencyArray(rdr, g(Pkg.ADBI_PI_REPLACES));
  if (g(Pkg.ADBI_PI_INSTALL_IF)) out['install-if'] = parseDependencyArray(rdr, g(Pkg.ADBI_PI_INSTALL_IF));
  if (g(Pkg.ADBI_PI_RECOMMENDS)) out.recommends = parseDependencyArray(rdr, g(Pkg.ADBI_PI_RECOMMENDS));
  return out;
}

async function dumpFile(file, pretty) {
  const buf = new Uint8Array(await file.arrayBuffer());
  dlog(`file: ${file.name} size=${buf.length}`);
  const outObj = await parsePackagesAdbFromBytes(buf);
  return pretty ? JSON.stringify(outObj, null, 2) : JSON.stringify(outObj);
}

// Export a programmatic parser for integration in the app
export async function parsePackagesAdbFromBytes(buf) {
  const u8 = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  const raw = await maybeDecompress(u8);
  const { schema, adbPayload } = parseADBBlocks(raw);
  if (schema !== ADB_SCHEMA_INDEX) throw new Error(`Unsupported schema: 0x${schema.toString(16)}`);
  const rdr = new ADBReader(adbPayload);
  const root = rdr.readObj(rdr.rootTag);
  dlog(`root slots: ${root.length}`);
  const outObj = {};
  const descTag = (ADBI_NDX_DESCRIPTION < root.length ? root[ADBI_NDX_DESCRIPTION] >>> 0 : 0);
  if (descTag) outObj.description = rdr.readString(descTag);
  const specTag = (3 < root.length ? root[3] >>> 0 : 0);
  if (specTag) outObj['pkgname-spec'] = rdr.readString(specTag);
  const pkTag = (ADBI_NDX_PACKAGES < root.length ? root[ADBI_NDX_PACKAGES] >>> 0 : 0);
  dlog(`packagesTag: 0x${(pkTag>>>0).toString(16)}`);
  const pkgs = [];
  if (pkTag) {
    const arr = rdr.readObj(pkTag);
    dlog(`packages count: ${arr.length-1}`);
    for (let i = 1; i < arr.length; i++) {
      const t = arr[i] >>> 0; if (!t) continue;
      dlog(` package[${i}] tag=0x${t.toString(16)}`);
      pkgs.push(parsePkginfo(rdr, t));
    }
  }
  outObj.packages = pkgs;
  return outObj;
}

// Wire up UI (only if elements exist)
if (typeof document !== 'undefined') {
  const elFile = document.getElementById('file');
  const elRun = document.getElementById('run');
  const elPretty = document.getElementById('pretty');
  const elOut = document.getElementById('out');

  if (elRun && elFile && elOut && elPretty) {
    elRun.addEventListener('click', async () => {
      const elLog = document.getElementById('log');
      if (elLog) elLog.textContent = '';
      elOut.textContent = '';
      const f = elFile.files && elFile.files[0];
      if (!f) { elOut.textContent = 'Please select a .adb file'; return; }
      try {
        const json = await dumpFile(f, elPretty.checked);
        elOut.textContent = json;
      } catch (e) {
        elOut.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
        if (e && e.stack && isDebug()) dlog(e.stack);
      }
    });
  }
}
