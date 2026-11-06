export const createTutorial = ({progression,hud,hub,getPaused,setPaused}) => {
  const root=document.getElementById('tutorial'), steps=[
    ['Explore the Ocean','Swim through the reef, adjust your depth, and watch which habitats each fish prefers.','W A S D · MOVE   SPACE / CTRL · DEPTH   SHIFT · BOOST','JOYSTICK · MOVE   UP / DN · DEPTH   BST · BOOST','◈'],
    ['Hunt Fish','Aim with the speargun, fire at a fish, then swim close and interact to collect it.','MOUSE · LOOK   RIGHT CLICK · AIM   LEFT CLICK · FIRE   E · COLLECT','LOOK AREA   AIM · AIM   FIRE · SHOOT   ACT · COLLECT','➤'],
    ['Manage Oxygen','Oxygen drains while swimming and faster at depth or under boost. Watch the gauge; return to the surface or boat before it runs out.','OXYGEN GAUGE · BOAT REFILLS','OXYGEN GAUGE · BOAT REFILLS','◉'],
    ['Return to Boat','Open Boat Hub near your boat. Check your hold, sell fish to Dock Merchant, and spend credits on equipment.','E · OPEN / CLOSE BOAT HUB','ACT · OPEN / CLOSE BOAT HUB','⌂'],
    ['Explore and Progress','Complete missions, unlock dive zones, find collectibles, and use sonar, flashlight, and camera.','R · SONAR   F · FLASHLIGHT   P · CAMERA   ESC · PAUSE','SON · SONAR   LGT · LIGHT   CAM · CAMERA','✧']
  ];let index=0,resume=false;
  const paint=()=>{const s=steps[index];document.getElementById('tutorial-step-count').textContent=`0${index+1} / 05`;document.getElementById('tutorial-title').textContent=s[0];document.getElementById('tutorial-description').textContent=s[1];document.getElementById('tutorial-icon').textContent=s[4];document.getElementById('tutorial-controls').innerHTML=`<span class="desktop-controls">${s[2]}</span><span class="mobile-controls">${s[3]}</span>`;document.getElementById('tutorial-progress-fill').style.width=`${(index+1)*20}%`;document.getElementById('tutorial-prev').disabled=index===0;document.getElementById('tutorial-next').classList.toggle('hidden',index===4);document.getElementById('tutorial-finish').classList.toggle('hidden',index!==4);};
  const complete=()=>{progression.data.tutorialComplete=true;progression.save();window.dshWelcome?.render();};
  const finish=()=>{complete();root.classList.add('hidden');if(resume)setPaused(false);else{setPaused(false);hub.show();}};
  const open=options=>{resume=!!options?.resume;setPaused(true);hud.setPaused(false);root.classList.remove('hidden');paint();document.getElementById('tutorial-next').focus();};
  const close=()=>{root.classList.add('hidden');if(resume){setPaused(false);hud.setPaused(false);}else{complete();setPaused(false);hub.show();}};
  document.getElementById('tutorial-prev').onclick=()=>{index=Math.max(0,index-1);paint();};document.getElementById('tutorial-next').onclick=()=>{index=Math.min(4,index+1);paint();};document.getElementById('tutorial-finish').onclick=finish;document.getElementById('tutorial-skip').onclick=finish;document.getElementById('tutorial-close').onclick=close;
  return {open,close};
};
