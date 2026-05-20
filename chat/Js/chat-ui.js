// ============================================
// CHAT UI - Tabs, Lists, Messages, Send
// ============================================
function switchTab(t){
    document.querySelectorAll('.chat-tab').forEach(x=>x.classList.remove('active'));document.querySelector(`.chat-tab[data-tab="${t}"]`).classList.add('active');
    ['roomList','usersList','groupsList','profilePanel'].forEach(id=>document.getElementById(id).classList.remove('active'));document.getElementById('chatArea').classList.remove('active');
    if(t==='rooms'){document.getElementById('roomList').classList.add('active');loadRooms()}else if(t==='users'){document.getElementById('usersList').classList.add('active');loadUsersList()}else if(t==='groups'){document.getElementById('groupsList').classList.add('active');loadGroupsList()}else if(t==='profile'){document.getElementById('profilePanel').classList.add('active');loadMyProfile()}
}

async function loadRooms(){
    if(!currentUser)return;
    try{const r=await fetch('/api/chat/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id})});const d=await r.json();const c=document.getElementById('roomList');
    if(d.rooms?.length){c.innerHTML=d.rooms.map(room=>{
        let avatarHtml=room.avatar_url?`<img src="${room.avatar_url}" class="room-avatar" onerror="this.style.display='none'">`:`<div class="room-icon">${room.room_type==='admin'?'👑':room.room_type==='group'?'👥':'💬'}</div>`;
        return`<div class="room-item" onclick="openRoom(${room.id},'${escapeHtml(room.room_name)}','${room.room_type}')">${avatarHtml}<div class="room-info"><div class="room-name">${escapeHtml(room.room_name)}</div><div class="room-last">${escapeHtml(room.last_message||'No messages')}</div></div>${room.unread>0?`<div class="room-badge">${room.unread}</div>`:''}</div>`;
    }).join('')}else{c.innerHTML='<div class="empty-state"><p>No chat rooms yet</p><button class="admin-btn" onclick="startAdminChat()">📞 Chat with Admin</button></div>'}}catch(e){}
}
async function loadUsersList(){
    if(!currentUser)return;
    try{const r=await fetch('/api/chat/online_users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id})});const d=await r.json();const ou=(d.users||[]).filter(u=>u.user_id!==currentUser.id);
    document.getElementById('usersList').innerHTML=ou.length?ou.map(u=>`<div class="user-item" onclick="viewUserProfile(${u.user_id})"><div class="online-indicator"></div><div class="room-info"><div class="room-name">${escapeHtml(u.username)}</div><div class="room-last" style="color:#2ecc71">🟢 Online</div></div></div>`).join(''):'<div class="empty-state"><p>No online users</p></div>'}catch(e){}
}
async function loadGroupsList(){
    if(!currentUser)return;
    try{const r=await fetch('/api/chat/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id})});const d=await r.json();
    if(d.groups?.length){document.getElementById('groupsList').innerHTML=d.groups.map(g=>{
        let avatarHtml=g.avatar_url?`<img src="${g.avatar_url}" class="room-avatar" onerror="this.style.display='none'">`:`<div class="room-icon">👥</div>`;
        let roleHtml='';if(g.user_role==='owner')roleHtml='<span class="role-badge owner">Owner</span>';else if(g.user_role==='admin')roleHtml='<span class="role-badge admin">Admin</span>';else roleHtml='<span class="role-badge member">Member</span>';
        return`<div class="room-item" onclick="viewGroupInfo(${g.id})">${avatarHtml}<div class="room-info"><div class="room-name">${escapeHtml(g.room_name)}</div><div class="room-last">${escapeHtml(g.last_message||'No messages')} · ${g.member_count||0} members</div></div>${roleHtml}</div>`;
    }).join('')}else{document.getElementById('groupsList').innerHTML='<div class="empty-state"><p>No groups yet</p><button class="admin-btn" onclick="openCreateGroupModal()">➕ Create New Group</button></div>'}}catch(e){}
}

async function openRoom(rid,rn,rt){
    currentRoom=rid;currentRoomType=rt;
    document.querySelectorAll('.room-list').forEach(l=>l.classList.remove('active'));document.getElementById('profilePanel').classList.remove('active');
    document.getElementById('chatArea').classList.add('active');document.getElementById('chatRoomTitle').textContent=rn;
    document.getElementById('reportBtn').style.display=rt==='group'?'inline-block':'none';
    if(rt==='group'){try{const r=await fetch('/api/chat/group_info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:rid,userId:currentUser.id})});const d=await r.json();if(d.success&&d.avatar_url){document.getElementById('chatRoomAvatar').src=d.avatar_url;document.getElementById('chatRoomAvatar').style.display='inline-block'}else{document.getElementById('chatRoomAvatar').style.display='none'}}catch(e){}}
    else{document.getElementById('chatRoomAvatar').style.display='none'}
    await checkBanStatus(rid);
    const mc=document.getElementById('messages');mc.innerHTML='<div style="text-align:center;padding:20px">Loading...</div>';
    if(socket&&socket.connected)socket.emit('join_room',rid);
    try{const r=await fetch(`/api/chat/messages/${rid}`);const d=await r.json();if(d.messages?.length){mc.innerHTML='';d.messages.forEach(msg=>addMessageToUI(msg,msg.sender_id===currentUser?.id,msg.sender_premium_tier||0));scrollToBottom()}else mc.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4)">No messages yet</div>';await fetch('/api/chat/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:rid,userId:currentUser.id})})}catch(e){mc.innerHTML='<div style="text-align:center;padding:20px;color:#e74c3c">Error</div>'}
}

function addMessageToUI(msg,isMine,spt=0){
    const c=document.getElementById('messages');if(c.innerHTML.includes('No messages')||c.innerHTML.includes('Loading'))c.innerHTML='';
    let mh='';const mt=msg.message||'';if(mt.startsWith('📷 IMAGE:')){const u=mt.replace('📷 IMAGE:','');mh=`<div class="media-message" onclick="downloadMedia('${u}','image')"><img src="${u}" loading="lazy"></div>`}else if(mt.startsWith('📎 FILE:')){const p=mt.replace('📎 FILE:','').split('|');mh=`<div class="file-message" onclick="downloadMedia('${p[0]}','file','${p[1]||'File'}')"><i class="fas fa-file"></i> ${escapeHtml(p[1]||'File')}<i class="fas fa-download" style="margin-left:auto;opacity:0.7"></i></div>`}else{mh=escapeHtml(mt)}
    const d=document.createElement('div');d.className=`msg-row ${isMine?'mine msg-mine':'other msg-other'}`;
    let bc='normal-tier';if(spt===1)bc='bronze-tier';else if(spt===2)bc='silver-tier';else if(spt===3)bc='gold-tier';
    let avatarHtml='';if(!isMine&&msg.avatar_url){avatarHtml=`<img src="${msg.avatar_url}" class="msg-avatar" onclick="viewUserProfile(${msg.sender_id})" onerror="this.style.display='none'">`}else if(!isMine){avatarHtml=`<div class="msg-avatar" style="background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer" onclick="viewUserProfile(${msg.sender_id})">👤</div>`}
    d.innerHTML=`${avatarHtml}<div class="msg-bubble ${bc}">${!isMine?`<div class="msg-sender" onclick="viewUserProfile(${msg.sender_id})">${escapeHtml(msg.username||'User')}</div>`:''}${mh}<div class="msg-time">${new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div>`;c.appendChild(d)
}
function downloadMedia(u,t,fn='file'){const a=document.createElement('a');a.href=u;a.download=t==='image'?'image.jpg':fn;document.body.appendChild(a);a.click();document.body.removeChild(a)}
function sendMessage(){const i=document.getElementById('msgInput');const m=i.value.trim();if(!m)return;if(!currentRoom){showToast('Select a chat room',true);return}if(isUserBanned){showToast('⛔ You are banned',true);return}socket.emit('send_message',{roomId:currentRoom,message:m,userId:currentUser.id,username:currentUser.username,senderPremiumTier:premiumTier});i.value='';i.focus();setTimeout(()=>i.focus(),50)}
function handleKeyDown(e){if(e.key==='Enter'){e.preventDefault();sendMessage()}}
function closeChat(){currentRoom=null;currentRoomType=null;clearBanCountdown();isUserBanned=false;updateInputBanState();document.getElementById('chatArea').classList.remove('active');document.getElementById('roomList').classList.add('active');loadRooms()}
function deleteCurrentRoom(){if(!currentRoom||!confirm('Delete?'))return;fetch('/api/chat/delete_room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:currentRoom,userId:currentUser.id})}).then(()=>{showToast('Deleted');closeChat()}).catch(()=>showToast('Error',true))}
function viewRoomProfile(){if(currentRoomType==='group'&&currentRoom){viewGroupInfo(currentRoom)}}
async function startAdminChat(){if(!currentUser)return;try{const r=await fetch('/api/chat/create_admin_room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id})});const d=await r.json();if(d.success){openRoom(d.room.id,d.room.room_name,'admin');loadRooms()}else showToast('Error',true)}catch(e){}}
function insertEmoji(e){const i=document.getElementById('msgInput');const p=i.selectionStart;i.value=i.value.substring(0,p)+e+i.value.substring(p);i.focus();i.setSelectionRange(p+e.length,p+e.length)}
