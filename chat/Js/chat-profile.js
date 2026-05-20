// ============================================
// CHAT PROFILE - My Profile, User Profile, Avatar
// ============================================
let pendingAvatarFile=null,currentUploadGroupId=null;

async function loadMyProfile(){
    if(!currentUser){document.getElementById('profilePanel').innerHTML='<div class="empty-state">Login required</div>';return}
    try{const r=await fetch('/api/chat/my_profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id})});const d=await r.json();
    let h='<div style="text-align:center;padding:15px">';if(d.avatar_url){h+=`<img src="${d.avatar_url}" class="profile-avatar-large" id="myAvatarImg" onclick="uploadProfilePic()" onerror="this.outerHTML='<div class=profile-avatar-large style=background:rgba(255,255,255,0.1);display:inline-flex;align-items:center;justify-content:center;font-size:30px;cursor:pointer onclick=uploadProfilePic()>👤</div>'">`}else{h+='<div class="profile-avatar-large" style="background:rgba(255,255,255,0.1);display:inline-flex;align-items:center;justify-content:center;font-size:30px;cursor:pointer" onclick="uploadProfilePic()">👤</div>'}
    h+='<div class="profile-username">@'+escapeHtml(d.username||currentUser.username)+' <span class="copy-btn" onclick="copyUsername(\''+escapeHtml(d.username||currentUser.username)+'\')"><i class="fas fa-copy"></i></span></div>';
    h+='<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:8px">'+escapeHtml(d.name||d.username||'User')+'</div>';
    h+='<div style="display:flex;gap:6px;margin-bottom:10px"><input type="text" id="newUsername" value="'+escapeHtml(d.username||'')+'" placeholder="@username" style="flex:1;padding:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:10px"><button class="btn btn-w" onclick="updateUsername()" style="flex:1;font-size:10px">💾 Save</button></div>';
    h+='<div style="display:flex;gap:6px;margin-bottom:10px"><button class="btn btn-b" onclick="uploadProfilePic()" style="flex:1;font-size:10px"><i class="fas fa-camera"></i> Photo</button>';if(d.avatar_url){h+='<button class="btn btn-r" onclick="deleteProfilePic()" style="flex:1;font-size:10px"><i class="fas fa-trash"></i> Remove</button>'}h+='</div>';
    if(d.groups&&d.groups.length>0){h+='<div class="profile-groups"><div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:6px">📋 My Groups ('+d.groups.length+')</div>';d.groups.forEach(g=>{h+='<div class="group-item" onclick="viewGroupInfo('+g.id+')">👥 '+escapeHtml(g.room_name)+'</div>'});h+='</div>'}else{h+='<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:10px">No groups yet</div>'}
    h+='</div>';document.getElementById('profilePanel').innerHTML=h}catch(e){document.getElementById('profilePanel').innerHTML='<div class="empty-state">Error loading profile</div>'}
}

async function viewUserProfile(uid){
    try{const r=await fetch('/api/chat/user_profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid})});const d=await r.json();
    if(!d.success){showToast('User not found',true);return}
    let h='<img src="'+(d.avatar_url||'')+'" class="profile-avatar-large" onerror="this.style.display=\'none\'"><div class="profile-username">@'+escapeHtml(d.username)+' <span class="copy-btn" onclick="copyUsername(\''+escapeHtml(d.username)+'\')"><i class="fas fa-copy"></i></span></div><div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:10px">'+escapeHtml(d.name||'')+'</div>';
    if(d.groups&&d.groups.length>0){h+='<div class="profile-groups"><div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:6px">Groups ('+d.groups.length+')</div>';d.groups.forEach(g=>{h+='<div class="group-item" onclick="viewGroupInfo('+g.id+');closeModal(\'userProfileModal\')">👥 '+escapeHtml(g.room_name)+'</div>'});h+='</div>'}
    document.getElementById('userProfileContent').innerHTML=h;document.getElementById('userProfileModal').classList.add('active')}catch(e){}
}

function uploadProfilePic(){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=function(e){const files=e.target.files;if(!files||files.length===0)return;pendingAvatarFile=files[0];showAvatarPreview(files[0],'profile')};i.click()}
function uploadGroupPic(gid){currentUploadGroupId=gid;const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=function(e){const files=e.target.files;if(!files||files.length===0)return;pendingAvatarFile=files[0];showAvatarPreview(files[0],'group')};i.click()}

function showAvatarPreview(file,type){
    if(!file){showToast('No file selected',true);return}
    const reader=new FileReader();reader.onload=function(event){const html='<div class="modal-overlay active" id="avatarPreviewModal" onclick="closeAvatarPreview()"><div class="modal-box" onclick="event.stopPropagation()" style="text-align:center"><h3>Preview</h3><img src="'+event.target.result+'" style="max-width:200px;max-height:200px;border-radius:10px;margin:10px 0"><div class="btn-row"><button class="btn btn-g" onclick="saveAvatar(\''+type+'\')">💾 Save</button><button class="btn btn-r" onclick="closeAvatarPreview()">Cancel</button></div></div></div>';document.body.insertAdjacentHTML('beforeend',html)};reader.onerror=function(){showToast('Failed to read file',true)};reader.readAsDataURL(file)}
function closeAvatarPreview(){const m=document.getElementById('avatarPreviewModal');if(m)m.remove();pendingAvatarFile=null}

async function saveAvatar(type){
    if(!pendingAvatarFile)return;closeAvatarPreview();showToast('⏳ Uploading...');
    try{const reader=new FileReader();const base64=await new Promise(r=>{reader.onload=e=>r(e.target.result);reader.readAsDataURL(pendingAvatarFile)});const fd=new URLSearchParams();fd.append('key',IMGBB_KEY);fd.append('image',base64.split(',')[1]);const ir=await fetch('https://api.imgbb.com/1/upload',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fd.toString()});const id=await ir.json();if(!id.success){showToast('❌ '+(id.error?.message||'Upload failed'),true);return}const url=id.data.url;
    if(type==='profile'){await fetch('/api/chat/update_avatar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,avatarUrl:url})});showToast('✅ Updated!');loadMyProfile()}else if(type==='group'){await fetch('/api/chat/update_group_avatar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:currentUploadGroupId,avatarUrl:url})});showToast('✅ Updated!');viewGroupInfo(currentUploadGroupId)}}catch(e){showToast('❌ '+e.message,true)}
}
async function deleteProfilePic(){if(!confirm('Remove photo?'))return;await fetch('/api/chat/update_avatar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,avatarUrl:''})});showToast('Removed');loadMyProfile()}
async function updateUsername(){const nu=document.getElementById('newUsername').value.trim();if(!nu||!nu.startsWith('@')){showToast('Must start with @',true);return}try{const r=await fetch('/api/chat/update_username',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,username:nu.substring(1)})});const d=await r.json();if(d.success){showToast('Updated!');currentUser.username=nu.substring(1);loadMyProfile()}else{showToast(d.message||'Error',true)}}catch(e){showToast('Server error',true)}}
function copyUsername(u){navigator.clipboard.writeText('@'+u).then(()=>showToast('Copied!'))}
