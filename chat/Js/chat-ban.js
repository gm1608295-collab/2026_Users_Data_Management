// ============================================
// CHAT BAN - Ban, Unban, Kick, Countdown
// ============================================
let isUserBanned=false,banExpiryTime=null,banCountdownInterval=null,banRoomId=null;

async function checkBanStatus(roomId){
    clearBanCountdown();isUserBanned=false;banExpiryTime=null;banRoomId=null;
    if(!currentUser||!roomId)return;
    try{const r=await fetch('/api/chat/check_ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,roomId})});const d=await r.json();
    if(d.success&&d.is_banned){isUserBanned=true;banRoomId=roomId;if(d.ban_expiry){banExpiryTime=new Date(d.ban_expiry).getTime();startBanCountdown()}else{showBanIndicator('⛔ Permanently Banned')}updateInputBanState()}}catch(e){}
}
function startBanCountdown(){clearBanCountdown();banCountdownInterval=setInterval(()=>{const now=Date.now(),remaining=banExpiryTime-now;if(remaining<=0){isUserBanned=false;banExpiryTime=null;clearBanCountdown();updateInputBanState();showToast('✅ Ban expired!');return}const s=Math.floor(remaining/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;let t='';if(h>0)t+=h+'h ';if(m>0)t+=m+'m ';t+=sec+'s';showBanIndicator('⛔ Banned · Unban in: '+t);updateInputBanState()},1000)}
function clearBanCountdown(){if(banCountdownInterval){clearInterval(banCountdownInterval);banCountdownInterval=null}const ind=document.getElementById('banIndicator');if(ind)ind.style.display='none'}
function showBanIndicator(text){let ind=document.getElementById('banIndicator');if(!ind){ind=document.createElement('div');ind.id='banIndicator';ind.style.cssText='padding:5px 12px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);border-radius:6px;font-size:9px;color:#e74c3c;text-align:center;font-weight:600;margin:0 10px;display:none';const ia=document.querySelector('.msg-input-area');if(ia)ia.parentNode.insertBefore(ind,ia)}ind.textContent=text;ind.style.display='block'}
function updateInputBanState(){const i=document.getElementById('msgInput');if(i){if(isUserBanned){i.disabled=true;i.placeholder='⛔ You are banned';i.style.opacity='0.5'}else{i.disabled=false;i.placeholder='Message...';i.style.opacity='1'}}}

function banMemberAsk(gid,uid){const d=prompt('⛔ Ban duration (minutes)?\n\nNumber = temporary (text box locked)\n0 or empty = permanent');if(d===null)return;const m=parseInt(d)||0;const msg=m>0?'Ban for '+m+' min?':'Permanent ban?';if(!confirm(msg))return;fetch('/api/chat/ban_member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:gid,userId:uid,requesterId:currentUser.id,durationMinutes:m})}).then(r=>r.json()).then(d=>{if(d.success){showToast('✅ '+(d.message||'Banned!'));showManageMembers(gid)}else{showToast('❌ '+(d.message||'Error'),true)}}).catch(()=>showToast('❌ Server error',true))}
