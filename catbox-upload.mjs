// Upload files to catbox.moe and print their DIRECT URLs.
//
//   node catbox-upload.mjs <file> [file...]
//
// Why this exists and gofile-upload.mjs doesn't work here: Instagram's Graph
// API fetches video_url/image_url SERVER-SIDE and needs the raw file bytes
// back with a real Content-Type. gofile.io/d/XXXX is an HTML download page —
// fine for a human to tap on a phone, useless to a server-side fetch, which
// gets a webpage back and rejects the container.
//
// catbox.moe returns a permanent, directly-fetchable URL
// (https://files.catbox.moe/xxxxx.mp4) with one anonymous POST. No token,
// no polling, no folder semantics to fight with.
//
// catbox dedupes by content hash. If an upload is ever interrupted partway,
// catbox can be left holding a truncated object under that hash — and every
// later upload of the SAME bytes just gets handed back that same broken
// object instead of a fresh one (confirmed in production: a 584KB video came
// back as a 782-byte "moov atom not found" file, twice in a row, because the
// first upload attempt had errored out mid-request). Re-uploading identical
// bytes can never fix this. So every upload here is verified by actually
// fetching the URL back and comparing size to the source file — and if it's
// broken, the file is remuxed with a throwaway metadata tag (changes the
// hash, forces a genuinely new object) and re-uploaded, up to 2 tries.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node catbox-upload.mjs <file> [file...]');
  process.exit(1);
}
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`missing file: ${f}`);
    process.exit(1);
  }
}

function remux(file, tag) {
  return new Promise((resolve, reject) => {
    const out = file.replace(/(\.[^.]+)$/, `.retry-${tag}$1`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-c', 'copy', '-metadata', `comment=retry-${tag}`, out]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `ffmpeg exit ${code}`))));
  });
}

async function uploadOnce(file) {
  const buf = fs.readFileSync(file);
  const name = path.basename(file);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buf]), name);

  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  const text = (await res.text()).trim();
  if (!res.ok || !/^https:\/\//.test(text)) {
    throw new Error(`upload rejected: ${text.slice(0, 200)}`);
  }
  return { url: text, expectedSize: buf.length };
}

async function verify(url, expectedSize) {
  const res = await fetch(url);
  const body = new Uint8Array(await res.arrayBuffer());
  return body.length === expectedSize;
}

async function uploadVerified(file, displayName) {
  let currentFile = file;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const { url, expectedSize } = await uploadOnce(currentFile);
    const ok = await verify(url, expectedSize);
    if (ok) {
      if (attempt > 0) console.error(`    (recovered after ${attempt} retry${attempt > 1 ? 'ies' : ''})`);
      return url;
    }
    console.error(`  ⚠ ${displayName}: hosted file didn't match source (attempt ${attempt + 1}/3) — remuxing and retrying`);
    if (attempt < 2) currentFile = await remux(file, attempt + 1);
  }
  throw new Error(`${displayName}: catbox kept returning a broken object after 3 attempts — try a different filename or host`);
}

const links = [];

for (const file of files) {
  const name = path.basename(file);
  try {
    const url = await uploadVerified(file, name);
    const size = fs.statSync(file).size;
    links.push({ name, url });
    console.error(`  ${name}  ${(size / 1024).toFixed(0)} KB  ->  ${url}`);
  } catch (e) {
    console.error(`upload failed for ${name}: ${e.message}`);
    process.exit(1);
  }
}

console.error('');
for (const l of links) console.log(`${l.name}\t${l.url}`);
