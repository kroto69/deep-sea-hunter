export const createWelcome = ({progression,hub,online,walletLogin,tutorial}) => {
  const root=document.getElementById('welcome'), account=document.getElementById('welcome-account'), guest=document.getElementById('welcome-guest'), near=document.getElementById('welcome-near'), cont=document.getElementById('welcome-continue'), logout=document.getElementById('welcome-logout');
  const render=()=>{const returning=progression.data.tutorialComplete||progression.data.stats.dives>0||Object.keys(progression.data.records).length>0||Object.keys(progression.data.inventory).length>0||Object.keys(progression.data.photos).length>0||Object.keys(progression.data.rare).length>0||progression.cash>0||!!online.token||!!online.walletId;cont.classList.toggle('hidden',!returning);guest.classList.toggle('hidden',returning);near.classList.toggle('hidden',returning);document.getElementById('welcome-google').classList.add('hidden');account.textContent=online.walletId?`WALLET · ${online.walletId}`:online.active?'ONLINE GUEST SESSION':'';logout.classList.toggle('hidden',!online.walletId);};
  const enter=()=>{root.classList.add('hidden');document.getElementById('wallet-guest').click();};
  guest.addEventListener('click',()=>{if(!progression.data.tutorialComplete){root.classList.add('hidden');tutorial.open({resume:false});}else enter();});
  cont.addEventListener('click',async()=>{root.classList.add('hidden');if(online.token)try{await online.connect();}catch{}hub.show();});
  near.addEventListener('click',()=>{root.classList.add('hidden');walletLogin.open();});
  logout.addEventListener('click',async()=>{if(await online.action('disconnect'))render();});
  document.getElementById('welcome-tutorial').addEventListener('click',()=>{root.classList.add('hidden');tutorial.open({resume:false});});
  window.addEventListener('dsh-tutorial-open',()=>tutorial.open({resume:true}));
  render();root.classList.toggle('hidden',!!progression.data.tutorialComplete);
  if(online.token){root.classList.add('hidden');online.api('/api/sessions/me').then(()=>{root.classList.remove('hidden');render();}).catch(()=>{online.token=null;sessionStorage.removeItem('dsh.online.token');root.classList.remove('hidden');render();});}
  return {render};
};
