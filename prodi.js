(function(){
  var PROGRAMS=[{id:'ti-pagi',name:'Teknik Informatika Pagi'}];
  var state={status:'idle',accountId:null,membership:null,pendingProgramId:'',entries:[],progress:{},participants:[],participantsLoaded:false,participantsLoading:false,importing:false,error:'',progressError:'',channel:null,editor:null};
  var baseRender=window.render;
  var baseRenderAuth=window.renderAuth;
  var baseCourseName=window.cn;
  var attendanceCourseNames={};

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
    select.innerHTML='<option value="">— Pilih program studi —</option>'+PROGRAMS.map(function(program){
      return '<option value="'+program.id+'"'+(state.membership&&state.membership.program_id===program.id?' selected':'')+'>'+program.name+'</option>';
    }).join('');
    select.value=state.membership?state.membership.program_id:state.pendingProgramId;
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
    syncCourseMirror();
    try{
      await fetchProgress();
      state.progressError='';
    }catch(error){
      state.progress={};
      state.progressError='Status tugas gagal dimuat. Pastikan tabel program_task_progress dan kebijakan SQL sudah dipasang.';
      console.error('Gagal memuat status tugas pribadi.',error);
    }
  }

  async function fetchProgress(){
    var program=currentProgram(),user=window.account;
    if(!program||!user||!window.supabaseClient)return;
    var result=await window.supabaseClient.from('program_task_progress')
      .select('task_id,completed')
      .eq('program_id',program.id)
      .eq('user_id',user.id);
    if(result.error)throw result.error;
    state.progress={};
    (result.data||[]).forEach(function(row){state.progress[row.task_id]=!!row.completed});
    var oldProgress=window.S&&window.S.programTaskDone||{},legacyRows=[];
    kindEntries('task').forEach(function(task){
      if(oldProgress[task.id]&&!Object.prototype.hasOwnProperty.call(state.progress,task.id)){
        state.progress[task.id]=true;
        legacyRows.push({user_id:user.id,program_id:program.id,task_id:task.id,completed:true,updated_at:new Date().toISOString()});
      }
    });
    if(legacyRows.length){
      var migrated=await window.supabaseClient.from('program_task_progress').upsert(legacyRows,{onConflict:'user_id,task_id'});
      if(migrated.error)throw migrated.error;
    }
  }

  function sharedCourses(){
    var courses=kindEntries('course');
    if(courses.length)return courses;
    var groups={};
    kindEntries('schedule').forEach(function(entry){
      var item=entry.data||{},key=String(item.course||'').trim().toLocaleLowerCase();
      if(!groups[key])groups[key]={id:'legacy-'+entry.id,kind:'course',data:{name:item.course||'Mata kuliah',lecturer:item.lecturer||'',sks:'',slots:[]}};
      groups[key].data.slots.push({day:+item.day,start:item.start||'08:00',end:item.end||'09:40',room:item.room||''});
    });
    return Object.keys(groups).map(function(key){return groups[key]});
  }

  function syncCourseMirror(){
    if(!window.S||!Array.isArray(window.S.courses)||!Array.isArray(window.S.att))return;
    var courses=sharedCourses(),oldCourses=window.S.courses;
    oldCourses.forEach(function(course){attendanceCourseNames[course.id]=course.name});
    courses.forEach(function(course){attendanceCourseNames[course.id]=course.data.name||'Mata kuliah'});
    window.S.att.forEach(function(record){
      var oldCourse=oldCourses.find(function(course){return course.id===record.cid});
      var oldName=oldCourse&&oldCourse.name||attendanceCourseNames[record.cid];
      var shared=oldName&&courses.find(function(course){return String(course.data.name||'').trim().toLocaleLowerCase()===String(oldName).trim().toLocaleLowerCase()});
      if(shared)record.cid=shared.id;
    });
  }

  async function migrateLegacySchedules(){
    if(!state.membership||state.membership.role!=='admin'||!kindEntries('schedule').length)return;
    var groups={},existingNames={};
    kindEntries('course').forEach(function(entry){
      existingNames[String(entry.data&&entry.data.name||'').trim().toLocaleLowerCase()]=true;
    });
    kindEntries('schedule').forEach(function(entry){
      var item=entry.data||{},key=String(item.course||'').trim().toLocaleLowerCase();
      if(!groups[key])groups[key]={id:window.uid(),program_id:state.membership.program_id,kind:'course',data:{name:item.course||'Mata kuliah',lecturer:item.lecturer||'',sks:'',slots:[]},updated_at:new Date().toISOString()};
      groups[key].data.slots.push({day:+item.day,start:item.start||'08:00',end:item.end||'09:40',room:item.room||''});
    });
    var oldIds=kindEntries('schedule').map(function(entry){return entry.id});
    var additions=Object.keys(groups).map(function(key){return groups[key]}).filter(function(course){
      return !existingNames[String(course.data.name||'').trim().toLocaleLowerCase()];
    });
    if(additions.length){
      var result=await window.supabaseClient.from('program_content').upsert(additions,{onConflict:'id'});
      if(result.error)throw result.error;
    }
    if(oldIds.length){
      var removed=await window.supabaseClient.from('program_content').delete().in('id',oldIds).eq('program_id',state.membership.program_id);
      if(removed.error)throw removed.error;
    }
    await fetchEntries();
  }

  function watchProgram(program){
    clearRealtime();
    state.channel=window.supabaseClient.channel('program-content-'+program.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'program_content',filter:'program_id=eq.'+program.id},function(){
        fetchEntries().then(function(){render()}).catch(function(error){programError('Gagal memuat pembaruan data prodi: '+error.message)});
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'program_task_progress',filter:'user_id=eq.'+window.account.id},function(){
        fetchProgress().then(function(){render()}).catch(function(error){programError('Gagal memuat status tugas: '+error.message)});
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
    attendanceCourseNames={};
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
      state.pendingProgramId='';
      if(state.membership){
        await fetchEntries();
        await migrateLegacySchedules();
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
    state.pendingProgramId=program.id;
    state.status='loading';
    state.error='';
    state.accountId=window.account.id;
    state.membership=null;
    render();
    var user=window.account;
    var displayName=user.user_metadata&&user.user_metadata.full_name||user.email||'Peserta';
    try{
      var programResult=await window.supabaseClient.from('programs')
        .select('id')
        .eq('id',program.id)
        .maybeSingle();
      if(programResult.error)throw programResult.error;
      if(!programResult.data){
        var missingProgramError=new Error('Program studi belum terdaftar di database Supabase.');
        missingProgramError.code='PROGRAM_NOT_SEEDED';
        throw missingProgramError;
      }
      var result=await window.supabaseClient.from('program_members').upsert({
        user_id:user.id,
        program_id:program.id,
        display_name:displayName,
        role:'member'
      },{onConflict:'user_id'});
      if(result.error)throw result.error;
    }catch(error){
      state.status='error';
      state.error=error&&error.code==='PROGRAM_NOT_SEEDED'
        ?'Prodi tidak terlihat oleh akun aplikasi. Pastikan katalog programs dapat dibaca peserta; jalankan SQL perbaikan di README, lalu pilih prodi lagi.'
        :'Pilihan prodi gagal disimpan. Periksa kebijakan RLS untuk program_members dan coba lagi.';
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
    if(state.progressError)return '<div class="program-notice">'+window.esc(state.progressError)+'</div>';
    if(!state.membership)return '<div class="program-notice">Pilih program studi melalui menu profil untuk melihat jadwal, tugas, dan peserta.</div>';
    return '';
  }

  function kindEntries(kind){
    return state.entries.filter(function(entry){return entry.kind===kind});
  }

  function actions(kind,entry){
    if(!state.membership||state.membership.role!=='admin'||!state.entries.some(function(item){return item.id===entry.id&&item.kind===kind}))return '';
    return '<div class="program-actions"><button class="btn secondary" type="button" onclick="editProgramItem(\''+kind+'\',\''+window.esc(entry.id)+'\')">Edit</button><button class="btn secondary" type="button" onclick="deleteProgramItem(\''+kind+'\',\''+window.esc(entry.id)+'\')">Hapus</button></div>';
  }

  function importButton(){
    return state.membership&&state.membership.role==='admin'
      ?'<button class="btn secondary" type="button" onclick="importLegacyProgramData()" '+(state.importing?'disabled':'')+'>'+(state.importing?'Mengimpor...':'Impor data lama')+'</button>'
      :'';
  }

  function renderSchedule(){
    var notice=programNotice(),entries=[];
    sharedCourses().forEach(function(course){
      (course.data.slots||[]).forEach(function(slot){
        entries.push({id:course.id,course:course.data,slot:slot});
      });
    });
    entries.sort(function(a,b){return (+a.slot.day||0)-(+b.slot.day||0)||String(a.slot.start||'').localeCompare(String(b.slot.start||''))});
    var rows=entries.map(function(entry){
      var item=entry.course||{},slot=entry.slot||{};
      return '<tr><td>'+(window.DAYS[+slot.day]||'—')+'</td><td>'+window.esc(item.name||'—')+'</td><td>'+window.esc(slot.start||'—')+'–'+window.esc(slot.end||'—')+'</td><td>'+window.esc(slot.room||'—')+'</td><td>'+window.esc(item.lecturer||'—')+'</td><td>'+actions('course',entry)+'</td></tr>';
    });
    var add=state.membership&&state.membership.role==='admin'?'<div class="program-actions"><button class="btn" type="button" onclick="editProgramItem(\'course\')">＋ Tambah mata kuliah</button>'+importButton()+'</div>':'';
    return notice+'<div class="card"><div class="list-heading"><h2>Jadwal '+(currentProgram()?window.esc(currentProgram().name):'prodi')+'</h2>'+add+'</div>'+window.dataTable(['Hari','Mata kuliah','Waktu','Ruang','Dosen','Aksi'],rows,'Belum ada jadwal untuk program studi ini.')+'</div>';
  }

  function renderCourses(){
    var courses=sharedCourses().slice().sort(function(a,b){return String(a.data.name||'').localeCompare(String(b.data.name||''))});
    var rows=courses.map(function(course){
      var data=course.data||{},slots=data.slots||[];
      var schedule=slots.length?slots.slice().sort(function(a,b){return (+a.day)-(+b.day)||String(a.start).localeCompare(String(b.start))}).map(function(slot){
        return (window.DAYS[+slot.day]||'—')+', '+window.esc(slot.start||'—')+'–'+window.esc(slot.end||'—')+(slot.room?' · '+window.esc(slot.room):'');
      }).join('<br>'):'Belum ada jadwal';
      return '<tr><td>'+window.esc(data.name||'—')+'</td><td>'+window.esc(data.lecturer||'—')+'</td><td>'+window.esc(data.sks||'—')+'</td><td>'+schedule+'</td><td>'+actions('course',course)+'</td></tr>';
    });
    var add=state.membership&&state.membership.role==='admin'?'<div class="program-actions"><button class="btn" type="button" onclick="editProgramItem(\'course\')">＋ Tambah mata kuliah</button>'+importButton()+'</div>':'';
    var units=courses.reduce(function(total,course){return total+(+course.data.sks||0)},0);
    return programNotice()+'<div class="card"><div class="list-heading"><h2>Daftar ('+courses.length+' MK, '+units+' SKS) · '+(currentProgram()?window.esc(currentProgram().name):'prodi')+'</h2>'+add+'</div>'+window.dataTable(['Mata kuliah','Dosen','SKS','Jadwal','Aksi'],rows,'Belum ada mata kuliah untuk program studi ini.')+'</div>';
  }

  function backfillProgramAttendance(courses){
    var planner=window.S,filled=planner.programAttendanceBackfilledCourses||{};
    if(!currentProgram()||!courses.length)return;
    var changed=false,markerChanged=false,start=new Date(2026,8,7),today=new Date(window.todayISO+'T00:00:00');
    courses.forEach(function(course){
      if(filled[course.id])return;
      for(var day=new Date(start);day<=today;day.setDate(day.getDate()+1)){
        var date=window.iso(day),weekday=(day.getDay()+6)%7;
        (course.data.slots||[]).filter(function(slot){return +slot.day===weekday}).forEach(function(){
          if(!planner.att.some(function(record){return record.cid===course.id&&record.date===date})){
            planner.att.push({id:window.uid(),cid:course.id,date:date,st:'Hadir'});
            changed=true;
          }
        });
      }
      filled[course.id]=true;
      markerChanged=true;
    });
    planner.programAttendanceBackfilledCourses=filled;
    if(changed||markerChanged)window.save();
  }

  function renderAttendance(){
    var courses=sharedCourses(),date=window.todayISO,weekday=window.todayIdx;
    backfillProgramAttendance(courses);
    var adding=window.ed&&window.ed.k==='att'&&window.ed.id===null;
    var selected=window.ed&&window.ed.k==='att'&&window.ed.id!==null?window.S.att.find(function(item){return item.id===window.ed.id}):null;
    var todayCourses=courses.filter(function(course){return (course.data.slots||[]).some(function(slot){return +slot.day===weekday})});
    var modal='';
    if(adding){
      var courseOptions=todayCourses.map(function(course){
        return '<option value="'+window.esc(course.id)+'">'+window.esc(course.data.name||'Mata kuliah')+'</option>';
      }).join('');
      modal=window.modalDialog('Catat kehadiran','<p class="mu">Tanggal: '+window.fmt(date)+'</p><div class="row"><select id="aC" aria-label="Mata kuliah" required '+(todayCourses.length?'':'disabled')+'>'+courseOptions+'</select><select id="aS" aria-label="Status kehadiran" required>'+window.attendanceStatusOptions('Hadir').replace('<option value="">— pilih status —</option>','')+'</select></div><div class="delete-actions"><button class="btn secondary" type="button" onclick="cancel()">Batal</button><button class="btn" type="button" onclick="saveProgramAttendance()" '+(todayCourses.length?'':'disabled')+'>Simpan</button></div>');
    }else if(selected){
      var courseName=attendanceCourseNames[selected.cid]||baseCourseName(selected.cid);
      modal=window.modalDialog('Edit kehadiran','<p class="mu">'+courseName+' · '+window.fmt(selected.date)+'</p><div class="row"><select id="aS" aria-label="Status kehadiran" required>'+window.attendanceStatusOptions(selected.st).replace('<option value="">— pilih status —</option>','')+'</select></div><div class="delete-actions"><button class="btn secondary" type="button" onclick="cancel()">Batal</button><button class="btn" type="button" onclick="saveProgramAttendance()">Simpan</button></div>');
    }
    var add='<button class="btn" type="button" onclick="addNew(\'att\')" '+(todayCourses.length?'':'disabled')+'>＋ Catat kehadiran</button>';
    var recap=courses.map(function(course){
      var records=window.S.att.filter(function(item){return item.cid===course.id&&item.st!=='Tidak ada'});
      var percentage=records.length?Math.round(records.filter(function(item){return item.st==='Hadir'}).length/records.length*100):null;
      return '<tr><td>'+window.esc(course.data.name||'Mata kuliah')+'</td><td>'+records.length+'</td><td><span class="mu">'+(percentage===null?'-':percentage+'%')+'</span><div class="bar"><i style="width:'+(percentage||0)+'%"></i></div></td></tr>';
    });
    var byDate={};
    window.S.att.forEach(function(record){if(!byDate[record.date])byDate[record.date]=[];byDate[record.date].push(record)});
    var history=[];
    Object.keys(byDate).sort(function(a,b){return b.localeCompare(a)}).slice(0,30).forEach(function(day){
      var weekdayName=window.DAYS[(new Date(day+'T00:00').getDay()+6)%7];
      byDate[day].slice().sort(function(a,b){
        function startTime(record){
          var course=courses.find(function(item){return item.id===record.cid});
          return course?(course.data.slots||[]).filter(function(slot){return +slot.day===(new Date(day+'T00:00').getDay()+6)%7}).map(function(slot){return String(slot.start||'')}).sort().pop()||'':'';
        }
        return startTime(b).localeCompare(startTime(a));
      }).forEach(function(record){
        var name=attendanceCourseNames[record.cid]||window.esc(baseCourseName(record.cid));
        history.push('<tr><td>'+weekdayName+', '+window.fmt(day)+'</td><td>'+name+'</td><td><span class="tag '+(record.st==='Tidak ada'?'no-class':window.esc(record.st))+'">'+(record.st==='Alpha'?'Alpa':window.esc(record.st))+'</span></td><td class="table-actions">'+window.acts('att',record.id)+'</td></tr>');
      });
    });
    return programNotice()+modal+'<div class="card"><div class="list-heading"><h2>Rekap absensi pribadi</h2>'+add+'</div>'+window.dataTable(['Mata kuliah','Pertemuan','Kehadiran'],recap,'Belum ada mata kuliah untuk prodi ini.')+'</div><div class="card"><h2>Riwayat terbaru</h2>'+window.dataTable(['Tanggal','Mata kuliah','Status','Aksi'],history,'Belum ada catatan.')+'</div>';
  }

  function renderTasks(){
    var notice=programNotice(),entries=kindEntries('task').slice().sort(function(a,b){
      var aDone=!!state.progress[a.id],bDone=!!state.progress[b.id];
      return Number(aDone)-Number(bDone)||String(b.data.due||'').localeCompare(String(a.data.due||''));
    });
    var rows=entries.map(function(entry){
      var item=entry.data||{},isDone=!!state.progress[entry.id];
      return '<tr class="'+(isDone?'done':'')+'"><td><input class="task-checkbox" type="checkbox" aria-label="Tandai selesai: '+window.esc(item.title||'tugas')+'" '+(isDone?'checked':'')+' onchange="toggleProgramTask(\''+window.esc(entry.id)+'\')"></td><td><span class="task-title">'+window.esc(item.title||'—')+'</span></td><td>'+window.esc(item.course||'—')+'</td><td class="task-description">'+window.esc(item.description||'—')+'</td><td>'+window.esc(item.due||'—')+'</td><td>'+actions('task',entry)+'</td></tr>';
    });
    var add=state.membership&&state.membership.role==='admin'?'<div class="program-actions"><button class="btn" type="button" onclick="editProgramItem(\'task\')">＋ Tambah tugas</button>'+importButton()+'</div>':'';
    return notice+'<div class="card"><div class="list-heading"><h2>Tugas '+(currentProgram()?window.esc(currentProgram().name):'prodi')+'</h2>'+add+'</div>'+window.dataTable(['Selesai','Tugas','Mata kuliah','Keterangan','Tenggat','Aksi'],rows,'Belum ada tugas untuk program studi ini.','task-table')+'</div>';
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
    var personalCourses=sharedCourses().map(function(course){return {id:course.id,name:course.data.name||'Mata kuliah'}});
    var attendance='<div class="card"><h2>Kehadiran pribadi</h2>'+(personalCourses.length?personalCourses.map(function(course){
      var percentage=window.pct(course.id);
      return '<div style="margin-bottom:8px"><div class="mu">'+window.esc(course.name)+' — '+(percentage===null?'belum ada data':percentage+'%')+'</div><div class="bar"><i style="width:'+(percentage||0)+'%"></i></div></div>';
    }).join(''):'<div class="empty">Belum ada mata kuliah.</div>')+'</div>';
    var upcoming=[];
    sharedCourses().forEach(function(course){
      (course.data.slots||[]).forEach(function(slot){
        var days=(+slot.day-window.todayIdx+7)%7;
        if(days===0&&String(slot.start||'')<new Date().toTimeString().slice(0,5))days=7;
        upcoming.push({course:course.data,slot:slot,days:days});
      });
    });
    upcoming.sort(function(a,b){return a.days-b.days||String(a.slot.start||'').localeCompare(String(b.slot.start||''))});
    upcoming=upcoming.slice(0,3);
    var tasks=kindEntries('task').filter(function(entry){return !state.progress[entry.id]})
      .sort(function(a,b){return String(b.data.due||'').localeCompare(String(a.data.due||''))}).slice(0,5);
    return programNotice()+'<div class="grid"><div class="card"><h2>Jadwal prodi terdekat</h2>'+(upcoming.length?upcoming.map(function(entry){var item=entry.course||{},slot=entry.slot||{};return '<div class="item"><div class="grow"><b>'+window.esc(item.name||'Mata kuliah')+'</b><div class="mu">'+(window.DAYS[+slot.day]||'')+' · '+window.esc(slot.start||'')+'–'+window.esc(slot.end||'')+(slot.room?' · '+window.esc(slot.room):'')+'</div></div></div>'}).join(''):'<div class="empty">Belum ada jadwal prodi.</div>')+'</div><div class="card"><h2>Tugas prodi</h2>'+(tasks.length?tasks.map(function(entry){var item=entry.data||{};return '<div class="item"><div class="grow"><b>'+window.esc(item.title||'Tugas')+'</b><div class="mu">'+window.esc(item.course||'')+'</div></div><span class="mu">'+window.esc(item.due||'')+'</span></div>'}).join(''):'<div class="empty">Belum ada tugas prodi.</div>')+'</div>'+attendance+'</div>';
  }

  window.VIEWS.schedule=renderSchedule;
  window.VIEWS.courses=renderCourses;
  window.VIEWS.att=renderAttendance;
  window.VIEWS.tasks=renderTasks;
  window.VIEWS.participants=renderParticipants;
  window.VIEWS.dash=renderDashboard;
  window.cn=function(id){
    return attendanceCourseNames[id]?window.esc(attendanceCourseNames[id]):baseCourseName(id);
  };

  window.saveProgramAttendance=function(){
    var adding=window.ed&&window.ed.k==='att'&&window.ed.id===null;
    var record=adding?null:window.S.att.find(function(item){return window.ed&&item.id===window.ed.id});
    var cid=adding?window.v('aC'):record&&record.cid,status=window.v('aS');
    if(!cid||!status)return;
    if(adding){
      var course=sharedCourses().find(function(item){return item.id===cid&&(item.data.slots||[]).some(function(slot){return +slot.day===window.todayIdx})});
      if(!course)return;
      record=window.S.att.find(function(item){return item.cid===cid&&item.date===window.todayISO});
      if(!record)window.S.att.push(record={id:window.uid(),cid:cid,date:window.todayISO,st:status});
      else record.st=status;
    }else record.st=status;
    window.ed={k:null,id:null};
    state.editor=null;
    window.save();
    render();
  };

  window.refreshProgramParticipants=function(){
    state.participantsLoaded=false;
    state.participantsLoading=false;
    state.error='';
    render();
  };

  window.toggleProgramTask=function(id){
    if(!state.membership||!state.entries.some(function(entry){return entry.id===id&&entry.kind==='task'}))return;
    var user=window.account,previous=!!state.progress[id],completed=!previous;
    state.progress[id]=completed;
    render();
    window.supabaseClient.from('program_task_progress').upsert({
      user_id:user.id,
      program_id:state.membership.program_id,
      task_id:id,
      completed:completed,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id,task_id'}).then(function(result){
      if(result.error)throw result.error;
    }).catch(function(error){
      state.progress[id]=previous;
      state.error='Status tugas gagal disimpan. Pastikan SQL pembaruan sudah dijalankan.';
      console.error('Gagal menyimpan status tugas pribadi.',error);
      render();
    });
  };

  window.importLegacyProgramData=async function(){
    if(!state.membership||state.membership.role!=='admin'||state.importing)return;
    var personal=window.S||{},courses=personal.courses||[];
    function courseFor(id){
      return courses.find(function(course){return course.id===id})||null;
    }
    function normalized(value){
      return String(value||'').trim().toLocaleLowerCase();
    }
    var known={};
    state.entries.forEach(function(entry){
      if(entry.kind==='course')known['course|'+normalized(entry.data&&entry.data.name)]=true;
    });
    kindEntries('task').forEach(function(entry){
      var data=entry.data||{};
      known[['task',normalized(data.title),normalized(data.course),normalized(data.due),normalized(data.description)].join('|')]=true;
    });
    var rows=[];
    courses.forEach(function(course){
      var data={
        name:course.name||'Mata kuliah',
        lecturer:course.lec||'',
        sks:course.sks||'',
        slots:(personal.schedule||[]).filter(function(slot){return slot.cid===course.id}).map(function(slot){
          return {day:+slot.day,start:slot.s||'08:00',end:slot.e||'09:40',room:slot.room||''};
        })
      },key='course|'+normalized(data.name);
      if(!known[key]){
        known[key]=true;
        rows.push({id:window.uid(),program_id:state.membership.program_id,kind:'course',data:data,updated_at:new Date().toISOString()});
      }
    });
    (personal.tasks||[]).forEach(function(task){
      var course=courseFor(task.cid),data={
        title:task.title||'',
        course:course?course.name:'',
        due:task.due||'',
        description:task.description||''
      };
      if(!data.title||!data.due)return;
      var key=['task',normalized(data.title),normalized(data.course),normalized(data.due),normalized(data.description)].join('|');
      if(!known[key]){
        known[key]=true;
        rows.push({id:window.uid(),program_id:state.membership.program_id,kind:'task',data:data,updated_at:new Date().toISOString()});
      }
    });
    if(!rows.length){
      window.alert('Tidak ada mata kuliah atau tugas lama yang perlu diimpor. Data yang sama tidak digandakan.');
      return;
    }
    var courseCount=rows.filter(function(row){return row.kind==='course'}).length;
    var taskCount=rows.length-courseCount;
    if(!window.confirm('Impor '+courseCount+' mata kuliah dan '+taskCount+' tugas dari data pribadi akun admin ini ke '+(currentProgram()?currentProgram().name:'prodi')+'? Data pribadi lama tidak akan dihapus. Data yang sudah ada tidak digandakan.'))return;
    state.importing=true;
    state.error='';
    render();
    try{
      var result=await window.supabaseClient.from('program_content').upsert(rows,{onConflict:'id'});
      if(result.error)throw result.error;
      await fetchEntries();
      await migrateLegacySchedules();
      state.importing=false;
      window.badge('☁️ Data lama berhasil diimpor');
      window.alert('Impor selesai: '+courseCount+' mata kuliah dan '+taskCount+' tugas disalin ke prodi.');
      render();
    }catch(error){
      state.importing=false;
      state.error='Impor gagal. Data lama tetap tersimpan; coba lagi atau periksa izin admin prodi.';
      console.error('Gagal mengimpor data pribadi lama ke prodi.',error);
      render();
    }
  };

  window.editProgramItem=function(kind,id){
    if(!state.membership||state.membership.role!=='admin')return;
    var existing=id&&state.entries.find(function(entry){return entry.id===id&&entry.kind===kind});
    if(id&&!existing)return;
    state.editor={kind:kind,id:id||null,data:existing?existing.data:{}};
    var data=state.editor.data,form;
    if(kind==='course'){
      var slots=data.slots||[];
      function slotFields(index,label){
        var slot=slots[index];
        return '<p class="mu">'+label+'</p><div class="row"><select id="programDay'+index+'" aria-label="Hari kelas '+(index+1)+'"><option value="">— tanpa jadwal —</option>'+window.DAYS.map(function(day,dayIndex){return '<option value="'+dayIndex+'"'+(slot&&+slot.day===dayIndex?' selected':'')+'>'+day+'</option>'}).join('')+'</select><input id="programStart'+index+'" type="time" aria-label="Waktu mulai" value="'+window.esc(slot&&slot.start||'08:00')+'"><input id="programEnd'+index+'" type="time" aria-label="Waktu selesai" value="'+window.esc(slot&&slot.end||'09:40')+'"><input id="programRoom'+index+'" placeholder="Ruang" value="'+window.esc(slot&&slot.room||'')+'"></div>';
      }
      form='<div class="row"><input id="programName" placeholder="Nama mata kuliah" required value="'+window.esc(data.name||'')+'"><input id="programLecturer" placeholder="Dosen" value="'+window.esc(data.lecturer||'')+'"><input id="programSks" type="number" min="1" max="6" placeholder="SKS" value="'+window.esc(data.sks||'')+'"></div>'+slotFields(0,'Waktu kelas 1')+'<div id="secondScheduleFields"'+(slots.length>1?'':' hidden')+'>'+slotFields(1,'Waktu kelas 2')+'</div>'+(slots.length>1?'':'<button id="addSecondSchedule" class="btn secondary" type="button" onclick="showSecondSchedule()">＋ Tambah waktu kelas ke-2</button>');
    }else{
      var taskCourses=sharedCourses(),courseOptions='<option value="">— pilih mata kuliah —</option>'+taskCourses.map(function(course){return '<option value="'+window.esc(course.data.name||'')+'"'+(course.data.name===data.course?' selected':'')+'>'+window.esc(course.data.name||'Mata kuliah')+'</option>'}).join('');
      form='<label for="programTitle">Judul tugas</label><input id="programTitle" required value="'+window.esc(data.title||'')+'"><div class="row"><select id="programTaskCourse" aria-label="Mata kuliah">'+courseOptions+'</select><input id="programDue" type="date" aria-label="Tenggat" required value="'+window.esc(data.due||'')+'"></div><label for="programDescription">Keterangan / detail tugas</label><textarea id="programDescription" placeholder="Tambahkan detail tugas">'+window.esc(data.description||'')+'</textarea>';
    }
    var layer=document.getElementById('settingsLayer');
    layer.innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)closeProgramEditor()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="programEditorTitle"><div class="modal-head"><h2 id="programEditorTitle">'+(existing?'Edit':'Tambah')+(kind==='course'?' mata kuliah':' tugas')+'</h2><button class="x" type="button" aria-label="Tutup" onclick="closeProgramEditor()">✕</button></div><form onsubmit="saveProgramItem(event)">'+form+'<div class="delete-actions"><button class="btn secondary" type="button" onclick="closeProgramEditor()">Batal</button><button class="btn" type="submit">Simpan</button></div></form></section></div>';
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
    if(kind==='course'){
      data={name:window.v('programName'),lecturer:window.v('programLecturer'),sks:window.v('programSks'),slots:[]};
      if(!data.name)return;
      var duplicate=kindEntries('course').some(function(entry){return entry.id!==state.editor.id&&String(entry.data.name||'').trim().toLocaleLowerCase()===data.name.toLocaleLowerCase()});
      if(duplicate){window.alert('Mata kuliah dengan nama tersebut sudah ada di prodi ini.');return}
      [0,1].forEach(function(index){
        var day=window.v('programDay'+index),start=window.v('programStart'+index),end=window.v('programEnd'+index);
        if(day===''||!start||!end)return;
        if(end<=start){data.invalidSlot=true;return}
        data.slots.push({day:+day,start:start,end:end,room:window.v('programRoom'+index)});
      });
      if(data.invalidSlot){delete data.invalidSlot;window.alert('Waktu selesai harus setelah waktu mulai.');return}
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
    if(!window.confirm('Hapus '+(kind==='course'?'mata kuliah beserta jadwalnya':'tugas')+' ini untuk seluruh peserta prodi?'))return;
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
    state.progress={};
    state.participants=[];
    state.participantsLoaded=false;
    state.participantsLoading=false;
    state.progressError='';
    state.pendingProgramId='';
    attendanceCourseNames={};
    return baseRenderAuth(message);
  };

  if(!window.account&&!window.supabaseClient)baseRender();
})();
