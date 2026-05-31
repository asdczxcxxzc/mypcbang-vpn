// 웹 UI(web/) 를 암호화해 C++ 내장 헤더(src/Resources_gen.inc)를 생성.
// 빌드 전에 한 번 실행:  node tools/pack.js
// (CMake pre-build 단계에 넣어 자동화 가능 — BUILD.md 참고)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(__dirname, '..', 'src', 'Resources_gen.inc');

// 무작위 키 (빌드마다 달라짐 → 정적 추출 난이도↑). 0 바이트 회피.
const KEYLEN = 16;
const key = crypto.randomBytes(KEYLEN);
for (let i = 0; i < KEYLEN; i++) key[i] = key[i] || 0x5C;

// 모든 파일(이미지 포함) exe에 내장 → 폴더 없이 exe 단독 배포 가능.
const exts = ['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp'];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function walk(dir, base = '') {
  let out = [];
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const rel = base + '/' + f;
    if (fs.statSync(fp).isDirectory()) out = out.concat(walk(fp, rel));
    else if (exts.includes(path.extname(f).toLowerCase())) out.push({ rel, fp });
  }
  return out;
}

function cbytes(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i++) { s += '0x' + buf[i].toString(16).padStart(2, '0') + ','; if ((i & 15) === 15) s += '\n'; }
  return s;
}

const files = walk(WEB);
let inc = '// 자동 생성됨 (tools/pack.js). 직접 편집 금지.\n';
inc += `static const unsigned char ENC_KEY[] = {${[...key].map((b) => '0x' + b.toString(16)).join(',')}};\n`;
inc += 'struct Emb { const char* path; const unsigned char* data; size_t len; const char* mime; };\n';

const entries = [];
files.forEach((f, idx) => {
  const raw = fs.readFileSync(f.fp);
  const enc = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) enc[i] = raw[i] ^ key[i % KEYLEN];
  inc += `static const unsigned char d${idx}[] = {\n${cbytes(enc)}\n};\n`;
  entries.push(`{ "${f.rel}", d${idx}, ${raw.length}, "${mime[path.extname(f.fp).toLowerCase()]}" }`);
});

inc += `static const Emb kEmbedded[] = {\n${entries.join(',\n')}\n};\n`;
inc += `static const size_t kEmbeddedCount = ${entries.length};\n`;

fs.writeFileSync(OUT, inc);
console.log(`✅ ${files.length}개 파일 암호화 내장 → ${path.relative(process.cwd(), OUT)}`);
