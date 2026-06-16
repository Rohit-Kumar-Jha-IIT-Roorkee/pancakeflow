const solc = require('/tmp/node_modules/solc');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/claude/pancakeflow/contracts';

// Gather all .sol under src/ and test/ (skip forge-std — not needed for compile check of src+mocks)
function walk(dir, acc=[]) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('.sol')) acc.push(p);
  }
  return acc;
}

// Compile src + mocks (test files import forge-std which we don't have here;
// compiling src + mocks proves the contract + mock surface is type-correct).
const files = [
  ...walk(path.join(ROOT,'src')),
  ...walk(path.join(ROOT,'test/mocks')),
];

const sources = {};
for (const f of files) {
  const rel = path.relative(ROOT, f);
  sources[rel] = { content: fs.readFileSync(f,'utf8') };
}

// import resolver: map "./interfaces/X.sol" style relative imports
function findImports(importPath) {
  // try as relative to known roots
  const candidates = [
    path.join(ROOT, importPath),
    path.join(ROOT, 'src', importPath),
  ];
  // also resolve relative imports already keyed in sources
  for (const key of Object.keys(sources)) {
    if (key.endsWith(importPath.replace(/^\.\//,'')) || path.basename(key)===path.basename(importPath))
      return { contents: sources[key].content };
  }
  for (const c of candidates) if (fs.existsSync(c)) return { contents: fs.readFileSync(c,'utf8') };
  return { error: 'not found: '+importPath };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi','evm.bytecode.object'] } }
  }
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errs = (out.errors||[]).filter(e=>e.severity==='error');
const warns = (out.errors||[]).filter(e=>e.severity==='warning');
console.log('files compiled:', Object.keys(sources).length);
console.log('errors:', errs.length, ' warnings:', warns.length);
for (const e of errs) console.log('ERROR:', e.formattedMessage);
for (const w of warns.slice(0,5)) console.log('warn:', (w.formattedMessage||'').split('\n')[0]);
if (errs.length===0) {
  const bc = out.contracts['src/ArbExecutor.sol']?.ArbExecutor?.evm?.bytecode?.object || '';
  console.log('ArbExecutor bytecode size:', Math.floor(bc.length/2), 'bytes');
}
process.exit(errs.length ? 1 : 0);
