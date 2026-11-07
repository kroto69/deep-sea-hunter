export const WALLETS = [
  { id: 'meteor-wallet', name: 'Meteor Wallet' },
  { id: 'my-near-wallet', name: 'MyNearWallet' },
  { id: 'here-wallet', name: 'HERE Wallet' }
];
const storageKey = 'dsh.wallet.provider';
let selector;
export function functionCallAction(methodName,args,deposit='1') {
  return {functionCall:{methodName,args:new TextEncoder().encode(JSON.stringify(args)),gas:100000000000000n,deposit:BigInt(deposit)}};
}
export function selectedWallet() {
  const id = localStorage.getItem(storageKey);
  return WALLETS.some(w => w.id === id) ? id : 'meteor-wallet';
}
export function selectWallet(id) {
  if (!WALLETS.some(w => w.id === id)) throw new Error('Unsupported wallet');
  localStorage.setItem(storageKey, id);
}
export async function testnetWallet(id = selectedWallet()) {
  if (!WALLETS.some(w => w.id === id)) throw new Error('Unsupported wallet');
  if (!selector) {
    const [{ setupWalletSelector }, { setupMeteorWallet }, { setupMyNearWallet }, { setupHereWallet }] = await Promise.all([
      import('https://esm.sh/@near-wallet-selector/core@10.1.4'),
      import('https://esm.sh/@near-wallet-selector/meteor-wallet@10.1.4'),
      import('https://esm.sh/@near-wallet-selector/my-near-wallet@10.1.4'),
      import('https://esm.sh/@near-wallet-selector/here-wallet@10.1.4')
    ]);
    selector = await setupWalletSelector({ network: 'testnet', modules: [setupMeteorWallet(), setupMyNearWallet(), setupHereWallet()] });
  }
  return selector.wallet(id);
}
export async function walletAccount() {
  const wallet = await testnetWallet();
  if (wallet.isSignedIn && !await wallet.isSignedIn()) return null;
  return (await wallet.getAccounts())[0]?.accountId || null;
}
