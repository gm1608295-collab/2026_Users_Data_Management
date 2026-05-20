// ============================================
// CHAT CORE - Variables, Socket, Premium, Media
// ============================================
let socket=null,currentUser=null,currentRoom=null,typingTimeout=null,isPremium=false,premiumTier=0;
let selectedFile=null,selectedFileType=null,selectedFileName=null,uploadCancelled=false,isProcessing=false;
let currentRoomType=null,currentRoomData=null;
const IMGBB_KEY='55854bc5e01a19fd4793d1df84326d00';

function showToast(m,e){e=e||false;const t=document.getElementById('toast');t.textContent=m;t.style.background=e?'#e74c3c':'#2ecc71';t.style.color=e?'#fff':'#000';t.style.display='block';setTimeout(()=>t.style.display='none',2500)}
function escapeHtml(t){if(!t)return'';const d=document.createElement('div');d.textContent=t;return d.innerHTML}
function scrollToBottom(){const m=document.getElementById('messages');if(m)m.scrollTop=m.scrollHeight}
function closeModal(id){document.getElementById(id).classList.remove('active')}
function closePremiumReqModal(e){if(e&&e.target!==document.getElementById('premiumReqOverlay'))return;document.getElementById('premiumReqOverlay').classList.remove('active')}
function handleImageClick(){if(!isPremium){document.getElementById('premiumReqOverlay').classList.add('active');return}selectImage()}
function handleFileClick(){if(!isPremium){document.getElementById('premiumReqOverlay').classList.add('active');return}selectFile()}

async function checkPremiumStatus(){
    const t=localStorage.getItem('auth_token');if(!t||t==='guest')return;
    try{const r=await fetch('/api/chat/premium/all_tiers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})});const d=await r.json();
    if(d.success&&d.tiers){let h=0;for(let i=3;i>=1;i--){if(d.tiers[i]){h=i;break}}isPremium=h>0;premiumTier=h;isPremium?(applyPremiumTheme(premiumTier),updateMediaButtons(true)):(applyNormalTheme(),updateMediaButtons(false))}
    else{isPremium=false;premiumTier=0;applyNormalTheme();updateMediaButtons(false)}}catch(e){}
}
function applyNormalTheme(){document.body.classList.remove('bronze-tier','silver-tier','gold-tier');document.body.classList.add('normal-theme');document.getElementById('premiumBadge').style.display='none'}
function applyPremiumTheme(t){
    const b=document.body,ba=document.getElementById('premiumBadge'),pb=document.getElementById('premiumBtn');
    b.classList.remove('normal-theme','bronze-tier','silver-tier','gold-tier');
    function w(tx,ic){let h=ic+' <span class="wave-text">';for(let i=0;i<tx.length;i++)h+=`<span class="wave-letter">${tx[i]}</span>`;return h+='</span>'}
    if(t===1){b.classList.add('bronze-tier');ba.textContent='🥉 BRONZE';ba.style.display='inline-block';if(pb){pb.style.background='linear-gradient(135deg,#CD7F32,#8B4513)';pb.style.color='#fff';pb.style.border='2px solid #E8A87C';pb.innerHTML=w('Bronze','🥉')}}
    else if(t===2){b.classList.add('silver-tier');ba.textContent='🥈 SILVER';ba.style.display='inline-block';if(pb){pb.style.background='linear-gradient(135deg,#C0C0C0,#808080)';pb.style.color='#0a0a0a';pb.style.border='2px solid #E8E8E8';pb.innerHTML=w('Silver','🥈')}}
    else if(t===3){b.classList.add('gold-tier');ba.textContent='🥇 GOLD';ba.style.display='inline-block';if(pb){pb.style.background='linear-gradient(135deg,#FFD700,#B8860B)';pb.style.color='#1a0a00';pb.style.border='2px solid #FFF8DC';pb.innerHTML=w('Gold','🥇')}}
    else{applyNormalTheme()}
}
function updateMediaButtons(h){const i=document.getElementById('imageBtn'),f=document.getElementById('fileBtn'),il=document.getElementById('imageLock'),fl=document.getElementById('fileLock');if(h){i.disabled=false;f.disabled=false;i.classList.remove('locked');f.classList.remove('locked');il.style.display='none';fl.style.display='none'}else{i.disabled=true;f.disabled=true;i.classList.add('locked');f.classList.add('locked');il.style.display='flex';fl.style.display='flex'}}

function selectImage(){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=e=>{if(e.target.files[0]){selectedFile=e.target.files[0];selectedFileType='image';selectedFileName=selectedFile.name;showUploadPreview(selectedFile,'image')}};i.click()}
function selectFile(){const i=document.createElement('input');i.type='file';i.onchange=e=>{if(e.target.files[0]){selectedFile=e.target.files[0];selectedFileType='file';selectedFileName=selectedFile.name;showUploadPreview(selectedFile,'file')}};i.click()}
function showUploadPreview(f,t){const c=document.getElementById('uploadPreviewContent'),m=document.getElementById('uploadPreviewModal');m.classList.add('active');if(t==='image'){const r=new FileReader();r.onload=e=>{c.innerHTML=`<img src="${e.target.result}" style="max-width:100%;border-radius:10px;margin-bottom:10px">`};r.readAsDataURL(f)}else{c.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:10px"><i class="fas fa-file" style="font-size:35px"></i><div style="flex:1"><div style="font-weight:bold;font-size:11px">${escapeHtml(f.name)}</div><div style="font-size:9px;color:rgba(255,255,255,0.5)">${(f.size/1024).toFixed(1)} KB</div></div></div>`}document.getElementById('uploadProgress').style.display='none';document.getElementById('sendUploadBtn').disabled=false;uploadCancelled=false}
function cancelUpload(){uploadCancelled=true;selectedFile=null;document.getElementById('uploadPreviewModal').classList.remove('active')}
async function confirmUpload(){
    if(!selectedFile||uploadCancelled||!currentRoom){if(!currentRoom)showToast('Select a chat room first',true);cancelUpload();return}
    const pd=document.getElementById('uploadProgress'),pf=document.getElementById('progressFill'),pt=document.getElementById('progressText');pd.style.display='block';pf.style.width='0%';pt.textContent='Uploading 0%';document.getElementById('sendUploadBtn').disabled=true;
    let p=0;const pi=setInterval(()=>{if(uploadCancelled)return;p=Math.min(p+8,90);pf.style.width=p+'%';pt.textContent=`Uploading ${p}%`},150);
    try{const r=new FileReader();const b64=await new Promise(r=>{r.onload=e=>r(e.target.result);r.readAsDataURL(selectedFile)});if(uploadCancelled){clearInterval(pi);cancelUpload();return}pf.style.width='95%';pt.textContent='Processing 95%';
    const res=await fetch('/api/chat/upload_file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:localStorage.getItem('auth_token'),base64:b64,fileName:selectedFileName,fileType:selectedFile.type})});const d=await res.json();clearInterval(pi);if(uploadCancelled){cancelUpload();return}
    if(d.success){pf.style.width='100%';pt.textContent='Sent!';await new Promise(r=>setTimeout(r,200));socket.emit('send_message',{roomId:currentRoom,message:selectedFileType==='image'?`📷 IMAGE:${d.url}`:`📎 FILE:${d.url}|${d.fileName||selectedFileName}`,userId:currentUser.id,username:currentUser.username,senderPremiumTier:premiumTier});showToast('Sent!');cancelUpload()}else{showToast(d.message||'Upload failed',true);cancelUpload()}}catch(e){clearInterval(pi);showToast('Upload error',true);cancelUpload()}
}

async function getCurrentUser(){const t=localStorage.getItem('auth_token');if(!t||t==='guest'){document.body.innerHTML='<div style="text-align:center;padding:50px"><h3>Please login to chat</h3><a href="/">Login</a></div>';return null}try{const r=await fetch('/api/chat/current_user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})});const d=await r.json();if(d.success){currentUser=d.user;return currentUser}throw new Error('User not found')}catch(e){document.body.innerHTML='<div style="text-align:center;padding:50px"><h3>Error</h3><a href="/">Back</a></div>';return null}}
function initSocket(){
    socket=io(window.location.origin,{transports:['polling','websocket'],reconnection:true});
    socket.on('connect',()=>{if(currentUser)socket.emit('user_online',{userId:currentUser.id,username:currentUser.username})});
    socket.on('new_message',msg=>{if(currentRoom===msg.roomId){addMessageToUI(msg,msg.sender_id===currentUser?.id,msg.sender_premium_tier||0);scrollToBottom()}loadRooms()});
    socket.on('online_users',u=>{document.getElementById('onlineCount').innerHTML=(u?.length||0)+' online';loadUsersList()});
    socket.on('user_typing',d=>{if(currentRoom===d.roomId&&d.userId!==currentUser?.id){const ind=document.getElementById('typingIndicator');ind.style.display='block';ind.innerHTML=`<i class="fas fa-ellipsis-h"></i> ${escapeHtml(d.username)} typing...`;clearTimeout(typingTimeout);typingTimeout=setTimeout(()=>ind.style.display='none',2000)}});
    socket.on('group_updated',()=>{loadGroupsList();loadRooms()});
}
function onTyping(){if(!currentRoom||!currentUser)return;socket.emit('typing',{roomId:currentRoom,userId:currentUser.id,username:currentUser.username})}

async function init(){
    const po=await checkPageAccess();if(!po)return;
    document.querySelectorAll('.chat-tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.getAttribute('data-tab'))));
    const u=await getCurrentUser();if(!u)return;await checkPremiumStatus();initSocket();loadRooms();
}
init();
