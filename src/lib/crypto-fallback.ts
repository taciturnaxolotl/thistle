/**
 * Pure JavaScript crypto implementations for non-secure contexts.
 * Only used when crypto.subtle is unavailable (HTTP non-localhost).
 */

/**
 * Pure JS SHA-256 implementation.
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
	const K = new Uint32Array([
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
		0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
		0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
		0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
		0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
		0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
		0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
		0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
		0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
	]);

	const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
	const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
	const maj = (x: number, y: number, z: number) =>
		(x & y) ^ (x & z) ^ (y & z);
	const s0 = (x: number) => rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
	const s1 = (x: number) => rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
	const g0 = (x: number) => rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
	const g1 = (x: number) => rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);

	// Pad message
	const msgLen = data.length;
	const bitLen = msgLen * 8;
	const padLen = msgLen + 1 + ((119 - msgLen) % 64);
	const padded = new Uint8Array(padLen + 8);
	padded.set(data);
	padded[msgLen] = 0x80;
	new DataView(padded.buffer).setUint32(padLen + 4, bitLen, false);

	// Initialize hash
	let h0 = 0x6a09e667;
	let h1 = 0xbb67ae85;
	let h2 = 0x3c6ef372;
	let h3 = 0xa54ff53a;
	let h4 = 0x510e527f;
	let h5 = 0x9b05688c;
	let h6 = 0x1f83d9ab;
	let h7 = 0x5be0cd19;

	// Process blocks
	const w = new Uint32Array(64);
	for (let i = 0; i < padded.length; i += 64) {
		const view = new DataView(padded.buffer, i, 64);
		for (let j = 0; j < 16; j++) w[j] = view.getUint32(j * 4, false);
		for (let j = 16; j < 64; j++)
			w[j] = (g1(w[j - 2]) + w[j - 7] + g0(w[j - 15]) + w[j - 16]) | 0;

		let a = h0,
			b = h1,
			c = h2,
			d = h3,
			e = h4,
			f = h5,
			g = h6,
			h = h7;

		for (let j = 0; j < 64; j++) {
			const t1 = (h + s1(e) + ch(e, f, g) + K[j] + w[j]) | 0;
			const t2 = (s0(a) + maj(a, b, c)) | 0;
			h = g;
			g = f;
			f = e;
			e = (d + t1) | 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) | 0;
		}

		h0 = (h0 + a) | 0;
		h1 = (h1 + b) | 0;
		h2 = (h2 + c) | 0;
		h3 = (h3 + d) | 0;
		h4 = (h4 + e) | 0;
		h5 = (h5 + f) | 0;
		h6 = (h6 + g) | 0;
		h7 = (h7 + h) | 0;
	}

	const result = new Uint8Array(32);
	const view = new DataView(result.buffer);
	view.setUint32(0, h0, false);
	view.setUint32(4, h1, false);
	view.setUint32(8, h2, false);
	view.setUint32(12, h3, false);
	view.setUint32(16, h4, false);
	view.setUint32(20, h5, false);
	view.setUint32(24, h6, false);
	view.setUint32(28, h7, false);

	return result;
}

/**
 * HMAC-SHA256 using pure JS SHA-256.
 */
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	const blockSize = 64;
	const opad = new Uint8Array(blockSize).fill(0x5c);
	const ipad = new Uint8Array(blockSize).fill(0x36);

	if (key.length > blockSize) {
		key = await sha256(key);
	}

	const keyPadded = new Uint8Array(blockSize);
	keyPadded.set(key);

	for (let i = 0; i < blockSize; i++) {
		opad[i] ^= keyPadded[i];
		ipad[i] ^= keyPadded[i];
	}

	const inner = new Uint8Array(blockSize + data.length);
	inner.set(ipad);
	inner.set(data, blockSize);

	const innerHash = await sha256(inner);

	const outer = new Uint8Array(blockSize + 32);
	outer.set(opad);
	outer.set(innerHash, blockSize);

	return sha256(outer);
}

/**
 * Pure JS PBKDF2-HMAC-SHA256 implementation.
 */
export async function pbkdf2Fallback(
	password: Uint8Array,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const dkLen = 32; // 256 bits
	const hLen = 32; // SHA-256 output length
	const l = Math.ceil(dkLen / hLen);
	const r = dkLen - (l - 1) * hLen;

	const dk = new Uint8Array(dkLen);

	for (let i = 1; i <= l; i++) {
		const saltInt = new Uint8Array(salt.length + 4);
		saltInt.set(salt);
		new DataView(saltInt.buffer).setUint32(salt.length, i, false);

		let u = await hmac(password, saltInt);
		const t = new Uint8Array(u);

		for (let j = 1; j < iterations; j++) {
			u = await hmac(password, u);
			for (let k = 0; k < hLen; k++) {
				t[k] ^= u[k];
			}
		}

		const offset = (i - 1) * hLen;
		const len = i === l ? r : hLen;
		dk.set(t.subarray(0, len), offset);
	}

	return dk;
}
