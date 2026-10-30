// 07-concursos.js — Concursos (troca/criação), prioridades, disciplinas, pesos e personalização.
// Planejador de Estudos V10.9 (ver ARQUITETURA.md). Scripts clássicos compartilham o escopo global: a ORDEM de carga em index.html importa.
        // Exclusões de concursos são registradas como tombstones para que uma cópia antiga de outro dispositivo não os recupere na próxima sincronização.
        let deletedContestMap = {};
        try { deletedContestMap = JSON.parse(localStorage.getItem('tce_deleted_contests') || '{}') || {}; } catch(e) { deletedContestMap = {}; }
        if (!deletedContestMap || typeof deletedContestMap !== 'object' || Array.isArray(deletedContestMap)) deletedContestMap = {};
        function getDeletedContestMap(){
          let stored={};try{stored=JSON.parse(localStorage.getItem('tce_deleted_contests')||'{}')||{};}catch(e){}
          if(!stored||typeof stored!=='object'||Array.isArray(stored))stored={};
          deletedContestMap={...deletedContestMap,...stored};return {...deletedContestMap};
        }
        function mergeDeletedContestMaps(remoteMap,localMap){
          const merged={};
          [remoteMap,localMap].forEach(map=>{if(!map||typeof map!=='object'||Array.isArray(map))return;Object.entries(map).forEach(([id,value])=>{
            if(!id)return;const stamp=typeof value==='string'?value:(value&&typeof value==='object'?(value.deletedAt||value.timestamp||''): '');
            const old=merged[id];const oldStamp=typeof old==='string'?old:'';
            if(!old||((Date.parse(stamp)||0)>(Date.parse(oldStamp)||0)))merged[id]=stamp||oldStamp||new Date(0).toISOString();
          });});return merged;
        }
        function setDeletedContestMap(map){deletedContestMap=mergeDeletedContestMaps(deletedContestMap,map);try{localStorage.setItem('tce_deleted_contests',JSON.stringify(deletedContestMap));}catch(e){}return {...deletedContestMap};}
        function isContestDeleted(id){return Boolean(getDeletedContestMap()[String(id||'')]);}
        function purgeContestLocalStorage(id){
          const exact='tce_contest_data_'+id, prefix='tce_'+id+'_', remove=[];
          for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key===exact||(key&&key.startsWith(prefix)))remove.push(key);}
          remove.forEach(key=>{try{localStorage.removeItem(key);}catch(e){}});
        }
        let contests = {};
        try { contests = JSON.parse(localStorage.getItem('tce_contests') || '{}') || {}; } catch(e) { contests = {}; }
        if (!contests || typeof contests !== 'object' || Array.isArray(contests)) contests = {};
        Object.keys(contests).forEach(id=>{if(isContestDeleted(id))delete contests[id];});
        // Recupera nomes de snapshots locais antes de decidir se o concurso salvo foi realmente excluído.
        const snapshotKeys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith('tce_contest_data_'))snapshotKeys.push(key);}
        snapshotKeys.forEach(key=>{
          const id=key.slice('tce_contest_data_'.length);if(contests[id]||isContestDeleted(id))return;
          try{const snap=JSON.parse(localStorage.getItem(key)||'null');contests[id]={name:snap?.contestName||snap?.name||id,board:'',date:''};}catch(e){}
        });
        const savedActiveContest=localStorage.getItem('tce_active_contest');
        let activeContest = savedActiveContest || Object.keys(contests)[0] || DEFAULT_CONTEST_ID;
        const activeContestWasRemoved=Boolean(savedActiveContest&&isContestDeleted(savedActiveContest));
        if (!contests[activeContest]) activeContest=Object.keys(contests)[0] || (isContestDeleted(DEFAULT_CONTEST_ID)?'concurso-'+Date.now():DEFAULT_CONTEST_ID);
        if (!contests[activeContest]) contests[activeContest]={name:activeContest===DEFAULT_CONTEST_ID?DEFAULT_CONTEST_NAME:'Novo concurso',board:'',date:''};
        localStorage.setItem('tce_active_contest',activeContest);
        if(activeContestWasRemoved){
          let restored=null;try{restored=JSON.parse(localStorage.getItem('tce_contest_data_'+activeContest)||'null');}catch(e){}
          if(restored)restoreSnapshotToMemory(restored);else{masterEditalData=[];userProgress=[];studySessions=[];}
          if(restored?.prioritySettings)localStorage.setItem('tce_'+activeContest+'_priority_settings',JSON.stringify(restored.prioritySettings));
          if(restored?.disciplineSettings)localStorage.setItem('tce_'+activeContest+'_discipline_settings',JSON.stringify(restored.disciplineSettings));
          if(restored?.suggestionMode)localStorage.setItem('tce_'+activeContest+'_suggestion_mode',restored.suggestionMode);
          localStorage.setItem('tce_master_edital',JSON.stringify(masterEditalData));localStorage.setItem('tce_go_pro_data',JSON.stringify(userProgress));localStorage.setItem('tce_go_pro_sessions',JSON.stringify(studySessions));
        }
        function contestKey(suffix){return 'tce_'+activeContest+'_'+suffix;}

        // Reconstrói SEMPRE o seletor a partir da lista persistida, e não apenas do concurso ativo.
        function renderContestSelector(){
          const sel=document.getElementById('contest-selector'); if(!sel) return;
          if(!contests || typeof contests!=='object' || Array.isArray(contests)) contests={};
          Object.keys(contests).forEach(id=>{if(isContestDeleted(id))delete contests[id];});
          // Reindexa snapshots locais que ainda existam, exceto aqueles marcados como excluídos.
          for(let i=0;i<localStorage.length;i++){
            const key=localStorage.key(i);
            if(!key || !key.startsWith('tce_contest_data_')) continue;
            const id=key.slice('tce_contest_data_'.length);
            if(contests[id]||isContestDeleted(id)) continue;
            try{const snap=JSON.parse(localStorage.getItem(key)||'null');contests[id]={name:snap?.contestName||snap?.name||id,board:'',date:''};}catch(e){}
          }
          let ids=Object.keys(contests).sort((a,b)=>String(contests[a]?.name||a).localeCompare(String(contests[b]?.name||b),'pt-BR'));
          if(!ids.length){let id=isContestDeleted(DEFAULT_CONTEST_ID)?'concurso-'+Date.now():DEFAULT_CONTEST_ID;contests[id]={name:id===DEFAULT_CONTEST_ID?DEFAULT_CONTEST_NAME:'Novo concurso',board:'',date:''};ids=[id];}
          if(!contests[activeContest]){activeContest=ids[0];localStorage.setItem('tce_active_contest',activeContest);}
          sel.innerHTML='';
          ids.forEach(id=>{
            const option=document.createElement('option'); option.value=id; option.textContent=contests[id]?.name||id;
            sel.appendChild(option);
          });
          sel.value=activeContest;
          try { localStorage.setItem('tce_contests',JSON.stringify(contests)); } catch(e) {}
          renderContestManager();
        }
        function renderContestManager(){
          const container=document.getElementById('contest-manager-list');if(!container)return;
          const ids=Object.keys(contests||{}).filter(id=>!isContestDeleted(id)).sort((a,b)=>String(contests[a]?.name||a).localeCompare(String(contests[b]?.name||b),'pt-BR'));
          if(!ids.length){container.innerHTML='<p class="text-sm text-slate-500">Nenhum concurso cadastrado.</p>';return;}
          container.innerHTML=ids.map(id=>{
            const cfg=contests[id]||{},isActive=id===activeContest,disabled=ids.length<=1;
            return `<div class="contest-manager-row"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><strong class="contest-manager-name">${escapeHtml(cfg.name||id)}</strong>${isActive?'<span class="contest-active-badge">Ativo</span>':''}</div><div class="contest-manager-meta">${escapeHtml([cfg.board||'',cfg.date?new Date(cfg.date+'T00:00:00').toLocaleDateString('pt-BR'): ''].filter(Boolean).join(' · ')||'Sem banca ou data de prova cadastrada')}</div></div><button type="button" class="contest-delete-btn" data-contest-id="${escapeHtml(id)}" onclick="deleteContest(this.dataset.contestId)" ${disabled?'disabled title="Não é possível excluir o único concurso cadastrado"':'title="Excluir concurso e seus dados"'}><i class="fa-solid fa-trash-can mr-1" aria-hidden="true"></i>Excluir</button></div>`;
          }).join('');
        }
        function deleteContest(id){
          if(!id||!contests[id]||isContestDeleted(id))return;
          const ids=Object.keys(contests).filter(key=>!isContestDeleted(key));
          if(ids.length<=1){showCustomDialog('Não é possível excluir','Mantenha pelo menos um concurso cadastrado.');return;}
          const name=contests[id]?.name||id;
          showCustomDialog('Excluir concurso?',`O concurso “${name}” e os dados associados a ele serão excluídos deste aplicativo: edital, progresso, histórico e personalizações. A exclusão ficará registrada neste dispositivo e será sincronizada com a nuvem na próxima sincronização. Não poderá ser desfeita. Recomendamos exportar um backup antes de continuar.`, 'fa-solid fa-triangle-exclamation',()=>{
            const wasActive=id===activeContest;
            if(wasActive)saveCurrentContestSnapshot(id);
            const tombstones=getDeletedContestMap();tombstones[id]=new Date().toISOString();setDeletedContestMap(tombstones);
            delete contests[id];purgeContestLocalStorage(id);
            if(wasActive){
              const nextId=Object.keys(contests).filter(key=>!isContestDeleted(key)).sort((a,b)=>String(contests[a]?.name||a).localeCompare(String(contests[b]?.name||b),'pt-BR'))[0];
              activeContest=nextId;localStorage.setItem('tce_active_contest',activeContest);
              let snapshot=null;try{snapshot=JSON.parse(localStorage.getItem('tce_contest_data_'+activeContest)||'null');}catch(e){}
              if(snapshot)restoreSnapshotToMemory(snapshot);else{masterEditalData=[];userProgress=[];studySessions=[];}
            }
            localStorage.setItem('tce_contests',JSON.stringify(contests));
            const cfg=contests[activeContest]||{};
            const nameInput=document.getElementById('contest-name');if(nameInput)nameInput.value=cfg.name||activeContest;
            const boardInput=document.getElementById('contest-board');if(boardInput)boardInput.value=cfg.board||'';
            const dateInput=document.getElementById('contest-date');if(dateInput)dateInput.value=cfg.date||'';
            renderContestSelector();initCronogramaFilters();initEditalFilters();initRegistrationForm();renderSessionsList();updateContestHeader();applyPriorityColors();renderRecentRotation();renderPriorityDisciplineProgress();renderDashboard();renderCustomization();
            saveData();
            showCustomDialog('Concurso excluído',`“${name}” foi removido. ${wasActive?'Outro concurso foi selecionado automaticamente. ':''}A exclusão será propagada durante a próxima sincronização.`);
          });
        }
        function saveCurrentContestSnapshot(id=activeContest, timestamp=new Date().toISOString()){
          try {
            const snapshot={contestName:contests[id]?.name||id,masterEditalData,userProgress,studySessions,prioritySettings:getPrioritySettings(),disciplineSettings:getDisciplineSettings(),suggestionMode:getSuggestionMode(),deleted:getTombstones(id),_snapshotUpdatedAt:timestamp};
            localStorage.setItem('tce_contest_data_'+id,JSON.stringify(snapshot));
            return snapshot;
          } catch(e) { console.warn('Não foi possível guardar o snapshot do concurso',id,e); return null; }
        }
        function restoreSnapshotToMemory(snapshot){
          if(!snapshot || typeof snapshot!=='object') return false;
          if(Array.isArray(snapshot.masterEditalData)) masterEditalData=snapshot.masterEditalData;
          if(Array.isArray(snapshot.userProgress)) userProgress=snapshot.userProgress;
          else if(Array.isArray(snapshot.masterEditalData)) userProgress=JSON.parse(JSON.stringify(snapshot.masterEditalData));
          if(Array.isArray(snapshot.studySessions)) studySessions=snapshot.studySessions;
          if(snapshot.deleted){
            const dead=unionTombstones(getTombstones(activeContest),snapshot.deleted);setTombstones(activeContest,dead);
            const di=new Set(dead.items),ds=new Set(dead.sessions);
            masterEditalData=masterEditalData.filter(x=>!di.has(String(x.id)));userProgress=userProgress.filter(x=>!di.has(String(x.id)));studySessions=studySessions.filter(x=>!ds.has(String(x.id)));
          }
          return true;
        }
        function changeContest(id){
          if(!id || isContestDeleted(id) || !contests[id] || id===activeContest) { renderContestSelector(); return; }
          const oldId=activeContest;
          saveCurrentContestSnapshot(oldId);
          activeContest=id;localStorage.setItem('tce_active_contest',id);
          const snap=localStorage.getItem('tce_contest_data_'+id);
          if(snap){try{restoreSnapshotToMemory(JSON.parse(snap));}catch(e){console.warn('Snapshot de concurso inválido',e);}}
          else {
            masterEditalData=[]; // concursos novos começam vazios, sem misturar os editais
            userProgress=JSON.parse(JSON.stringify(masterEditalData));studySessions=[];
          }
          localStorage.setItem('tce_contests',JSON.stringify(contests));
          const cfg=contests[id]||{name:id,board:'',date:''};
          document.getElementById('contest-name').value=cfg.name||id;document.getElementById('contest-board').value=cfg.board||'';document.getElementById('contest-date').value=cfg.date||'';
          renderContestSelector();initCronogramaFilters();initEditalFilters();renderSessionsList();updateContestHeader();applyPriorityColors();renderRecentRotation();renderPriorityDisciplineProgress();renderDashboard();renderCustomization();saveData();
          showCustomDialog('Concurso selecionado', 'Concurso ativo: '+(cfg.name||id)+'. Cada concurso mantém edital, progresso, histórico e personalizações separados.');
        }
        function saveContestSettings(){
          const name=document.getElementById('contest-name').value.trim()||'Novo concurso';
          contests[activeContest]={...(contests[activeContest]||{}),name,board:document.getElementById('contest-board').value.trim(),date:document.getElementById('contest-date').value,_updatedAt:new Date().toISOString()};
          localStorage.setItem('tce_contests',JSON.stringify(contests));
          renderContestSelector();updateContestHeader();saveData();
          showCustomDialog('Concurso salvo','Configurações básicas do concurso foram salvas.');
        }
        async function addContest(){
          const name=await promptAsync('Novo concurso','Nome do novo concurso');if(!name||!name.trim())return;
          const id='concurso-'+Date.now();contests[id]={name:name.trim(),board:'',date:'',_updatedAt:new Date().toISOString()};
          localStorage.setItem('tce_contests',JSON.stringify(contests));
          localStorage.setItem('tce_contest_data_'+id,JSON.stringify({masterEditalData:[],userProgress:[],studySessions:[],_snapshotUpdatedAt:new Date().toISOString()}));
          renderContestSelector();changeContest(id);
        }
        function renderPrioritySettings() {
          const settings=getPrioritySettings();
          const container=document.getElementById('priority-config-table');
          if(!container)return;
          container.innerHTML=Object.entries(settings).map(([key,cfg])=>`
            <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-900/40">
              <div class="flex items-center gap-2 mb-3"><span class="w-3 h-3 rounded-full" style="background:${cfg.color}"></span><strong class="text-sm">${key}</strong></div>
              <div class="grid grid-cols-[minmax(0,1fr)_54px] gap-2 items-end">
                <label class="text-xs font-semibold">Nome exibido<input data-priority-key="${key}" data-priority-field="label" value="${escapeHtml(cfg.label)}" class="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm dark:bg-slate-900 dark:border-slate-600"></label>
                <label class="text-xs font-semibold">Cor<input data-priority-key="${key}" data-priority-field="color" type="color" value="${cfg.color}" class="mt-1 w-full h-10 rounded border border-slate-300 p-1 bg-white"></label>
              </div>
              <label class="block text-xs font-semibold mt-3">Peso-base<input data-priority-key="${key}" data-priority-field="weight" type="number" min="0.1" max="20" step="0.1" value="${Number(cfg.weight)||1}" class="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm dark:bg-slate-900 dark:border-slate-600"></label>
              <p class="text-[10px] text-slate-500 mt-2">Peso maior aumenta a participação sugerida no ciclo de estudos.</p>
            </div>`).join('');
        }
        function savePrioritySettings() {
          const updated={};
          document.querySelectorAll('[data-priority-key]').forEach(el=>{
            const k=el.dataset.priorityKey, f=el.dataset.priorityField;
            if(!updated[k])updated[k]={};
            updated[k][f]=f==='weight'?Math.max(0.1,Math.min(20,Number(el.value)||1)):el.value;
          });
          const merged={...getPrioritySettings()};
          Object.keys(merged).forEach(k=>merged[k]={...merged[k],...(updated[k]||{})});
          localStorage.setItem('tce_'+activeContest+'_priority_settings',JSON.stringify(merged));
          applyPriorityColors();
          // Os pesos individuais são ajustados à nova prioridade apenas quando o campo ainda segue o peso anterior.
          renderCustomization(); saveData(); renderPriorityDisciplineProgress(); renderRecentRotation(); renderCronograma(); renderEditalVerticalizado();
          showCustomDialog('Parâmetros salvos','Rótulos, cores e pesos-base foram atualizados para este concurso.');
        }
        function recalculateDisciplineWeightsByPriority(){
          const p=getPrioritySettings();const dset=getDisciplineSettings();
          const disciplines=[...new Set(masterEditalData.map(x=>String(x.discipline||'').trim()).filter(Boolean))];
          disciplines.forEach(d=>{
            const current=dset[d]||{};const items=masterEditalData.filter(x=>x.discipline===d);
            const priority=current.priority||items[0]?.priority||'Amarela';
            const weight=Number(p[priority]?.weight)||1;
            dset[d]={...current,priority,weight};
            items.forEach(x=>{x.studyWeight=weight;x.priority=priority;});
            userProgress.filter(x=>x.discipline===d).forEach(x=>{x.studyWeight=weight;x.priority=priority;});
          });
          localStorage.setItem('tce_'+activeContest+'_discipline_settings',JSON.stringify(dset));
          saveData();renderCustomization();renderPriorityDisciplineProgress();renderRecentRotation();renderCronograma();renderEditalVerticalizado();
          showCustomDialog('Pesos recalculados','Cada disciplina recebeu o peso-base da sua prioridade. A participação percentual foi redistribuída automaticamente para totalizar 100%.');
        }

        function renderCustomization(){
          renderContestManager();
          renderPrioritySettings();
          const modeSelect=document.getElementById('study-suggestion-mode');if(modeSelect)modeSelect.value=getSuggestionMode();
          updateSuggestionModeHelp();
          const disciplines=[...new Set(masterEditalData.map(x=>String(x.discipline||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
          const saved=getDisciplineSettings();
          const ps=getPrioritySettings();
          const container=document.getElementById('discipline-custom-table');
          if(!container)return;
          if(!disciplines.length){container.innerHTML='<p class="p-4 text-sm text-slate-500">Nenhuma disciplina cadastrada. Adicione uma disciplina acima ou importe o edital.</p>';return;}
          let html=`<table class="w-full text-left text-xs border-collapse"><thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300"><tr><th class="p-3">Disciplina do edital</th><th class="p-3">Prioridade</th><th class="p-3">Grupo</th><th class="p-3 text-center">Peso relativo</th><th class="p-3 text-center">Participação automática</th><th class="p-3 text-center">Tópicos</th><th class="p-3 text-center">Ação</th></tr></thead><tbody>`;
          const records=[];
          disciplines.forEach(d=>{
            const items=masterEditalData.filter(x=>x.discipline===d);
            const current=saved[d]||{};
            const majority=items.reduce((best,x)=>{best[x.priority||'Amarela']=(best[x.priority||'Amarela']||0)+1;return best;},{});
            const priority=current.priority||Object.keys(majority).sort((a,b)=>majority[b]-majority[a])[0]||'Amarela';
            const group=current.group||((DEFAULT_DISCIPLINE_GROUPS.includes(d))?'Conhecimentos Gerais':'Conhecimentos Específicos');
            const weight=Number(current.weight??(ps[priority]?.weight||1));
            records.push({d,priority,group,weight,count:items.length});
          });
          const total=records.reduce((sum,x)=>sum+(Number(x.weight)||0),0)||1;
          records.forEach(row=>{
            const share=(Number(row.weight)||0)/total*100;
            html+=`<tr class="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/50">
              <td class="p-3 font-semibold text-slate-800 dark:text-slate-100 min-w-[220px]">${escapeHtml(row.d)}</td>
              <td class="p-2 min-w-[140px]"><select data-disc="${escapeHtml(row.d)}" data-field="priority" onchange="disciplinePriorityChanged(this)" class="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900">${Object.entries(ps).map(([key,cfg])=>`<option value="${key}" ${row.priority===key?'selected':''}>${escapeHtml(cfg.label)} (${key})</option>`).join('')}</select></td>
              <td class="p-2 min-w-[175px]"><select data-disc="${escapeHtml(row.d)}" data-field="group" onchange="updateWeightShares()" class="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"><option ${row.group==='Conhecimentos Gerais'?'selected':''}>Conhecimentos Gerais</option><option ${row.group==='Conhecimentos Específicos'?'selected':''}>Conhecimentos Específicos</option></select></td>
              <td class="p-2 min-w-[105px]"><input data-disc="${escapeHtml(row.d)}" data-field="weight" type="number" min="0.1" max="100" step="0.1" value="${row.weight}" oninput="updateWeightShares()" class="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-center bg-white dark:bg-slate-900"></td>
              <td class="p-3 text-center font-bold text-blue-700 dark:text-blue-300" data-share-for="${escapeHtml(row.d)}">${share.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})}%</td>
              <td class="p-3 text-center">${row.count}${itemsPlaceholder(row.d)}</td>
              <td class="p-2 text-center"><button data-disc="${escapeHtml(row.d)}" onclick="removeDisciplineFromContest(this.dataset.disc)" class="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold" title="Remover a disciplina e os tópicos do edital"><i class="fa-solid fa-trash-can mr-1"></i>Excluir</button></td>
            </tr>`;
          });
          html+='</tbody></table>';
          container.innerHTML=html;
          updateWeightShares();
          const cfg=contests[activeContest]||{name:DEFAULT_CONTEST_NAME,board:'',date:''};
          document.getElementById('contest-name').value=cfg.name||'';document.getElementById('contest-board').value=cfg.board||'';document.getElementById('contest-date').value=cfg.date||'';
          try{renderStudyTracksManager();}catch(err){console.warn(err);}
          function itemsPlaceholder(d){return masterEditalData.some(x=>x.discipline===d&&x.placeholder)?'<span class="block mt-1 text-[10px] text-amber-700">conferir/importar</span>':'';}
        }
        function updateWeightShares(){
          const fields=[...document.querySelectorAll('[data-field="weight"][data-disc]')];
          if(!fields.length)return;
          const vals=fields.map(el=>Math.max(0,Number(el.value)||0));const sum=vals.reduce((a,b)=>a+b,0);
          let displayed=0;
          fields.forEach((el,i)=>{
            const target=[...document.querySelectorAll('[data-share-for]')].find(node=>node.dataset.shareFor===el.dataset.disc);
            if(!target)return;
            let pct=0;
            if(sum>0){pct=i===fields.length-1?Math.max(0,Math.round((100-displayed)*10)/10):Math.round((vals[i]/sum*100)*10)/10;displayed+=pct;}
            target.textContent=pct.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%';
          });
          const el=document.getElementById('discipline-weight-summary');if(el)el.textContent='Peso total: '+(sum>0?'100%':'0%')+' · '+fields.length+' disciplinas';
        }
        function disciplinePriorityChanged(select){
          const disc=select.dataset.disc;const settings=getPrioritySettings();const weight=document.querySelector(`[data-disc="${CSS.escape(disc)}"][data-field="weight"]`);
          if(weight)weight.value=Number(settings[select.value]?.weight)||1;
          updateWeightShares();
        }
        function addDisciplineToContest(){
          const input=document.getElementById('new-discipline-name');const name=(input.value||'').trim();
          if(!name)return showCustomDialog('Informe a disciplina','Digite o nome da disciplina que deseja adicionar.');
          if(masterEditalData.some(x=>String(x.discipline||'').toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))){return showCustomDialog('Disciplina já existe','Esta disciplina já consta no Edital Verticalizado. Ela foi incluída na tabela de personalização automaticamente.');}
          const newItem={id:'custom_'+Date.now(),discipline:name,topic:'Conteúdo programático pendente de importação',subtopic:'Importe a planilha ou analise o edital oficial para detalhar esta disciplina.',priority:'Amarela',weight:'',studyWeight:Number(getPrioritySettings().Amarela.weight)||2,hours:0,questions:0,reviews:0,completed:false,notes:'Marcador provisório: confirmar tópicos no edital oficial.',placeholder:true};
          masterEditalData.push(newItem);userProgress.push({...newItem});
          const ds=getDisciplineSettings();ds[name]={priority:'Amarela',group:DEFAULT_DISCIPLINE_GROUPS.includes(name)?'Conhecimentos Gerais':'Conhecimentos Específicos',weight:Number(getPrioritySettings().Amarela.weight)||2};
          localStorage.setItem('tce_'+activeContest+'_discipline_settings',JSON.stringify(ds));input.value='';
          saveData();initCronogramaFilters();initEditalFilters();renderSessionsList();renderPriorityDisciplineProgress();renderDashboard();renderCustomization();
          showCustomDialog('Disciplina adicionada','A disciplina foi criada com um marcador provisório. Importe/analyse o edital para substituir o marcador pelos tópicos oficiais.');
        }
        function removeDisciplineFromContest(discipline){
          const count=masterEditalData.filter(x=>x.discipline===discipline).length;
          showCustomDialog('Excluir disciplina?',`Serão removidos ${count} tópico(s) de “${discipline}” do edital verticalizado e do cronograma. Os lançamentos históricos de estudo serão preservados. Esta ação não pode ser desfeita sem backup.`, 'fa-solid fa-triangle-exclamation',()=>{
            addTombstones('items',masterEditalData.filter(x=>x.discipline===discipline).map(x=>x.id));
            masterEditalData=masterEditalData.filter(x=>x.discipline!==discipline);
            userProgress=userProgress.filter(x=>x.discipline!==discipline);
            const cfg=getDisciplineSettings();delete cfg[discipline];localStorage.setItem('tce_'+activeContest+'_discipline_settings',JSON.stringify(cfg));
            saveData();initCronogramaFilters();initEditalFilters();renderSessionsList();renderRecentRotation();renderPriorityDisciplineProgress();renderDashboard();renderCustomization();
            showCustomDialog('Disciplina removida','A disciplina foi retirada do edital e do cronograma. O histórico de sessões foi mantido.');
          });
        }
        function saveDisciplineCustomizations(){
          const rows=[...document.querySelectorAll('[data-field="priority"][data-disc]')];
          const settings=getDisciplineSettings();
          rows.forEach(sel=>{
            const d=sel.dataset.disc,priority=sel.value;
            const group=document.querySelector(`[data-disc="${CSS.escape(d)}"][data-field="group"]`)?.value||'Conhecimentos Específicos';
            const weight=Math.max(0.1,Number(document.querySelector(`[data-disc="${CSS.escape(d)}"][data-field="weight"]`)?.value)||1);
            settings[d]={priority,group,weight};
            masterEditalData.filter(x=>x.discipline===d).forEach(x=>{x.priority=priority;x.studyWeight=weight;x.group=group;});
            userProgress.filter(x=>x.discipline===d).forEach(x=>{x.priority=priority;x.studyWeight=weight;x.group=group;});
          });
          localStorage.setItem('tce_'+activeContest+'_discipline_settings',JSON.stringify(settings));
          localStorage.setItem('tce_'+activeContest+'_discipline_custom',JSON.stringify(masterEditalData));
          saveData();initCronogramaFilters();initEditalFilters();renderPriorityDisciplineProgress();renderRecentRotation();renderDashboard();applyPriorityColors();
          showCustomDialog('Personalizações salvas','Disciplinas, prioridades, grupos e pesos foram salvos. A participação percentual é calculada automaticamente pela soma dos pesos relativos.');
        }
