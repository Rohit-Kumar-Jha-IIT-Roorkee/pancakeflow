const solc = require('/tmp/node_modules/solc');
const fs = require('fs'), path = require('path');
const ROOT = '/home/claude/pancakeflow/contracts';
function walk(d,a=[]){for(const f of fs.readdirSync(d)){const p=path.join(d,f);fs.statSync(p).isDirectory()?walk(p,a):f.endsWith('.sol')&&a.push(p);}return a;}
const files=[...walk(ROOT+'/src'),...walk(ROOT+'/test/mocks')];
const sources={};for(const f of files){sources[path.relative(ROOT,f)]={content:fs.readFileSync(f,'utf8')};}
function findImports(ip){for(const k of Object.keys(sources))if(path.basename(k)===path.basename(ip))return{contents:sources[k].content};return{error:'nf '+ip};}
const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:findImports}));
const pick=(file,name)=>({abi:out.contracts[file][name].abi,bytecode:'0x'+out.contracts[file][name].evm.bytecode.object});
fs.writeFileSync('/tmp/artifacts.json',JSON.stringify({
  ArbExecutor: pick('src/ArbExecutor.sol','ArbExecutor'),
  MockERC20: pick('test/mocks/MockERC20.sol','MockERC20'),
  MockV2Pair: pick('test/mocks/MockV2Pair.sol','MockV2Pair'),
}));
console.log('artifacts written');
