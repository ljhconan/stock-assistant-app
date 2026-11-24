"""GitHub Action 用：解密 data.enc.json 取出要用到的股票代码，从 Yahoo Finance 下载两年日线，
写成 out/<hmac>.json。文件名是 HMAC(密码, 代码)，看不出是哪只股票；行情本身是公开数据。"""
import base64, hashlib, hmac, json, os, sys, time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import yfinance as yf

pw = os.environ['PASSCODE'].encode()
e = json.load(open('data.enc.json'))
b = lambda s: base64.b64decode(s)
key = hashlib.pbkdf2_hmac('sha256', pw, b(e['salt']), e['iter'], 32)
D = json.loads(AESGCM(key).decrypt(b(e['iv']), b(e['ct']), None))

syms = {'SPY', 'QQQ'}
syms |= {h[0] for h in D.get('holdings', [])}
for w in D.get('watch', []):
    syms.add(w['s'] if isinstance(w, dict) else w[0])
syms |= {r[0] for r in D.get('radar', [])}
for v in (D.get('val') or {}).values():
    syms |= {p[0] for p in (v.get('peers') or [])}
syms = sorted(s for s in syms if s and s.replace('.', '').replace('-', '').isalnum())
print(len(syms), 'symbols')

os.makedirs('out', exist_ok=True)
name = lambda s: hmac.new(pw, s.encode(), hashlib.sha256).hexdigest()[:24]
ok, bad = 0, []
for i in range(0, len(syms), 40):
    chunk = syms[i:i + 40]
    df = yf.download([s.replace('.', '-') for s in chunk], period='2y', interval='1d', auto_adjust=False,
                     group_by='ticker', threads=True, progress=False)
    for s in chunk:
        try:
            t = df[s.replace('.', '-')] if getattr(df.columns, 'nlevels', 1) > 1 else df
            t = t.dropna(subset=['Close', 'Open'])
            if len(t) < 30: raise ValueError('short')
            out = {'s': s, 'src': 'Yahoo Finance', 'd': [d.strftime('%Y-%m-%d') for d in t.index],
                   'o': [round(x, 4) for x in t['Open']], 'h': [round(x, 4) for x in t['High']],
                   'l': [round(x, 4) for x in t['Low']], 'c': [round(x, 4) for x in t['Close']],
                   'v': [int(x) for x in t['Volume'].fillna(0)]}
            json.dump(out, open(f'out/{name(s)}.json', 'w'), separators=(',', ':'))
            ok += 1
        except Exception as ex:
            bad.append(f'{s}:{ex}')
    time.sleep(2)
json.dump({'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'ok': ok, 'failed': len(bad)}, open('out/status.json', 'w'))
print('ok', ok, 'failed', bad)
if ok == 0: sys.exit(1)
