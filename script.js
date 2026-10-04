var SUPABASE_URL='https://kuxpcqclmekqfrhnfryr.supabase.co';
var SUPABASE_ANON_KEY='sb_publishable_BOgAPc5LgP5-knHVjoEhFA_jOaheyX3';
var DAYS=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'],KEY='kuliah-planner-v1',tab='dash';
var COURSE_NAMES=['MKP Kecerdasan Komputasional','MKP Pengenalan Pola','MKP Sistem Temu Kembali Informasi','MKP Jaringan Multimedia','Human Computer Interaction','Pemrograman Berbasis Platform','Cloud Computing','Pengolahan Citra Digital','Machine Learning','Kompleksitas Algoritma','Statistik','Aljabar Dan Matriks','Pemrograman Berorientasi Obyek','Rekayasa Perangkat Lunak','Organisasi Dan Arsitektur Komputer','Kalkulus','Pengenalan Pemrograman','Etika Profesi','Basis Data'];
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
function syncProfileBar(){
  var profile=document.getElementById('profileArea'),brandInner=document.querySelector('.brandbar-inner'),topbar=document.getElementById('topbar'),navInner=document.getElementById('topbarInner');if(!profile||!brandInner||!topbar||!navInner)return;
  var stickyTop=parseFloat(getComputedStyle(topbar).top)||0,moveToNav=!!account&&!topbar.hidden&&topbar.getBoundingClientRect().top<=stickyTop+1,target=moveToNav?navInner:brandInner;
  if(profile.parentElement===target)return;
  if(profile._barAnimation)profile._barAnimation.cancel();
  var start=profile.getBoundingClientRect();target.appendChild(profile);var end=profile.getBoundingClientRect();
  if(!profile.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var x=start.left-end.left,y=start.top-end.top;if(Math.abs(x)+Math.abs(y)<1)return;
  profile._barAnimation=profile.animate([{transform:'translate('+x+'px, '+y+'px)',opacity:.8},{transform:'translate(0, 0)',opacity:1}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
}
window.addEventListener('scroll',syncProfileBar,{passive:true});
window.addEventListener('resize',syncProfileBar);
function updateProfile(){var name=document.getElementById('profileName'),detail=document.getElementById('profileDetail'),topbar=document.getElementById('topbar'),profileArea=document.getElementById('profileArea'),avatar=document.querySelector('.avatar'),guest=!!(account&&account.is_anonymous);if(topbar)topbar.hidden=!account;if(profileArea)profileArea.hidden=!account;syncProfileBar();if(name)name.textContent=guest?'Pengguna tamu':account&&account.email?account.email:'Pengguna lokal';if(detail)detail.textContent=guest?'Akses sementara':account?'Akun tersinkron':'Mode penyimpanan lokal';if(avatar)avatar.textContent=guest?'T':account&&account.email?account.email.charAt(0).toUpperCase():'P';syncThemeButtons()}
function toggleProfileMenu(){var menu=document.getElementById('profileMenu'),button=document.getElementById('profileBtn'),open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',open?'true':'false');if(open)updateProfile()}
function closeProfileMenu(){var menu=document.getElementById('profileMenu'),button=document.getElementById('profileBtn');if(menu&&!menu.hidden){menu.hidden=true;button.setAttribute('aria-expanded','false')}}
function openSettings(){closeProfileMenu();var layer=document.getElementById('settingsLayer');layer.innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)closeSettings()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"><div class="modal-head"><h2 id="settingsTitle">Pengaturan</h2><button class="x" type="button" aria-label="Tutup pengaturan" onclick="closeSettings()">✕</button></div><div class="settings-section"><h3>Tampilan</h3><p class="theme-label">Pilih mode warna</p><div class="theme-options" aria-label="Mode tampilan"><button type="button" data-theme-choice="light" onclick="setTheme(\'light\')">Terang</button><button type="button" data-theme-choice="dark" onclick="setTheme(\'dark\')">Gelap</button><button type="button" data-theme-choice="system" onclick="setTheme(\'system\')">Sistem</button></div></div><div class="settings-section"><h3>Penyimpanan</h3><p>'+(account?'Data tersimpan dan disinkronkan dengan akun.':'Data tersimpan di browser ini.')+'</p></div></section></div>';layer.hidden=false;syncThemeButtons()}
function closeSettings(){var layer=document.getElementById('settingsLayer');if(layer){layer.hidden=true;layer.innerHTML=''}}
document.addEventListener('click',function(event){if(!event.target.closest('.profile-area'))closeProfileMenu();if(!event.target.closest('#nav'))closeNavMenu()});
function renderAuth(message){
  document.getElementById('nav').innerHTML='';
  updateProfile();
  document.getElementById('view').innerHTML='<div class="card auth"><h2>Masuk</h2><p>Gunakan akun yang diberikan oleh administrator perencana kuliah.</p><form onsubmit="submitAuth(event)"><label for="authEmail">Alamat surel</label><input id="authEmail" type="email" autocomplete="email" required><label for="authPassword">Kata sandi</label><input id="authPassword" type="password" autocomplete="current-password" minlength="6" required><p class="auth-error">'+(message?esc(message):'')+'</p><button class="btn" type="submit" '+(authBusy?'disabled':'')+'>'+(authBusy?'Mohon tunggu...':'Masuk')+'</button></form><button class="btn secondary auth-guest" type="button" onclick="submitGuest()" '+(authBusy?'disabled':'')+'>'+(authBusy?'Mohon tunggu...':'Lanjutkan sebagai tamu')+'</button></div>';
}
function submitAuth(event){
  event.preventDefault();if(!supabaseClient)return;
  var email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value;
  authBusy=true;renderAuth();
  supabaseClient.auth.signInWithPassword({email:email,password:password}).then(function(result){if(result.error)throw result.error;authBusy=false;}).catch(function(error){authBusy=false;renderAuth(authError(error))});
}
function authError(e){var m=(e&&e.message)||'';if(/invalid login|invalid.*credentials/i.test(m))return 'Alamat surel atau kata sandi salah.';if(/email not confirmed/i.test(m))return 'Alamat surel belum dikonfirmasi.';if(/anonymous|anonymous_provider_disabled/i.test(m))return 'Mode tamu belum diaktifkan di pengaturan autentikasi Supabase.';if(/rate limit|too many/i.test(m))return 'Terlalu banyak percobaan. Coba lagi nanti.';if(/network|fetch/i.test(m))return 'Tidak ada koneksi internet.';if(/signup|sign.?up|not allowed/i.test(m))return 'Pendaftaran akun tidak diizinkan. Hubungi administrator.';return 'Terjadi kesalahan saat masuk. Silakan coba lagi.'}
function submitGuest(){
  if(!supabaseClient||authBusy)return;
  authBusy=true;renderAuth();
  supabaseClient.auth.signInAnonymously().then(function(result){if(result.error)throw result.error;authBusy=false;useSession(result.data.session)}).catch(function(error){authBusy=false;renderAuth(authError(error))});
}
function signOut(){closeProfileMenu();if(supabaseClient)supabaseClient.auth.signOut()}
function useSession(session){
  var next=session&&session.user;
  if(!next){account=null;storageKey=KEY;badge('🔒 Perlu masuk');renderAuth();return}
  if(account&&account.id===next.id)return;
  account=next;storageKey=KEY+'-user-'+account.id;
  var local=null,legacy=null;
  try{local=JSON.parse(localStorage.getItem(storageKey)||'null');if(!local&&!localStorage.getItem('kuliah-planner-legacy-imported'))legacy=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
  legacyImportPending=!!legacy;
  S=Object.assign({courses:[],schedule:[],att:[],tasks:[]},local||legacy||{});
  badge('☁️ Memuat...');
  supabaseClient.from('planner_state').select('data').eq('user_id',account.id).maybeSingle().then(function(result){
    if(!account||account.id!==next.id)return;
    if(result.error)throw result.error;
    var pushLocal=false;
    if(result.data&&result.data.data){var remote=Object.assign({courses:[],schedule:[],att:[],tasks:[]},result.data.data);if((+remote.rev||0)>(+S.rev||0))S=remote;else if((+S.rev||0)>(+remote.rev||0))pushLocal=true;}
    if(backfillAttendance())save();
    try{localStorage.setItem(storageKey,JSON.stringify(S))}catch(e){}
    render();if(result.data&&!pushLocal)badge('☁️ Tersinkron');if(!result.data||pushLocal)push();
  }).catch(function(error){badge('⚠️ Database tidak tersedia');render();console.error(error)});
}
function startApp(){
  var configured=SUPABASE_URL.indexOf('YOUR_')<0&&SUPABASE_ANON_KEY.indexOf('YOUR_')<0;
  if(configured&&window.supabase&&window.supabase.createClient){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    supabaseClient.auth.onAuthStateChange(function(event,session){setTimeout(function(){useSession(session)},0)});
    supabaseClient.auth.getSession().then(function(result){if(result.error)throw result.error;useSession(result.data.session)}).catch(function(){renderAuth('Tidak dapat terhubung ke server.')});
    badge('🔒 Perlu masuk');renderAuth();return;
  }
  if(backfillAttendance())save();
  badge('📱 Lokal · Supabase belum dikonfigurasi');render();
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
function v(id){return document.getElementById(id).value.trim()}
function cn(id){var c=S.courses.find(function(x){return x.id===id});return c?esc(c.name):'(dihapus)'}
function iso(d){var z=new Date(d.getTime()-d.getTimezoneOffset()*6e4);return z.toISOString().slice(0,10)}
function backfillAttendance(){
  if(S.backfilled)return false;
  S.backfilled=true;
  if(S.att.length)return true;
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
function courseNameOptions(current){var names=COURSE_NAMES.filter(function(name){return !S.courses.some(function(course){return course.name===name&&(!current||course.id!==current.id)})||current&&current.name===name}),options=names.map(function(name){return '<option value="'+esc(name)+'"'+(current&&current.name===name?' selected':'')+'>'+esc(name)+'</option>'});if(current&&COURSE_NAMES.indexOf(current.name)<0)options.unshift('<option value="'+esc(current.name)+'" selected>'+esc(current.name)+' (data lama)</option>');return '<option value="" disabled'+(current?'':' selected')+'>— pilih mata kuliah —</option>'+options.join('')}
var todayIdx=(new Date().getDay()+6)%7,todayISO=iso(new Date());
document.getElementById('today').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

var TABS={dash:'Beranda',schedule:'Jadwal',tasks:'Tugas',att:'Absensi',courses:'Mata Kuliah'};
var ed={k:null,id:null};
function toggleNavMenu(){var nav=document.getElementById('nav'),button=document.getElementById('navToggle'),open=nav.classList.toggle('menu-open');button.setAttribute('aria-expanded',open?'true':'false');button.setAttribute('aria-label',open?'Tutup menu navigasi':'Buka menu navigasi')}
function closeNavMenu(){var nav=document.getElementById('nav'),button=document.getElementById('navToggle');if(nav)nav.classList.remove('menu-open');if(button){button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Buka menu navigasi')}}
function go(t){closeNavMenu();tab=t;ed={k:null,id:null};render()}
function edit(k,id){ed={k:k,id:id};render()}
function addNew(k){ed={k:k,id:null};render()}
function cancel(){ed={k:null,id:null};render()}
function modalDialog(title,content){return '<div class="modal-backdrop" onclick="if(event.target===this)cancel()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><h2 id="modalTitle">'+title+'</h2><button class="x" type="button" aria-label="Tutup" onclick="cancel()">✕</button></div>'+content+'</section></div>'}
document.addEventListener('keydown',function(event){if(event.key==='Escape'){if(ed.k==='courses'||ed.k==='tasks'||ed.k==='att')cancel();closeNavMenu();closeProfileMenu();closeSettings()}});
function cur(k){return ed.k===k?S[k].find(function(x){return x.id===ed.id}):null}
function render(){
  document.getElementById('nav').innerHTML='<button id="navToggle" class="nav-toggle" type="button" aria-label="Buka menu navigasi" aria-expanded="false" aria-controls="navLinks" onclick="toggleNavMenu()"><span></span><span></span><span></span></button><div id="navLinks" class="nav-links">'+Object.keys(TABS).map(function(k){return '<button class="'+(k===tab?'on':'')+'" aria-current="'+(k===tab?'page':'false')+'" onclick="go(\''+k+'\')">'+TABS[k]+'</button>'}).join('')+'</div>';
  document.getElementById('view').innerHTML=VIEWS[tab]();
  updateProfile();
}
function needCourse(){var isTasks=tab==='tasks';return S.courses.length?'':'<div class="card"><h2>'+(isTasks?'Daftar tugas':'Kehadiran')+'</h2>'+dataTable(isTasks?['Selesai','Tugas','Mata kuliah','Keterangan','Tenggat','Aksi']:['Mata kuliah','Pertemuan','Kehadiran'],[],'Tambahkan mata kuliah dulu di tab “Mata Kuliah”.',isTasks?'task-table':'')+'</div>'}
function del(key,id){if(!confirm('Hapus data ini?'))return;S[key]=S[key].filter(function(x){return x.id!==id});if(key==='courses'){['schedule','att','tasks'].forEach(function(k){S[k]=S[k].filter(function(x){return x.cid!==id})})}if(ed.id===id)ed={k:null,id:null};save();render()}
function pct(cid){var a=S.att.filter(function(x){return x.cid===cid&&x.st!=='Tidak ada'});if(!a.length)return null;return Math.round(a.filter(function(x){return x.st==='Hadir'}).length/a.length*100)}
function acts(k,id){return '<button class="x" style="color:var(--pr)" title="Edit" onclick="edit(\''+k+'\',\''+id+'\')">✎</button><button class="x" title="Hapus" onclick="del(\''+k+'\',\''+id+'\')">✕</button>'}
function btns(e,fn,label){return '<button class="btn" onclick="'+fn+'()">'+(e?'Simpan perubahan':label)+'</button>'+(e?' <button class="btn" style="background:var(--mu)" onclick="cancel()">Batal</button>':'')}
function dataTable(headers,rows,empty,className){return '<div class="table-wrap"><table class="data-table '+(className||'')+'"><thead><tr>'+headers.map(function(header){return '<th>'+header+'</th>'}).join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td class="table-empty" colspan="'+headers.length+'">'+empty+'</td></tr>')+'</tbody></table></div>'}
function scheds(cid){return S.schedule.filter(function(x){return x.cid===cid}).sort(function(a,b){return a.day-b.day||a.s.localeCompare(b.s)})}
function attendanceCourses(date,selected){var weekday=(new Date(date+'T00:00').getDay()+6)%7,courses=S.courses.filter(function(c){return S.schedule.some(function(x){return x.cid===c.id&&x.day===weekday})});if(selected&&!courses.some(function(c){return c.id===selected})){var current=S.courses.find(function(c){return c.id===selected});if(current)courses.push(current)}return courses}
function attendanceOpts(date,selected){return attendanceCourses(date,selected).map(function(c){return '<option value="'+c.id+'"'+(c.id===selected?' selected':'')+'>'+esc(c.name)+'</option>'}).join('')}
function attendanceStatusOptions(selected){return '<option value="">— pilih status —</option>'+['Hadir','Izin','Sakit','Alpha','Tidak ada'].map(function(status){return '<option value="'+status+'"'+(selected===status?' selected':'')+'>'+(status==='Alpha'?'Alpa':status)+'</option>'}).join('')}
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
  var f='<div class="row"><select id="cName" aria-label="Pilih mata kuliah" required onchange="this.setCustomValidity(\'\')">'+courseNameOptions(e)+'</select><input id="cLec" placeholder="Dosen" value="'+(e?esc(e.lec||''):'')+'"><input id="cSks" type="number" min="1" max="6" placeholder="SKS" value="'+(e?esc(e.sks||''):'')+'"></div>'+
  scheduleFields(0,'Waktu kelas 1')+'<div id="secondScheduleFields"'+(sc.length>1?'':' hidden')+'>'+scheduleFields(1,'Waktu kelas 2')+'</div>'+(sc.length>1?'':'<button id="addSecondSchedule" class="btn secondary" type="button" onclick="showSecondSchedule()">＋ Tambah waktu kelas ke-2</button>')+btns(e,'saveCourse','Tambah');
  var modal=ed.k==='courses'?modalDialog(e?'Edit mata kuliah':'Tambah mata kuliah',f):'';
  var rows=S.courses.map(function(c){var slots=scheds(c.id),schedule=slots.length?slots.map(function(slot){return DAYS[slot.day]+', '+esc(slot.s)+' – '+esc(slot.e)+(slot.room?' · '+esc(slot.room):'')}).join('<br>'):'Belum ada jadwal';return '<tr><td>'+esc(c.name)+'</td><td>'+esc(c.lec||'-')+'</td><td>'+esc(c.sks||'-')+'</td><td>'+schedule+'</td><td class="table-actions">'+acts('courses',c.id)+'</td></tr>'});
  return modal+'<div class="card"><div class="list-heading"><h2>Daftar ('+S.courses.length+' MK, '+S.courses.reduce(function(a,c){return a+(+c.sks||0)},0)+' SKS)</h2><button class="btn" onclick="addNew(\'courses\')">＋ Tambah</button></div>'+dataTable(['Mata kuliah','Dosen','SKS','Jadwal','Aksi'],rows,'Belum ada mata kuliah.')+'</div>';
},
schedule:function(){
  var rows=S.schedule.slice().sort(function(a,b){return a.day-b.day||a.s.localeCompare(b.s)}).map(function(x){var c=S.courses.find(function(y){return y.id===x.cid});return '<tr><td>'+DAYS[x.day]+(x.day===todayIdx?' <span class="tag">hari ini</span>':'')+'</td><td>'+cn(x.cid)+'</td><td>'+esc(x.s)+'–'+esc(x.e)+'</td><td>'+esc(x.room||'-')+'</td><td>'+esc(c&&c.lec||'-')+'</td></tr>'});
  return '<div class="card"><h2>Jadwal kuliah</h2>'+dataTable(['Hari','Mata kuliah','Waktu','Ruang','Dosen'],rows,'Belum ada jadwal.')+'</div>';
},
att:function(){
  if(!S.courses.length)return needCourse();
  var e=cur('att'),date=e?e.date:todayISO,choices=attendanceCourses(date,e&&e.cid);
  var dailyChoices=attendanceCourses(todayISO),dailyRows=dailyChoices.map(function(c){var meetings=S.schedule.filter(function(x){return x.cid===c.id&&x.day===todayIdx}).sort(function(a,b){return a.s.localeCompare(b.s)}),record=S.att.find(function(x){return x.cid===c.id&&x.date===todayISO}),times=meetings.map(function(x){return esc(x.s)+' – '+esc(x.e)+(x.room?' · '+esc(x.room):'')}).join(', ');return '<tr><td>'+esc(c.name)+'</td><td>'+times+'</td><td><select class="attendance-status" data-att-cid="'+esc(c.id)+'">'+attendanceStatusOptions(record&&record.st)+'</select></td></tr>'});
  var daily='<div class="mu" style="margin-bottom:8px">Tanggal otomatis: '+fmt(todayISO)+'</div>'+dataTable(['Mata kuliah','Waktu','Status'],dailyRows,'Tidak ada mata kuliah terjadwal hari ini.')+'<button class="btn" onclick="saveAttendanceDay()" '+(dailyChoices.length?'':'disabled')+'>Simpan kehadiran</button>';
  var f;
  if(e){
    var courseSelect=choices.length?'<select id="aC">'+attendanceOpts(date,e.cid)+'</select>':'<select id="aC" disabled><option value="">Mata kuliah tidak ditemukan</option></select>';
    f='<div class="mu" style="margin-bottom:8px">Tanggal: '+fmt(e.date)+'</div><div class="row">'+courseSelect+'<select id="aS">'+attendanceStatusOptions(e.st).replace('<option value="">— pilih status —</option>','')+'</select></div>'+btns(e,'addAtt','Simpan');
  }else{
    f=daily;
  }
  var modal=ed.k==='att'?modalDialog(e?'Edit kehadiran':'Catat kehadiran',f):'';
  var rec=S.courses.map(function(c){var a=S.att.filter(function(x){return x.cid===c.id&&x.st!=='Tidak ada'}),p=pct(c.id);return '<tr><td>'+esc(c.name)+'</td><td>'+a.length+'</td><td><span class="mu">'+(p===null?'-':p+'%')+'</span><div class="bar"><i style="width:'+(p||0)+'%"></i></div></td></tr>'});
  var attendanceByDate={};S.att.forEach(function(x){if(!attendanceByDate[x.date])attendanceByDate[x.date]=[];attendanceByDate[x.date].push(x)});
  var attendanceDates=Object.keys(attendanceByDate).sort(function(a,b){return b.localeCompare(a)}).slice(0,30),historyRows=[];
  attendanceDates.forEach(function(date){var day=new Date(date+'T00:00'),weekday=DAYS[(day.getDay()+6)%7];attendanceByDate[date].forEach(function(x){return historyRows.push('<tr><td>'+weekday+', '+fmt(date)+'</td><td>'+cn(x.cid)+'</td><td><span class="tag '+(x.st==='Tidak ada'?'no-class':x.st)+'">'+(x.st==='Alpha'?'Alpa':esc(x.st))+'</span></td><td class="table-actions">'+acts('att',x.id)+'</td></tr>')})});
  return modal+'<div class="card"><div class="list-heading"><h2>Rekap</h2><button class="btn" onclick="addNew(\'att\')">＋ Catat kehadiran</button></div>'+dataTable(['Mata kuliah','Pertemuan','Kehadiran'],rec,'Belum ada mata kuliah.')+'</div><div class="card"><h2>Riwayat terbaru</h2>'+dataTable(['Tanggal','Mata kuliah','Status','Aksi'],historyRows,'Belum ada catatan.')+'</div>';
},
tasks:function(){
  if(!S.courses.length)return needCourse();
  var e=cur('tasks');
  var f='<div class="row"><input id="tT" placeholder="Judul tugas" value="'+(e?esc(e.title):'')+'"><select id="tC">'+opts(e&&e.cid)+'</select><input id="tD" type="date" value="'+(e?e.due:todayISO)+'"></div><label for="tDesc">Keterangan / detail tugas</label><textarea id="tDesc" placeholder="Tambahkan detail tugas">'+(e?esc(e.description||''):'')+'</textarea>'+btns(e,'addTask','Tambah');
  var modal=ed.k==='tasks'?modalDialog(e?'Edit tugas':'Tambah tugas',f):'';
  var l=S.tasks.slice().sort(function(a,b){return (a.done-b.done)||a.due.localeCompare(b.due)});
  var rows=l.map(function(x){return '<tr class="'+(x.done?'done':'')+'"><td><input class="task-checkbox" type="checkbox" aria-label="Tandai selesai: '+esc(x.title)+'" '+(x.done?'checked':'')+' onchange="toggle(\''+x.id+'\')"></td><td><span class="task-title">'+esc(x.title)+'</span></td><td>'+cn(x.cid)+'</td><td class="task-description">'+esc(x.description||'-')+'</td><td class="'+(!x.done&&x.due<todayISO?'late':'mu')+'">'+fmt(x.due)+'</td><td class="table-actions">'+acts('tasks',x.id)+'</td></tr>'});
  return modal+'<div class="card"><div class="list-heading"><h2>Daftar tugas ('+S.tasks.filter(function(x){return !x.done}).length+' belum selesai)</h2><button class="btn" onclick="addNew(\'tasks\')">＋ Tambah</button></div>'+dataTable(['Selesai','Tugas','Mata kuliah','Keterangan','Tenggat','Aksi'],rows,'Belum ada tugas.','task-table')+'</div>';
}};

function saveCourse(){
  var input=document.getElementById('cName'),n=v('cName');if(!n)return;
  var e=cur('courses');
  if(COURSE_NAMES.indexOf(n)<0&&!(e&&e.name===n)){input.setCustomValidity('Pilih nama mata kuliah dari daftar yang tersedia.');input.reportValidity();return}
  if(!(e&&e.name===n)&&S.courses.some(function(course){return course.name===n})){input.setCustomValidity('Mata kuliah ini sudah ada di daftar.');input.reportValidity();return}
  if(e){e.name=n;e.lec=v('cLec');e.sks=v('cSks')}
  else{e={id:uid(),name:n,lec:v('cLec'),sks:v('cSks')};S.courses.push(e)}
  S.schedule=S.schedule.filter(function(x){return x.cid!==e.id});
  [1,2].forEach(function(i){var day=v('cDay'+i);if(day!=='')S.schedule.push({id:uid(),cid:e.id,day:+day,s:v('cS'+i)||'08:00',e:v('cE'+i)||'09:40',room:v('cR'+i)})});
  ed={k:null,id:null};save();render();
}
function addAtt(){var cid=v('aC');if(!cid)return;var e=cur('att');if(e){e.cid=cid;e.st=v('aS')}else S.att.push({id:uid(),cid:cid,date:todayISO,st:v('aS')});ed={k:null,id:null};save();render()}
function saveAttendanceDay(){document.querySelectorAll('.attendance-status').forEach(function(select){if(!select.value)return;var record=S.att.find(function(x){return x.cid===select.dataset.attCid&&x.date===todayISO});if(record)record.st=select.value;else S.att.push({id:uid(),cid:select.dataset.attCid,date:todayISO,st:select.value})});ed={k:null,id:null};save();render()}
function addTask(){var t=v('tT');if(!t||!v('tD'))return;var e=cur('tasks');if(e){e.title=t;e.cid=v('tC');e.due=v('tD');e.description=v('tDesc')}else S.tasks.push({id:uid(),cid:v('tC'),title:t,due:v('tD'),description:v('tDesc'),done:false});ed={k:null,id:null};save();render()}
function toggle(id){var t=S.tasks.find(function(x){return x.id===id});t.done=!t.done;save();render()}
startApp();
