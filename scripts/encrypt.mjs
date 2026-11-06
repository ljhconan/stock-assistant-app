// 把 data.json 加密成 data.enc.json（AES-256-GCM，密钥由密码经 PBKDF2-SHA256 派生）。
// 用法：PASSCODE='你的密码' node scripts/encrypt.mjs [输入=data.json] [输出=data.enc.json]
// data.json 是明文持仓数据，已在 .gitignore 里，永远不要提交。
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const pass = process.env.PASSCODE;
if (!pass) { console.error('缺少 PASSCODE 环境变量'); process.exit(1); }
const input = process.argv[2] || 'data.json';
const output = process.argv[3] || 'data.enc.json';

const plain = readFileSync(input, 'utf8');
JSON.parse(plain); // 先确认是合法 JSON

const iter = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));

const b64 = u => Buffer.from(u).toString('base64');
writeFileSync(output, JSON.stringify({ v: 1, iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
console.log(`已加密 ${input} → ${output}（${ct.length} 字节）`);
