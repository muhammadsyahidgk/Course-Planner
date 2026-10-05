(function(){
  var PROGRAMS=[{id:'ti-pagi',name:'Teknik Informatika Pagi'}];
  var state={status:'idle',accountId:null,membership:null,entries:[],participants:[],participantsLoaded:false,participantsLoading:false,error:'',channel:null,editor:null};
  var baseRender=window.render;
  var baseRenderAuth=window.renderAuth;

  window.TABS.participants='Peserta';
  window.TABS.schedule='Jadwal Prodi';
  window.TABS.tasks='Tugas Prodi';

  function currentProgram(){
    return PROGRAMS.find(function(program){return state.membership&&program.id===state.membership.program_id})||null;
  }

  function programError(message){
    state.error=message;
    console.error(message);
    render();
  }

  function refreshProfileSelect(){
    var select=document.getElementById('programSelect');
    if(!select)return;
    var guest=!!(window.account&&window.account.is_anonymous);
    select.disabled=guest||state.status==='loading'||!!(state.membership&&state.membership.role==='admin');
    if(guest){
      select.innerHTML='<option value="">Masuk dengan akun untuk memilih prodi</option>';
      return;
    }
    if(state.error&&state.status==='error'){
      select.innerHTML='<option value="">Program studi tidak tersedia</option>';
      return;
    }
    select.innerHTML='<option value="">— Pilih program studi —</option>'+PROGRAMS.map(function(program){
      return '<option value="'+program.id+'"'+(state.membership&&state.membership.program_id===program.id?' selected':'')+'>'+program.name+'</option>';
    }).join('');
    select.value=state.membership?state.membership.program_id:'';
  }

  function clearRealtime(){
    if(state.channel&&window.supabaseClient){
      window.supabaseClient.removeChannel(state.channel);
      state.channel=null;
    }
  }

  async function fetchEntries(){
    var program=currentProgram();
    if(!program||!window.supabaseClient)return;
    var result=await window.supabaseClient.from('program_content')
      .select('id,kind,data,updated_at')
      .eq('program_id',program.id);
    if(result.error)throw result.error;
    state.entries=result.data||[];
    state.error='';
  }

  function watchProgram(program){
    clearRealtime();
    state.channel=window.supabaseClient.channel('program-content-'+program.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'program_content',filter:'program_id=eq.'+program.id},function(){
        fetchEntries().then(function(){render()}).catch(function(error){programError('Gagal memuat pembaruan data prodi: '+error.message)});
      }).subscribe(function(status,error){
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')programError('Sinkronisasi realtime gagal: '+(error&&error.message||status));
      });
  }

  async function loadCurrentProgram(){
    var user=window.account;
    if(!user||user.is_anonymous||!window.supabaseClient)return;
    var userId=user.id;
    state.accountId=userId;
    state.status='loading';
    state.error='';
    state.membership=null;
    state.entries=[];
    state.participants=[];
    state.participantsLoaded=false;
    state.participantsLoading=false;
    clearRealtime();
    render();
    try{
      var memberResult=await window.supabaseClient.from('program_members')
        .select('program_id,display_name,role')
        .eq('user_id',userId)
        .maybeSingle();
      if(memberResult.error)throw memberResult.error;
      if(!window.account||window.account.id!==userId)return;
      state.membership=memberResult.data;
      if(state.membership){
        await fetchEntries();
        watchProgram(currentProgram());
      }
      state.status='ready';
      window.badge('☁️ Prodi tersinkron');
      render();
    }catch(error){
      if(!window.account||window.account.id!==userId)return;
      state.status='error';
      state.error='Data prodi gagal dimuat. Pastikan skema dan kebijakan Supabase sudah dipasang.';
      console.error('Gagal memuat data program studi.',error);
      render();
    }
  }

  window.selectProgram=async function(programId){
    if(!window.account||window.account.is_anonymous||!window.supabaseClient)return;
    if(state.membership&&state.membership.role==='admin')return;
    var program=PROGRAMS.find(function(item){return item.id===programId});
    if(!program){refreshProfileSelect();return}
    state.status='loading';
    state.error='';
    state.accountId=window.account.id;
    state.membership=null;
    render();
    var user=window.account;
    var displayName=user.user_metadata&&user.user_metadata.full_name||user.email||'Peserta';
    try{
      var result=await window.supabaseClient.from('program_members').upsert({
        user_id:user.id,
        program_id:program.id,
        display_name:displayName,
        role:'member'
      },{onConflict:'user_id'});
      if(result.error)throw result.error;
    }catch(error){
      state.status='error';
      state.error='Pilihan prodi gagal disimpan. Coba lagi atau hubungi administrator.';
      console.error('Gagal menyimpan pilihan program studi.',error);
      render();
      refreshProfileSelect();
      return;
    }
    try{
      await loadCurrentProgram();
    }catch(error){
      state.status='error';
      state.error='Data prodi gagal dimuat. Coba muat ulang halaman.';
      console.error('Gagal memuat pilihan program studi.',error);
      render();
    }
  };

  function programNotice(){
    if(state.status==='loading')return '<div class="program-notice">Memuat data program studi...</div>';
    if(state.error)return '<div class="program-notice">'+window.esc(state.error)+'</div>';
    if(state.status==='error')return '<div class="program-notice">Program studi tidak dapat dimuat.</div>';
    if(!state.membership)return '<div class="program-notice">Pilih program studi melalui menu profil untuk melihat jadwal, tugas, dan peserta.</div>';
    return '';
  }

  function kindEntries(kind){
    return state.entries.filter(function(entry){return entry.kind===kind});
  }

  function actions(kind,entry){
    if(!state.membership||state.membership.role!=='admin')return '';
    return '<div class="program-actions"><button class="btn secondary" type="button" onclick="editProgramItem(\''+kind+'\',\''+window.esc(entry.id)+'\')">Edit</button><button class="btn secondary" type="button" onclick="deleteProgramItem(\''+kind+'\',\''+window.esc(entry.id)+'\')">Hapus</button></div>';
  }

  function renderSchedule(){
    var notice=programNotice(),entries=kindEntries('schedule').slice().sort(function(a,b){
      return (+a.data.day||0)-(+b.data.day||0)||String(a.data.start||'').localeCompare(String(b.data.start||''));
    });
    var rows=entries.map(function(entry){
      var item=entry.data||{};
      var day=window.DAYS[+item.day]||'—';
      return '<tr><td>'+day+'</td><td>'+window.esc(item.course||'—')+'</td><td>'+window.esc(item.start||'—')+'–'+window.esc(item.end||'—')+'</td><td>'+window.esc(item.room||'—')+'</td><td>'+window.esc(item.lecturer||'—')+'</td><td>'+actions('schedule',entry)+'</td></tr>';
    });
    var add=state.membership&&state.membership.role==='admin'?'<button class="btn" type="button" onclick="editProgramItem(\'schedule\')">＋ Tambah jadwal</button>':'';
    return notice+'<div class="card"><div class="list-heading"><h2>Jadwal '+(currentProgram()?window.esc(currentProgram().name):'prodi')+'</h2>'+add+'</div>'+window.dataTable(['Hari','Mata kuliah','Waktu','Ruang','Dosen','Aksi'],rows,'Belum ada jadwal untuk program studi ini.')+'</div>';
  }

  function renderTasks(){
    var notice=programNotice(),entries=kindEntries('task').slice().sort(function(a,b){return String(a.data.due||'').localeCompare(String(b.data.due||''))});
    var rows=entries.map(function(entry){
      var item=entry.data||{};
      return '<tr><td>'+window.esc(item.title||'—')+'</td><td>'+window.esc(item.course||'—')+'</td><td class="task-description">'+window.esc(item.description||'—')+'</td><td>'+window.esc(item.due||'—')+'</td><td>'+actions('task',entry)+'</td></tr>';
    });
    var add=state.membership&&state.membership.role==='admin'?'<button class="btn" type="button" onclick="editProgramItem(\'task\')">＋ Tambah tugas</button>':'';
    return notice+'<div class="card"><div class="list-heading"><h2>Tugas '+(currentProgram()?window.esc(currentProgram().name):'prodi')+'</h2>'+add+'</div>'+window.dataTable(['Tugas','Mata kuliah','Keterangan','Tenggat','Aksi'],rows,'Belum ada tugas untuk program studi ini.','task-table')+'</div>';
  }

  async function loadParticipants(){
    var program=currentProgram();
    if(!program||!window.supabaseClient)return;
    var result=await window.supabaseClient.from('program_members')
      .select('display_name,role')
      .eq('program_id',program.id)
      .order('display_name');
    if(result.error)throw result.error;
    state.participants=result.data||[];
    state.participantsLoaded=true;
  }

  function renderParticipants(){
    var notice=programNotice();
    if(state.membership&&!state.participantsLoaded&&!state.participantsLoading){
      state.participantsLoading=true;
      loadParticipants().then(function(){state.participantsLoading=false;render()}).catch(function(error){
        state.participantsLoading=false;
        state.participantsLoaded=true;
        programError('Daftar peserta gagal dimuat: '+error.message);
      });
    }
    var rows=state.participants.map(function(person){
      return '<tr><td>'+window.esc(person.display_name||'Peserta')+'</td><td>'+(person.role==='admin'?'Administrator prodi':'Peserta')+'</td></tr>';
    });
    var refresh=state.membership?'<button class="btn secondary" type="button" onclick="refreshProgramParticipants()">Muat ulang</button>':'';
    return notice+'<div class="card"><div class="list-heading"><h2>Peserta '+(currentProgram()?window.esc(currentProgram().name):'prodi')+'</h2>'+refresh+'</div>'+window.dataTable(['Nama','Peran'],rows,state.membership?'Belum ada peserta.':'Pilih prodi untuk melihat pesertanya.')+'</div>';
  }

  function renderDashboard(){
    if(!state.membership)return '<div class="card"><h2>Ruang belajar prodi</h2>'+programNotice()+'</div>';
    var personalCourses=window.S.courses||[];
    var attendance='<div class="card"><h2>Kehadiran pribadi</h2>'+(personalCourses.length?personalCourses.map(function(course){
      var percentage=window.pct(course.id);
      return '<div style="margin-bottom:8px"><div class="mu">'+window.esc(course.name)+' — '+(percentage===null?'belum ada data':percentage+'%')+'</div><div class="bar"><i style="width:'+(percentage||0)+'%"></i></div></div>';
    }).join(''):'<div class="empty">Belum ada mata kuliah.</div>')+'</div>';
    var upcoming=kindEntries('schedule').slice().sort(function(a,b){
      var da=(+a.data.day-window.todayIdx+7)%7,db=(+b.data.day-window.todayIdx+7)%7;
      if(da===0&&String(a.data.start||'')<new Date().toTimeString().slice(0,5))da=7;
      if(db===0&&String(b.data.start||'')<new Date().toTimeString().slice(0,5))db=7;
      return da-db||String(a.data.start||'').localeCompare(String(b.data.start||''));
    }).slice(0,3);
    var tasks=kindEntries('task').slice().sort(function(a,b){return String(a.data.due||'').localeCompare(String(b.data.due||''))}).slice(0,5);
    return '<div class="grid"><div class="card"><h2>Jadwal prodi terdekat</h2>'+(upcoming.length?upcoming.map(function(entry){var item=entry.data||{};return '<div class="item"><div class="grow"><b>'+window.esc(item.course||'Mata kuliah')+'</b><div class="mu">'+(window.DAYS[+item.day]||'')+' · '+window.esc(item.start||'')+'–'+window.esc(item.end||'')+(item.room?' · '+window.esc(item.room):'')+'</div></div></div>'}).join(''):'<div class="empty">Belum ada jadwal prodi.</div>')+'</div><div class="card"><h2>Tugas prodi</h2>'+(tasks.length?tasks.map(function(entry){var item=entry.data||{};return '<div class="item"><div class="grow"><b>'+window.esc(item.title||'Tugas')+'</b><div class="mu">'+window.esc(item.course||'')+'</div></div><span class="mu">'+window.esc(item.due||'')+'</span></div>'}).join(''):'<div class="empty">Belum ada tugas prodi.</div>')+'</div>'+attendance+'</div>';
  }

  window.VIEWS.schedule=renderSchedule;
  window.VIEWS.tasks=renderTasks;
  window.VIEWS.participants=renderParticipants;
  window.VIEWS.dash=renderDashboard;

  window.refreshProgramParticipants=function(){
    state.participantsLoaded=false;
    state.participantsLoading=false;
    state.error='';
    render();
  };

  window.editProgramItem=function(kind,id){
    if(!state.membership||state.membership.role!=='admin')return;
    var existing=id&&state.entries.find(function(entry){return entry.id===id&&entry.kind===kind});
    if(id&&!existing)return;
    state.editor={kind:kind,id:id||null,data:existing?existing.data:{}};
    var data=state.editor.data,form;
    if(kind==='schedule'){
      form='<label for="programCourse">Mata kuliah</label><input id="programCourse" required value="'+window.esc(data.course||'')+'"><div class="row"><select id="programDay" aria-label="Hari" required>'+window.DAYS.map(function(day,index){return '<option value="'+index+'"'+(+data.day===index?' selected':'')+'>'+day+'</option>'}).join('')+'</select><input id="programStart" type="time" aria-label="Waktu mulai" required value="'+window.esc(data.start||'08:00')+'"><input id="programEnd" type="time" aria-label="Waktu selesai" required value="'+window.esc(data.end||'09:40')+'"></div><div class="row"><input id="programRoom" placeholder="Ruang" value="'+window.esc(data.room||'')+'"><input id="programLecturer" placeholder="Dosen" value="'+window.esc(data.lecturer||'')+'"></div>';
    }else{
      form='<label for="programTitle">Judul tugas</label><input id="programTitle" required value="'+window.esc(data.title||'')+'"><div class="row"><input id="programTaskCourse" placeholder="Mata kuliah" value="'+window.esc(data.course||'')+'"><input id="programDue" type="date" aria-label="Tenggat" required value="'+window.esc(data.due||'')+'"></div><label for="programDescription">Keterangan / detail tugas</label><textarea id="programDescription" placeholder="Tambahkan detail tugas">'+window.esc(data.description||'')+'</textarea>';
    }
    var layer=document.getElementById('settingsLayer');
    layer.innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)closeProgramEditor()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="programEditorTitle"><div class="modal-head"><h2 id="programEditorTitle">'+(existing?'Edit':'Tambah')+(kind==='schedule'?' jadwal':' tugas')+'</h2><button class="x" type="button" aria-label="Tutup" onclick="closeProgramEditor()">✕</button></div><form onsubmit="saveProgramItem(event)">'+form+'<div class="delete-actions"><button class="btn secondary" type="button" onclick="closeProgramEditor()">Batal</button><button class="btn" type="submit">Simpan</button></div></form></section></div>';
    layer.hidden=false;
  };

  window.closeProgramEditor=function(){
    state.editor=null;
    var layer=document.getElementById('settingsLayer');
    if(layer){layer.hidden=true;layer.innerHTML=''}
  };

  window.saveProgramItem=async function(event){
    event.preventDefault();
    if(!state.editor||!state.membership||state.membership.role!=='admin')return;
    var kind=state.editor.kind,data;
    if(kind==='schedule'){
      data={course:window.v('programCourse'),day:+window.v('programDay'),start:window.v('programStart'),end:window.v('programEnd'),room:window.v('programRoom'),lecturer:window.v('programLecturer')};
      if(!data.course||!data.start||!data.end||data.end<=data.start)return;
    }else{
      data={title:window.v('programTitle'),course:window.v('programTaskCourse'),due:window.v('programDue'),description:window.v('programDescription')};
      if(!data.title||!data.due)return;
    }
    try{
      var result=await window.supabaseClient.from('program_content').upsert({
        id:state.editor.id||window.uid(),
        program_id:state.membership.program_id,
        kind:kind,
        data:data,
        updated_at:new Date().toISOString()
      },{onConflict:'id'});
      if(result.error)throw result.error;
      window.closeProgramEditor();
      await fetchEntries();
      state.error='';
      window.badge('☁️ Perubahan prodi tersinkron');
      render();
    }catch(error){
      state.error='Perubahan gagal disimpan. Pastikan akun memiliki peran administrator prodi.';
      console.error('Gagal menyimpan jadwal atau tugas prodi.',error);
      window.closeProgramEditor();
      render();
    }
  };

  window.deleteProgramItem=async function(kind,id){
    if(!state.membership||state.membership.role!=='admin')return;
    if(!window.confirm('Hapus '+(kind==='schedule'?'jadwal':'tugas')+' ini untuk seluruh peserta prodi?'))return;
    try{
      var result=await window.supabaseClient.from('program_content').delete()
        .eq('id',id).eq('program_id',state.membership.program_id);
      if(result.error)throw result.error;
      await fetchEntries();
      state.error='';
      window.badge('☁️ Perubahan prodi tersinkron');
      render();
    }catch(error){
      state.error='Data gagal dihapus. Pastikan akun memiliki peran administrator prodi.';
      console.error('Gagal menghapus data prodi.',error);
      render();
    }
  };

  window.render=function(){
    if(!window.account){
      state.status='idle';
      state.membership=null;
      clearRealtime();
      baseRender();
      return;
    }
    if(window.account.is_anonymous){
      state.status='ready';
      state.membership=null;
      clearRealtime();
      baseRender();
      refreshProfileSelect();
      return;
    }
    if(state.accountId!==window.account.id||state.status==='idle'){
      loadCurrentProgram();
      return;
    }
    if(state.status==='loading'){
      document.getElementById('view').innerHTML='<div class="card"><p class="empty">Memuat program studi...</p></div>';
      window.updateProfile();
      refreshProfileSelect();
      return;
    }
    baseRender();
    refreshProfileSelect();
  };

  window.renderAuth=function(message){
    clearRealtime();
    state.status='idle';
    state.accountId=null;
    state.membership=null;
    state.entries=[];
    state.participants=[];
    state.participantsLoaded=false;
    state.participantsLoading=false;
    return baseRenderAuth(message);
  };

  if(!window.account&&!window.supabaseClient)baseRender();
})();
