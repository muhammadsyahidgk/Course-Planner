var SUPABASE_URL='https://kuxpcqclmekqfrhnfryr.supabase.co';
var SUPABASE_ANON_KEY='sb_publishable_BOgAPc5LgP5-knHVjoEhFA_jOaheyX3';
var DAYS=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'],KEY='kuliah-planner-v1',tab='dash';
var S={courses:[],schedule:[],att:[],tasks:[]};
try{var raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
var supabaseClient=null,account=null,storageKey=KEY,tm=null,authBusy=false,legacyImportPending=false,themeChoice='system';
try{var savedTheme=localStorage.getItem('kuliah-planner-theme');if(['light','dark','system'].indexOf(savedTheme)>=0)themeChoice=savedTheme}catch(e){}
function applyTheme(){if(themeChoice==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',themeChoice)}
function setTheme(theme){if(['light','dark','system'].indexOf(theme)<0)return;themeChoice=theme;try{localStorage.setItem('kuliah-planner-theme',theme)}catch(e){}applyTheme();syncThemeButtons()}
function syncThemeButtons(){document.querySelectorAll('[data-theme-choice]').forEach(function(button){button.setAttribute('aria-pressed',button.dataset.themeChoice===themeChoice?'true':'false')})}
applyTheme();
function push(){if(!supabaseClient||!account)return;clearTimeout(tm);tm=setTimeout(function(){tm=null;supabaseClient.from('planner_state').upsert({user_id:account.id,data:JSON.parse(JSON.stringify(S)),updated_at:new Date().toISOString()},{onConflict:'user_id'}).then(function(result){if(result.error)throw result.error;if(legacyImportPending){try{localStorage.setItem('kuliah-planner-legacy-imported','1')}catch(e){}legacyImportPending=false}badge('☁️ Tersinkron')}).catch(function(){badge('⚠️ Gagal sync (tersimpan lokal)')})},400)}
function save(){S.rev=Date.now();try{localStorage.setItem(storageKey,JSON.stringify(S))}catch(e){}push()}
function badge(t){var e=document.getElementById('sync');if(e)e.textContent=t}
function updateProfile(){var name=document.getElementById('profileName'),detail=document.getElementById('profileDetail'),topbar=document.getElementById('topbar'),avatar=document.querySelector('.avatar');if(topbar)topbar.hidden=!account;if(name)name.textContent=account&&account.email?account.email:'Pengguna lokal';if(detail)detail.textContent=account?'Akun tersinkron':'Mode penyimpanan lokal';if(avatar)avatar.textContent=account&&account.email?account.email.charAt(0).toUpperCase():'P';syncThemeButtons()}
function toggleProfileMenu(){var menu=document.getElementById('profileMenu'),button=document.getElementById('profileBtn'),open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',open?'true':'false');if(open)updateProfile()}
function closeProfileMenu(){var menu=document.getElementById('profileMenu'),button=document.getElementById('profileBtn');if(menu&&!menu.hidden){menu.hidden=true;button.setAttribute('aria-expanded','false')}}
function openSettings(){closeProfileMenu();var layer=document.getElementById('settingsLayer');layer.innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)closeSettings()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"><div class="modal-head"><h2 id="settingsTitle">Pengaturan</h2><button class="x" type="button" aria-label="Tutup pengaturan" onclick="closeSettings()">✕</button></div><div class="settings-section"><h3>Tampilan</h3><p class="theme-label">Pilih mode warna</p><div class="theme-options" aria-label="Mode tampilan"><button type="button" data-theme-choice="light" onclick="setTheme(\'light\')">Terang</button><button type="button" data-theme-choice="dark" onclick="setTheme(\'dark\')">Gelap</button><button type="button" data-theme-choice="system" onclick="setTheme(\'system\')">Sistem</button></div></div><div class="settings-section"><h3>Penyimpanan</h3><p>'+(account?'Data tersimpan dan disinkronkan dengan akun.':'Data tersimpan di browser ini.')+'</p></div></section></div>';layer.hidden=false;syncThemeButtons()}
function closeSettings(){var layer=document.getElementById('settingsLayer');if(layer){layer.hidden=true;layer.innerHTML=''}}
document.addEventListener('click',function(event){if(!event.target.closest('.profile-area'))closeProfileMenu()});
function renderAuth(message){
  document.getElementById('nav').innerHTML='';
  updateProfile();
  document.getElementById('view').innerHTML='<div class="card auth"><h2>Sign in</h2><p>Use the account provided by the planner administrator.</p><form onsubmit="submitAuth(event)"><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" required><label for="authPassword">Password</label><input id="authPassword" type="password" autocomplete="current-password" minlength="6" required><p class="auth-error">'+(message?esc(message):'')+'</p><button class="btn" type="submit" '+(authBusy?'disabled':'')+'>'+(authBusy?'Please wait...':'Sign in')+'</button></form></div>';
}
function submitAuth(event){
  event.preventDefault();if(!supabaseClient)return;
  var email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value;
  authBusy=true;renderAuth();
  supabaseClient.auth.signInWithPassword({email:email,password:password}).then(function(result){if(result.error)throw result.error;authBusy=false;}).catch(function(error){authBusy=false;renderAuth(error.message||'Unable to sign in.')});
}
function signOut(){closeProfileMenu();if(supabaseClient)supabaseClient.auth.signOut()}
function useSession(session){
  var next=session&&session.user;
  if(!next){account=null;storageKey=KEY;badge('🔒 Sign in required');renderAuth();return}
  if(account&&account.id===next.id)return;
  account=next;storageKey=KEY+'-user-'+account.id;
  var local=null,legacy=null;
  try{local=JSON.parse(localStorage.getItem(storageKey)||'null');if(!local&&!localStorage.getItem('kuliah-planner-legacy-imported'))legacy=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
  legacyImportPending=!!legacy;
  S=Object.assign({courses:[],schedule:[],att:[],tasks:[]},local||legacy||{});
  badge('☁️ Loading...');
  supabaseClient.from('planner_state').select('data').eq('user_id',account.id).maybeSingle().then(function(result){
    if(!account||account.id!==next.id)return;
    if(result.error)throw result.error;
    var pushLocal=false;
    if(result.data&&result.data.data){var remote=Object.assign({courses:[],schedule:[],att:[],tasks:[]},result.data.data);if((+remote.rev||0)>(+S.rev||0))S=remote;else if((+S.rev||0)>(+remote.rev||0))pushLocal=true;}
    if(backfillAttendance())save();
    try{localStorage.setItem(storageKey,JSON.stringify(S))}catch(e){}
    render();if(result.data&&!pushLocal)badge('☁️ Synced');if(!result.data||pushLocal)push();
  }).catch(function(error){badge('⚠️ DB unavailable');render();console.error(error)});
}
function startApp(){
  var configured=SUPABASE_URL.indexOf('YOUR_')<0&&SUPABASE_ANON_KEY.indexOf('YOUR_')<0;
  if(configured&&window.supabase&&window.supabase.createClient){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    supabaseClient.auth.onAuthStateChange(function(event,session){setTimeout(function(){useSession(session)},0)});
    supabaseClient.auth.getSession().then(function(result){if(result.error)throw result.error;useSession(result.data.session)}).catch(function(){renderAuth('Could not connect to Supabase.')});
    badge('🔒 Sign in required');renderAuth();return;
  }
  if(backfillAttendance())save();
  badge('📱 Local · Supabase not configured');render();
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
function v(id){return document.getElementById(id).value.trim()}
function cn(id){var c=S.courses.find(function(x){return x.id===id});return c?esc(c.name):'(dihapus)'}
function iso(d){var z=new Date(d.getTime()-d.getTimezoneOffset()*6e4);return z.toISOString().slice(0,10)}
function backfillAttendance(){
  var start=new Date(2026,8,7),end=new Date(2026,11,26),last=new Date();last.setDate(last.getDate()-1);last.setHours(0,0,0,0);if(last>end)last=end;
  var changed=false;
  for(var day=new Date(start);day<=last;day.setDate(day.getDate()+1)){
    var date=iso(day),weekday=(day.getDay()+6)%7;
    S.schedule.filter(function(x){return x.day===weekday}).forEach(function(slot){
      if(!S.att.some(function(x){return x.cid===slot.cid&&x.date===date})){
        S.att.push({id:uid(),cid:slot.cid,date:date,st:'Hadir'});changed=true;
      }
    });
  }
  return changed;
}
function fmt(d){return new Date(d+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
function opts(sel){return S.courses.map(function(c){return '<option value="'+c.id+'"'+(c.id===sel?' selected':'')+'>'+esc(c.name)+'</option>'}).join('')}
var todayIdx=(new Date().getDay()+6)%7,todayISO=iso(new Date());
document.getElementById('today').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

var TABS={dash:'Beranda',schedule:'Jadwal',tasks:'Tugas',att:'Absensi',courses:'Mata Kuliah'};
var ed={k:null,id:null};
function go(t){tab=t;ed={k:null,id:null};render()}
function edit(k,id){ed={k:k,id:id};render()}
function addNew(k){ed={k:k,id:null};render()}
function cancel(){ed={k:null,id:null};render()}
function modalDialog(title,content){return '<div class="modal-backdrop" onclick="if(event.target===this)cancel()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><h2 id="modalTitle">'+title+'</h2><button class="x" type="button" aria-label="Tutup" onclick="cancel()">✕</button></div>'+content+'</section></div>'}
document.addEventListener('keydown',function(event){if(event.key==='Escape'){if(ed.k==='courses'||ed.k==='tasks'||ed.k==='att')cancel();closeProfileMenu();closeSettings()}});
function cur(k){return ed.k===k?S[k].find(function(x){return x.id===ed.id}):null}
function render(){
  document.getElementById('nav').innerHTML=Object.keys(TABS).map(function(k){return '<button class="'+(k===tab?'on':'')+'" onclick="go(\''+k+'\')">'+TABS[k]+'</button>'}).join('');
  document.getElementById('view').innerHTML=VIEWS[tab]();
  updateProfile();
}
function needCourse(){return S.courses.length?'':'<div class="card empty">Tambahkan mata kuliah dulu di tab “Mata Kuliah”.</div>'}
function del(key,id){if(!confirm('Hapus data ini?'))return;S[key]=S[key].filter(function(x){return x.id!==id});if(key==='courses'){['schedule','att','tasks'].forEach(function(k){S[k]=S[k].filter(function(x){return x.cid!==id})})}if(ed.id===id)ed={k:null,id:null};save();render()}
function pct(cid){var a=S.att.filter(function(x){return x.cid===cid&&x.st!=='Tidak ada'});if(!a.length)return null;return Math.round(a.filter(function(x){return x.st==='Hadir'}).length/a.length*100)}
function acts(k,id){return '<button class="x" style="color:var(--pr)" title="Edit" onclick="edit(\''+k+'\',\''+id+'\')">✎</button><button class="x" title="Hapus" onclick="del(\''+k+'\',\''+id+'\')">✕</button>'}
function btns(e,fn,label){return '<button class="btn" onclick="'+fn+'()">'+(e?'Simpan perubahan':label)+'</button>'+(e?' <button class="btn" style="background:var(--mu)" onclick="cancel()">Batal</button>':'')}
function scheds(cid){return S.schedule.filter(function(x){return x.cid===cid}).sort(function(a,b){return a.day-b.day||a.s.localeCompare(b.s)})}
function attendanceCourses(date,selected){var weekday=(new Date(date+'T00:00').getDay()+6)%7,courses=S.courses.filter(function(c){return S.schedule.some(function(x){return x.cid===c.id&&x.day===weekday})});if(selected&&!courses.some(function(c){return c.id===selected})){var current=S.courses.find(function(c){return c.id===selected});if(current)courses.push(current)}return courses}
function attendanceOpts(date,selected){return attendanceCourses(date,selected).map(function(c){return '<option value="'+c.id+'"'+(c.id===selected?' selected':'')+'>'+esc(c.name)+'</option>'}).join('')}
function attendanceStatusOptions(selected){return '<option value="">— pilih status —</option>'+['Hadir','Izin','Sakit','Alpha','Tidak ada'].map(function(status){return '<option value="'+status+'"'+(selected===status?' selected':'')+'>'+status+'</option>'}).join('')}
function showSecondSchedule(){var fields=document.getElementById('secondScheduleFields'),button=document.getElementById('addSecondSchedule');if(fields)fields.hidden=false;if(button)button.hidden=true}

var VIEWS={
dash:function(){
  var ts=S.schedule.filter(function(x){return x.day===todayIdx}).sort(function(a,b){return a.s.localeCompare(b.s)});
  var tk=S.tasks.filter(function(x){return !x.done}).sort(function(a,b){return a.due.localeCompare(b.due)}).slice(0,5);
  return '<div class="grid"><div class="card"><h2>Kuliah hari ini</h2>'+(ts.length?ts.map(function(x){return '<div class="item"><div class="grow"><b>'+cn(x.cid)+'</b><div class="mu">'+x.s+'–'+x.e+(x.room?' · '+esc(x.room):'')+'</div></div></div>'}).join(''):'<div class="empty">Tidak ada jadwal hari ini.</div>')+'</div>'+
  '<div class="card"><h2>Tugas terdekat</h2>'+(tk.length?tk.map(function(x){return '<div class="item"><div class="grow"><b>'+esc(x.title)+'</b><div class="mu">'+cn(x.cid)+'</div></div><span class="'+(x.due<todayISO?'late':'mu')+'">'+fmt(x.due)+'</span></div>'}).join(''):'<div class="empty">Tidak ada tugas tertunda 🎉</div>')+'</div>'+
  '<div class="card"><h2>Kehadiran</h2>'+(S.courses.length?S.courses.map(function(c){var p=pct(c.id);return '<div style="margin-bottom:8px"><div class="mu">'+esc(c.name)+' — '+(p===null?'belum ada data':p+'%')+'</div><div class="bar"><i style="width:'+(p||0)+'%"></i></div></div>'}).join(''):'<div class="empty">Belum ada mata kuliah.</div>')+'</div></div>';
},
courses:function(){
  var e=cur('courses'),sc=e?scheds(e.id):[];
  function scheduleFields(index,label){var slot=sc[index],id=index+1;return '<div class="mu" style="margin:8px 0 4px">'+label+'</div><div class="row"><select id="cDay'+id+'"><option value="">— tanpa jadwal —</option>'+DAYS.map(function(d,i){return '<option value="'+i+'"'+(slot&&slot.day===i?' selected':'')+'>'+d+'</option>'}).join('')+'</select><input id="cS'+id+'" type="time" value="'+(slot?slot.s:'08:00')+'"><input id="cE'+id+'" type="time" value="'+(slot?slot.e:'09:40')+'"><input id="cR'+id+'" placeholder="Ruang" value="'+(slot?esc(slot.room||''):'')+'"></div>'}
  var f='<div class="row"><input id="cName" placeholder="Nama mata kuliah" value="'+(e?esc(e.name):'')+'"><input id="cLec" placeholder="Dosen" value="'+(e?esc(e.lec||''):'')+'"><input id="cSks" type="number" min="1" max="6" placeholder="SKS" value="'+(e?esc(e.sks||''):'')+'"></div>'+
  scheduleFields(0,'Waktu kelas 1')+'<div id="secondScheduleFields"'+(sc.length>1?'':' hidden')+'>'+scheduleFields(1,'Waktu kelas 2')+'</div>'+(sc.length>1?'':'<button id="addSecondSchedule" class="btn secondary" type="button" onclick="showSecondSchedule()">＋ Tambah waktu kelas ke-2</button>')+btns(e,'saveCourse','Tambah');
  var modal=ed.k==='courses'?modalDialog(e?'Edit mata kuliah':'Tambah mata kuliah',f):'';
  return modal+'<div class="card"><div class="list-heading"><h2>Daftar ('+S.courses.length+' MK, '+S.courses.reduce(function(a,c){return a+(+c.sks||0)},0)+' SKS)</h2><button class="btn" onclick="addNew(\'courses\')">＋ Tambah</button></div>'+(S.courses.length?S.courses.map(function(c){var slots=scheds(c.id);return '<div class="item"><div class="grow"><b>'+esc(c.name)+'</b><div class="mu">'+esc(c.lec||'-')+' · '+(c.sks||'-')+' SKS</div>'+(slots.length?slots.map(function(slot){return '<div class="mu">'+DAYS[slot.day]+', '+slot.s+'–'+slot.e+(slot.room?' · '+esc(slot.room):'')+'</div>'}).join(''):'<div class="mu">Belum ada jadwal</div>')+'</div>'+acts('courses',c.id)+'</div>'}).join(''):'<div class="empty">Belum ada mata kuliah.</div>')+'</div>';
},
schedule:function(){
  return DAYS.map(function(d,i){var l=S.schedule.filter(function(x){return x.day===i}).sort(function(a,b){return a.s.localeCompare(b.s)});return '<div class="card"><h2>'+d+(i===todayIdx?' <span class="tag">hari ini</span>':'')+'</h2>'+(l.length?l.map(function(x){var c=S.courses.find(function(y){return y.id===x.cid});return '<div class="item"><div class="grow"><b>'+cn(x.cid)+'</b><div class="mu">'+x.s+'–'+x.e+(x.room?' · '+esc(x.room):'')+(c&&c.lec?' · '+esc(c.lec):'')+'</div></div></div>'}).join(''):'<div class="empty">Tidak ada jadwal.</div>')+'</div>'}).join('');
},
att:function(){
  if(!S.courses.length)return needCourse();
  var e=cur('att'),date=e?e.date:todayISO,choices=attendanceCourses(date,e&&e.cid);
  var f;
  if(e){
    var courseSelect=choices.length?'<select id="aC">'+attendanceOpts(date,e.cid)+'</select>':'<select id="aC" disabled><option value="">Mata kuliah tidak ditemukan</option></select>';
    f='<div class="mu" style="margin-bottom:8px">Tanggal: '+fmt(e.date)+'</div><div class="row">'+courseSelect+'<select id="aS">'+attendanceStatusOptions(e.st).replace('<option value="">— pilih status —</option>','')+'</select></div>'+btns(e,'addAtt','Simpan');
  }else{
    var rows=choices.map(function(c){var meetings=S.schedule.filter(function(x){return x.cid===c.id&&x.day===todayIdx}).sort(function(a,b){return a.s.localeCompare(b.s)}),record=S.att.find(function(x){return x.cid===c.id&&x.date===todayISO}),times=meetings.map(function(x){return x.s+'–'+x.e+(x.room?' · '+esc(x.room):'')}).join(', ');return '<div class="item"><div class="grow"><b>'+esc(c.name)+'</b><div class="mu">'+times+'</div></div><select class="attendance-status" data-att-cid="'+esc(c.id)+'">'+attendanceStatusOptions(record&&record.st)+'</select></div>'}).join('');
    f='<div class="mu" style="margin-bottom:8px">Tanggal otomatis: '+fmt(todayISO)+'</div>'+(rows||'<div class="empty">Tidak ada mata kuliah terjadwal hari ini.</div>')+'<button class="btn" onclick="saveAttendanceDay()" '+(choices.length?'':'disabled')+'>Simpan kehadiran</button>';
  }
  var modal=ed.k==='att'?modalDialog(e?'Edit kehadiran':'Catat kehadiran',f):'';
  var rec=S.courses.map(function(c){var a=S.att.filter(function(x){return x.cid===c.id&&x.st!=='Tidak ada'}),p=pct(c.id);return '<div style="margin-bottom:10px"><b>'+esc(c.name)+'</b> <span class="mu">— '+a.length+' pertemuan, hadir '+(p===null?'-':p+'%')+'</span><div class="bar"><i style="width:'+(p||0)+'%"></i></div></div>'}).join('');
  var attendanceByDate={};S.att.forEach(function(x){if(!attendanceByDate[x.date])attendanceByDate[x.date]=[];attendanceByDate[x.date].push(x)});
  var attendanceByWeek={},attendanceDates=Object.keys(attendanceByDate).sort(function(a,b){return b.localeCompare(a)}).slice(0,30);
  attendanceDates.forEach(function(date){var monday=new Date(date+'T00:00');monday.setDate(monday.getDate()-((monday.getDay()+6)%7));var week=iso(monday);if(!attendanceByWeek[week])attendanceByWeek[week]=[];attendanceByWeek[week].push(date)});
  var h=Object.keys(attendanceByWeek).sort(function(a,b){return b.localeCompare(a)}).map(function(week){var monday=new Date(week+'T00:00'),sunday=new Date(week+'T00:00');sunday.setDate(sunday.getDate()+6);var weekNumber=Math.floor((Date.UTC(monday.getFullYear(),monday.getMonth(),monday.getDate())-Date.UTC(2026,8,7))/604800000)+1,weekLabel=weekNumber>0?'Minggu '+weekNumber:'Sebelum semester';return '<section class="attendance-week"><h3 class="attendance-week-title"><span class="attendance-week-number">'+weekLabel+'</span><span class="attendance-week-range">'+fmt(week)+' – '+fmt(iso(sunday))+'</span></h3>'+attendanceByWeek[week].map(function(date){var day=new Date(date+'T00:00'),weekday=DAYS[(day.getDay()+6)%7];return '<div class="attendance-day"><h4 class="attendance-date">'+weekday+', '+fmt(date)+'</h4>'+attendanceByDate[date].map(function(x){return '<div class="item"><div class="grow"><b>'+cn(x.cid)+'</b></div><span class="tag '+(x.st==='Tidak ada'?'no-class':x.st)+'">'+x.st+'</span>'+acts('att',x.id)+'</div>'}).join('')+'</div>'}).join('')+'</section>'}).join('')||'<div class="empty">Belum ada catatan.</div>';
  return modal+'<div class="card"><div class="list-heading"><h2>Rekap</h2><button class="btn" onclick="addNew(\'att\')">＋ Catat kehadiran</button></div>'+rec+'</div><div class="card"><h2>Riwayat terbaru</h2>'+h+'</div>';
},
tasks:function(){
  if(!S.courses.length)return needCourse();
  var e=cur('tasks');
  var f='<div class="row"><input id="tT" placeholder="Judul tugas" value="'+(e?esc(e.title):'')+'"><select id="tC">'+opts(e&&e.cid)+'</select><input id="tD" type="date" value="'+(e?e.due:todayISO)+'"></div>'+btns(e,'addTask','Tambah');
  var modal=ed.k==='tasks'?modalDialog(e?'Edit tugas':'Tambah tugas',f):'';
  var l=S.tasks.slice().sort(function(a,b){return (a.done-b.done)||a.due.localeCompare(b.due)});
  return modal+'<div class="card"><div class="list-heading"><h2>Daftar tugas ('+S.tasks.filter(function(x){return !x.done}).length+' belum selesai)</h2><button class="btn" onclick="addNew(\'tasks\')">＋ Tambah</button></div>'+(l.length?l.map(function(x){return '<div class="item '+(x.done?'done':'')+'"><input type="checkbox" style="flex:none;width:18px;height:18px" '+(x.done?'checked':'')+' onchange="toggle(\''+x.id+'\')"><div class="grow t"><b class="t">'+esc(x.title)+'</b><div class="mu">'+cn(x.cid)+'</div></div><span class="'+(!x.done&&x.due<todayISO?'late':'mu')+'">'+fmt(x.due)+'</span>'+acts('tasks',x.id)+'</div>'}).join(''):'<div class="empty">Belum ada tugas.</div>')+'</div>';
}};

function saveCourse(){
  var n=v('cName');if(!n)return;
  var e=cur('courses');
  if(e){e.name=n;e.lec=v('cLec');e.sks=v('cSks')}
  else{e={id:uid(),name:n,lec:v('cLec'),sks:v('cSks')};S.courses.push(e)}
  S.schedule=S.schedule.filter(function(x){return x.cid!==e.id});
  [1,2].forEach(function(i){var day=v('cDay'+i);if(day!=='')S.schedule.push({id:uid(),cid:e.id,day:+day,s:v('cS'+i)||'08:00',e:v('cE'+i)||'09:40',room:v('cR'+i)})});
  ed={k:null,id:null};save();render();
}
function addAtt(){var cid=v('aC');if(!cid)return;var e=cur('att');if(e){e.cid=cid;e.st=v('aS')}else S.att.push({id:uid(),cid:cid,date:todayISO,st:v('aS')});ed={k:null,id:null};save();render()}
function saveAttendanceDay(){document.querySelectorAll('.attendance-status').forEach(function(select){if(!select.value)return;var record=S.att.find(function(x){return x.cid===select.dataset.attCid&&x.date===todayISO});if(record)record.st=select.value;else S.att.push({id:uid(),cid:select.dataset.attCid,date:todayISO,st:select.value})});ed={k:null,id:null};save();render()}
function addTask(){var t=v('tT');if(!t||!v('tD'))return;var e=cur('tasks');if(e){e.title=t;e.cid=v('tC');e.due=v('tD')}else S.tasks.push({id:uid(),cid:v('tC'),title:t,due:v('tD'),done:false});ed={k:null,id:null};save();render()}
function toggle(id){var t=S.tasks.find(function(x){return x.id===id});t.done=!t.done;save();render()}
startApp();
