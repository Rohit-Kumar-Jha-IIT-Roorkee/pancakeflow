import { VM } from '@ethereumjs/vm';
import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { LegacyTransaction } from '@ethereumjs/tx';
import { Address, hexToBytes, bytesToHex, privateToAddress } from '@ethereumjs/util';
import { ethers } from 'ethers';
import fs from 'fs';

const art = JSON.parse(fs.readFileSync('/tmp/artifacts.json','utf8'));
const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });
const vm = await VM.create({ common });

const pk = hexToBytes('0x' + '11'.repeat(32));
const sender = new Address(privateToAddress(pk));
await vm.stateManager.putAccount(sender, (await import('@ethereumjs/util')).Account.fromAccountData({ balance: 10n**20n }));


async function send(to, data, label) {
  const tx = LegacyTransaction.fromTxData({
    to: to ? new Address(hexToBytes(to)) : undefined,
    data: hexToBytes(data), gasLimit: 8_000_000n, gasPrice: 100n, nonce: (await vm.stateManager.getAccount(sender)).nonce,
  }).sign(pk);
  const res = await vm.runTx({ tx, skipBalance: true });
  if (res.execResult.exceptionError) {
    return { ok:false, error: res.execResult.exceptionError.error, ret: bytesToHex(res.execResult.returnValue) };
  }
  return { ok:true, created: res.createdAddress ? res.createdAddress.toString() : null,
           ret: bytesToHex(res.execResult.returnValue), logs: res.execResult.logs };
}

const I = {
  erc20: new ethers.Interface(art.MockERC20.abi),
  pair:  new ethers.Interface(art.MockV2Pair.abi),
  exec:  new ethers.Interface(art.ArbExecutor.abi),
};
async function deploy(name, argsData='') {
  const r = await send(null, art[name].bytecode + argsData, 'deploy '+name);
  if(!r.ok) throw new Error('deploy '+name+' failed: '+r.error);
  return r.created;
}
async function call(addr, iface, fn, args=[]) {
  const data = iface.encodeFunctionData(fn, args);
  const r = await send(addr, data, fn);
  return r;
}
async function callView(addr, iface, fn, args=[]) {
  const data = iface.encodeFunctionData(fn, args);
  const res = await vm.evm.runCall({ to:new Address(hexToBytes(addr)), caller:sender, origin:sender, data:hexToBytes(data) });
  return iface.decodeFunctionResult(fn, bytesToHex(res.execResult.returnValue));
}

const E18 = 10n**18n;
function enc(types, vals){ return ethers.AbiCoder.defaultAbiCoder().encode(types, vals).slice(2); }

// ---- deploy tokens (sorted address matters for pair token0/token1) ----
const wbnb = await deploy('MockERC20', enc(['string','string'],['WBNB','WBNB']));
const usdt = await deploy('MockERC20', enc(['string','string'],['USDT','USDT']));

const poolA = await deploy('MockV2Pair', enc(['address','address'],[wbnb,usdt]));
const poolB = await deploy('MockV2Pair', enc(['address','address'],[wbnb,usdt]));

// poolA: 100 WBNB : 65000 USDT ; poolB: 100 WBNB : 60000 USDT
// poolA: 1000 WBNB : 1,000,000 USDT (1000 USDT/WBNB)
await call(wbnb, I.erc20, 'mint', [poolA, 1000n*E18]);
await call(usdt, I.erc20, 'mint', [poolA, 1_000_000n*E18]);
await call(poolA, I.pair, 'sync', []);
// poolB: 1000 WBNB : 1,150,000 USDT (1150 USDT/WBNB) — 15% richer in USDT
await call(wbnb, I.erc20, 'mint', [poolB, 1000n*E18]);
await call(usdt, I.erc20, 'mint', [poolB, 1_150_000n*E18]);
await call(poolB, I.pair, 'sync', []);

// poolF: dedicated flash lender, deep & neutral, NOT part of the arb cycle.
const poolF = await deploy('MockV2Pair', enc(['address','address'],[wbnb,usdt]));
await call(wbnb, I.erc20, 'mint', [poolF, 5000n*E18]);
await call(usdt, I.erc20, 'mint', [poolF, 5_000_000n*E18]);
await call(poolF, I.pair, 'sync', []);

const exec = await deploy('ArbExecutor', enc(['uint256'],[50n*E18]));
await call(exec, I.exec, 'setExecutor', [sender.toString(), true]);
await call(exec, I.exec, 'setAllowedToken', [wbnb, true]);
await call(exec, I.exec, 'setAllowedToken', [usdt, true]);

const cycle = [
  { pool: poolB, tokenIn: wbnb, tokenOut: usdt, poolType: 2 },
  { pool: poolA, tokenIn: usdt, tokenOut: wbnb, poolType: 2 },
];

let pass=0, fail=0;
const check=(name,cond)=>{ console.log((cond?'  PASS ':'  FAIL ')+name); cond?pass++:fail++; };

// TEST 1: profitable cycle
await call(wbnb, I.erc20, 'mint', [exec, 5n*E18]);
const before = (await callView(wbnb, I.erc20, 'balanceOf', [exec]))[0];
const r1 = await call(exec, I.exec, 'executeCycle', [cycle, 5n*E18, 1n]);
const after = (await callView(wbnb, I.erc20, 'balanceOf', [exec]))[0];
check('profitable cycle executes', r1.ok);
check('balance increased (profit booked)', after > before);
console.log('       start=5e18  profit=', (after-before).toString(), 'wei WBNB');

// TEST 2: reverts below min profit
const r2 = await call(exec, I.exec, 'executeCycle', [cycle, 5n*E18, 100n*E18]);
check('reverts when minProfit unreachable', !r2.ok);

// TEST 3: unprofitable direction reverts
const rev = [
  { pool: poolA, tokenIn: wbnb, tokenOut: usdt, poolType: 2 },
  { pool: poolB, tokenIn: usdt, tokenOut: wbnb, poolType: 2 },
];
const r3 = await call(exec, I.exec, 'executeCycle', [rev, 5n*E18, 1n]);
check('reverts on losing direction', !r3.ok);

// TEST 4: maxNotional enforced
const r4 = await call(exec, I.exec, 'executeCycle', [cycle, 60n*E18, 1n]);
check('reverts above maxNotional', !r4.ok);

// TEST 5: disallowed token
await call(exec, I.exec, 'setAllowedToken', [usdt, false]);
const r5 = await call(exec, I.exec, 'executeCycle', [cycle, 1n*E18, 1n]);
check('reverts on disallowed token', !r5.ok);
await call(exec, I.exec, 'setAllowedToken', [usdt, true]);

// TEST 6: pause blocks
await call(exec, I.exec, 'pause', []);
const r6 = await call(exec, I.exec, 'executeCycle', [cycle, 1n*E18, 1n]);
check('reverts when paused', !r6.ok);
await call(exec, I.exec, 'unpause', []);

// TEST 7: flash arb with zero inventory
// drain exec's wbnb first
const bal = (await callView(wbnb, I.erc20, 'balanceOf', [exec]))[0];
await call(exec, I.exec, 'rescueTokens', [wbnb, sender.toString(), bal]);
const z = (await callView(wbnb, I.erc20, 'balanceOf', [exec]))[0];
const r7 = await call(exec, I.exec, 'flashArb', [poolF, cycle, 3n*E18, 1n]);
const afterFlash = (await callView(wbnb, I.erc20, 'balanceOf', [exec]))[0];
check('flash arb runs with zero starting inventory', z===0n && r7.ok);
check('flash arb retains profit', afterFlash > 0n);
console.log('       flash profit=', afterFlash.toString(), 'wei WBNB (borrowed 3e18, no inventory)');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
