import { WALLETS, selectWallet, selectedWallet, walletAccount } from './wallet.js';

// Login surface only. Wallet actions reuse OnlineGame.action('wallet'|'disconnect');
// no transaction, mint, listing, buy, transfer or transfer signing happens here.
export function initWalletLogin({ online, hud }) {
  const root = document.getElementById('wallet-login');
  const panel = document.getElementById('wallet-login-panel');
  const toggle = document.getElementById('wallet-toggle');
  const state = document.getElementById('wallet-state');
  const account = document.getElementById('wallet-account-id');
  const session = document.getElementById('wallet-session');
  const error = document.getElementById('wallet-error');
  const picker = document.getElementById('wallet-pick');
  const providers = document.getElementById('wallet-providers');
  providers.replaceChildren(...WALLETS.map(w => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.provider = w.id; button.textContent = w.name;
    return button;
  }));
  const back = document.getElementById('wallet-pick-back');
  const connect = document.getElementById('wallet-connect');
  const disconnect = document.getElementById('wallet-disconnect');
  const guest = document.getElementById('wallet-guest');
  const closeButton = document.getElementById('wallet-close');

  const setText = (el, text) => { el.textContent = text; };
  const buttonLabel = () => { toggle.textContent = online.walletId ? `WALLET · ${online.walletId}` : 'WALLET'; };
  let sessionCheck = 0;
  let choosing = false;
  let pendingProvider = selectedWallet();
  async function refreshSession() {
    const check = ++sessionCheck;
    if (!online.token) { setText(session, 'Online session: none'); return; }
    try {
      const player = await online.api('/api/player');
      if (check !== sessionCheck) return;
      const id = online.walletId;
      setText(session, player.wallet_account && id === player.wallet_account
        ? `Online session: wallet verified (${id})`
        : player.wallet_account ? 'Online session: bound wallet disconnected or different'
          : 'Online session: Guest (wallet not verified)');
    } catch {
      if (check === sessionCheck) setText(session, 'Online session: unavailable');
    }
  }

  function render(message) {
    const id = online.walletId;
    setText(state, message || (id ? 'Wallet connected · Testnet' : 'Wallet not connected · Guest Mode available'));
    setText(account, id ? `Account: ${id}` : '');
    disconnect.classList.toggle('hidden', !id);
    picker.classList.toggle('hidden', !!id || !choosing);
    connect.classList.toggle('hidden', choosing || !!id);
    buttonLabel();
    refreshSession();
  }

  function open() {
    root.classList.remove('hidden');
    choosing = false;
    render();
    (online.walletId ? disconnect : connect).focus();
  }
  function close() { choosing = false; picker.classList.add('hidden'); root.classList.add('hidden'); toggle.focus(); }

  function fail(e) {
    const text = String(e?.message || e);
    const known = [
      [/not Testnet|Testnet contract not configured|wrong_chain/i, 'Network is not Testnet. Wallet login is blocked; Guest Mode still works.'],
      [/reject|cancel|denied|closed/i, 'Wallet request cancelled. Nothing was signed.'],
      [/not connected|not available|no current account|not installed|extension not found/i, `${WALLETS.find(w => w.id === pendingProvider)?.name || 'Wallet'} not available. Install or open it, then retry.`],
      [/failed to fetch|network|unavailable/i, 'Wallet network unavailable. Guest Mode still works.']
    ];
    const mapped = known.find(([re]) => re.test(text))?.[1];
    setText(error, mapped || `${text} · Guest Mode still works.`);
    choosing = false;
    render('Wallet not connected · Guest Mode available');
    if (!root.classList.contains('hidden')) connect.focus();
  }

  async function run(fn, pending) {
    connect.disabled = true; disconnect.disabled = true;
    setText(error, ''); render(pending);
    try { await fn(); render(); }
    catch (e) { fail(e); }
    finally { connect.disabled = false; disconnect.disabled = false; providers.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }

  connect.addEventListener('click', () => {
    choosing = true; render(); providers.querySelector('button')?.focus();
  });
  back.addEventListener('click', () => { choosing = false; render(); connect.focus(); });
  providers.addEventListener('click', e => {
    const button = e.target.closest('[data-provider]');
    if (!button) return;
    pendingProvider = button.dataset.provider;
    providers.querySelectorAll('button').forEach(b => { b.disabled = true; });
    run(async () => {
      const config = await online.api('/api/near/config');
      if (config.network !== 'testnet') throw new Error('Network is not Testnet');
      if (!config.enabled || !config.contractId) throw new Error('Testnet contract not configured');
      selectWallet(pendingProvider);
      const ok = await online.action('wallet');
      if (!ok || !online.walletId) throw new Error(online.error || 'Wallet not connected');
      choosing = false;
    }, `Opening ${button.textContent}…`);
  });

  disconnect.addEventListener('click', () => run(async () => {
    await online.action('disconnect');
    if (online.walletId) throw new Error('Wallet still connected');
    setText(error, '');
  }, 'Disconnecting wallet…'));

  guest.addEventListener('click', () => run(async () => {
    if (online.active && online.profile?.wallet_account) {
      if (!await online.action('logout')) throw new Error(online.error || 'Logout failed');
    }
    if (online.walletId && !await online.action('disconnect')) throw new Error(online.error || 'Disconnect failed');
    close();
    hud.notify(online.active ? 'GUEST MODE · ONLINE' : 'GUEST MODE · OFFLINE SAVE', 2.4);
  }, 'Switching to Guest Mode…'));
  closeButton.addEventListener('click', close);
  toggle.addEventListener('click', () => root.classList.contains('hidden') ? open() : close());
  root.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  picker.addEventListener('keydown', e => {
    if (e.key === 'Escape') { choosing = false; render(); connect.focus(); }
    if (e.key !== 'Tab') return;
    const buttons = [...picker.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (e.shiftKey && index === 0) { e.preventDefault(); buttons.at(-1).focus(); }
    else if (!e.shiftKey && index === buttons.length - 1) { e.preventDefault(); buttons[0].focus(); }
  });

  // Restored session: read wallet storage once, then keep panel in sync with actions.
  render('Checking Testnet wallet…');
  walletAccount().then(id => { online.walletId = id; render(); if (online.hub.open) online.hub.render(); })
    .catch(e => { fail(e); setText(state, 'Wallet not connected · Guest Mode available'); });
  window.addEventListener('dsh-wallet-change', () => render());
  window.addEventListener('dsh-session-change', refreshSession);
  (online.walletId ? disconnect : connect).focus();
  online.walletLogin = { open, close, render };
  return online.walletLogin;
}
