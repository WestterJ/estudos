// 02-sugestoes.js — Utilitários de data/sessão, trilhas de estudo e sugestão do próximo estudo.
// Planejador de Estudos V10.9 (ver ARQUITETURA.md). Scripts clássicos compartilham o escopo global: a ORDEM de carga em index.html importa.
        // Renderização da seção de Últimas Disciplinas Estudadas (Rotação)
        function parseBRDate(value) {
            if (!value) return new Date(0);
            const raw=String(value).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + 'T12:00:00');
            const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
            if(br) return new Date(Number(br[3]),Number(br[2])-1,Number(br[1]),br[4]===undefined?12:Number(br[4]),br[5]===undefined?0:Number(br[5]),br[6]===undefined?0:Number(br[6]),br[7]===undefined?0:Number(String(br[7]).padEnd(3,'0')));
            const isoLocal=raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
            if(isoLocal) return new Date(Number(isoLocal[1]),Number(isoLocal[2])-1,Number(isoLocal[3]),Number(isoLocal[4]),Number(isoLocal[5]),isoLocal[6]===undefined?0:Number(isoLocal[6]),isoLocal[7]===undefined?0:Number(String(isoLocal[7]).padEnd(3,'0')));
            return new Date(raw);
        }
        // V10.38 — critério único de sequência: DATA + HORA do estudo.
        // A hora vem de `session.time` (HH:MM, campo "Hora do estudo"); se a data já trouxer hora, ela tem precedência.
        // Em registros antigos sem hora, usa-se a hora de gravação (createdAt) apenas se foi gravado no mesmo dia do estudo.
        // Registros sem hora conhecida ficam antes dos que têm hora no mesmo dia; entre si, vale a ordem de gravação.
        function normalizeTimeHM(value) {
            const m=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
            if(!m) return '';
            const h=Number(m[1]),mi=Number(m[2]);
            return h>23||mi>59 ? '' : String(h).padStart(2,'0')+':'+m[2];
        }
        function nowTimeHM() {
            const d=new Date();
            return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
        }
        function getSessionSortInfo(session) {
            const rawDate=String(session?.date||'').trim();
            const parsed=parseBRDate(rawDate);
            if(!Number.isFinite(parsed.getTime())||parsed.getTime()===0) return {day:0,clock:null};
            const day=new Date(parsed.getFullYear(),parsed.getMonth(),parsed.getDate()).getTime();
            const toClock=d=>((d.getHours()*60+d.getMinutes())*60+d.getSeconds())*1000+d.getMilliseconds();
            const hasDateTime=/^(?:\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}/.test(rawDate);
            let clock=null;
            if(hasDateTime) {
                clock=toClock(parsed);
            } else {
                const explicit=normalizeTimeHM(session?.time||session?.hour);
                if(explicit) {
                    const [h,m]=explicit.split(':').map(Number);
                    clock=(h*60+m)*60000;
                } else {
                    const recorded=session?.createdAt||session?.created_at||session?.recordedAt||session?.timestamp;
                    if(recorded) {
                        const d=new Date(recorded);
                        if(Number.isFinite(d.getTime())&&d.getFullYear()===parsed.getFullYear()&&d.getMonth()===parsed.getMonth()&&d.getDate()===parsed.getDate()) clock=toClock(d);
                    }
                }
            }
            return {day,clock};
        }
        function getSessionsNewestFirst() {
            const rows=studySessions.map((x,index)=>({x,index,info:getSessionSortInfo(x)}));
            rows.sort((a,b)=>b.info.day-a.info.day||((b.info.clock===null?-1:b.info.clock)-(a.info.clock===null?-1:a.info.clock))||a.index-b.index);
            return rows.map(row=>row.x);
        }
        // Instante do estudo (data + hora) em milissegundos; 0 se a data for inválida.
        function getSessionTimestamp(session) {
            const info=getSessionSortInfo(session);
            return info.day ? info.day+(info.clock||0) : 0;
        }
        // Hora a exibir: só quando foi informada de fato (campo Hora ou data com hora). Registros antigos mostram só a data.
        function getSessionTimeLabel(session) {
            const m=String(session?.date||'').match(/[ T](\d{2}):(\d{2})/);
            if(m) return m[1]+':'+m[2];
            return normalizeTimeHM(session?.time||session?.hour);
        }
        function formatSessionWhen(session) {
            const day=String(session?.date||'').trim().split(/[ T]/)[0];
            const t=getSessionTimeLabel(session);
            return day+(t?' · '+t:'');
        }
        function localTodayISO() {
            const d=new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
        function dateToInputValue(value) {
            if(/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return String(value);
            const d=parseBRDate(value);
            if(Number.isNaN(d.getTime()) || d.getTime()===0) return localTodayISO();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
        function dateToBR(value) {
            const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date().toLocaleDateString('pt-BR');
        }
        function isRevisionSession(session) {
            // Compatível com os registros antigos que usavam o campo isReview.
            return !!session && (String(session.type2||'')==='Revisão' || Number(session.isReview)===1);
        }
        function sessionMatchesTopic(session,item) {
            if(!session || !item) return false;
            if(session.itemId && item.id && session.itemId===item.id) return true;
            return String(session.discipline||'')===String(item.discipline||'') && String(session.topic||'')===String(item.topic||'') && String(session.subtopic||'')===String(item.subtopic||'');
        }
        function getStudyTracks() {
            return [...new Set(studySessions.map(s=>String(s.studyTrack||'Trilha não informada').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
        }
        function getSuggestionMode() {
            const value=localStorage.getItem('tce_'+activeContest+'_suggestion_mode');
            return ['priority_first','priority_progress','priority_date'].includes(value) ? value : 'priority_progress';
        }
        function updateSuggestionModeHelp() {
            const select=document.getElementById('study-suggestion-mode');
            const help=document.getElementById('study-suggestion-help');
            if(!select) return;
            const mode=select.value;
            const text=mode==='priority_first'
              ? 'A recomendação fica na prioridade mais alta com tópicos pendentes; só avança quando ela não tiver mais pendências.'
              : mode==='priority_date'
                ? 'Dentro de cada prioridade, recomenda primeiro a disciplina há mais tempo sem estudo. Disciplinas nunca estudadas vêm antes das demais.'
                : 'Dentro de cada prioridade, recomenda primeiro as disciplinas com menor percentual concluído; em empate, evita repetir as estudadas recentemente.';
            if(help) help.textContent=text;
        }
        function saveSuggestionMode() {
            const select=document.getElementById('study-suggestion-mode');
            if(!select) return;
            const mode=['priority_first','priority_progress','priority_date'].includes(select.value)?select.value:'priority_progress';
            localStorage.setItem('tce_'+activeContest+'_suggestion_mode',mode);
            saveData();
            updateSuggestionModeHelp();
            renderRecentRotation();
            showCustomDialog('Estratégia salva',mode==='priority_first'
              ? 'A recomendação ficará concentrada na prioridade mais alta até não haver tópicos pendentes nela.'
              : mode==='priority_date'
                ? 'Dentro de cada prioridade, serão recomendadas primeiro as disciplinas há mais tempo sem estudo; as nunca estudadas vêm primeiro.'
                : 'Dentro de cada prioridade, serão recomendadas primeiro as disciplinas com menor percentual concluído.');
        }
        function getStudySuggestionCandidates() {
            const sorted = getSessionsNewestFirst().filter(session=>!isRevisionSession(session));
            const prioritySettings = getPrioritySettings();
            const priorityOrder = Object.keys(prioritySettings).sort((a,b) => (Number(prioritySettings[b].weight)||1) - (Number(prioritySettings[a].weight)||1));
            const priorityRank = Object.fromEntries(priorityOrder.map((priority,index) => [priority,index]));
            const grouped = new Map();
            masterEditalData.forEach(topic => {
                if (!grouped.has(topic.discipline)) grouped.set(topic.discipline, []);
                grouped.get(topic.discipline).push(topic);
            });
            let candidates = [...grouped.entries()].map(([discipline, topics]) => {
                const vals = topics.map(topic => userProgress.find(u => u.id === topic.id) || topic);
                const done = vals.filter(value => !!value.completed).length;
                const pendingTopics = topics.filter(topic => !(userProgress.find(u => u.id === topic.id) || topic).completed);
                const pendingPriorities = pendingTopics.map(topic => topic.priority || 'Amarela');
                const priority = pendingPriorities.sort((a,b) => (priorityRank[a] ?? 99) - (priorityRank[b] ?? 99))[0] || topics[0]?.priority || 'Amarela';
                const lastSession = sorted.find(session => session.discipline === discipline);
                const lastDate = lastSession?.date || '';
                const lastTrack = lastSession?.studyTrack || (lastSession ? 'Trilha não informada' : '');
                const lastTopic = lastSession ? (masterEditalData.find(topic => sessionMatchesTopic(lastSession, topic)) || topics.find(topic => topic.topic === lastSession.topic && topic.subtopic === (lastSession.subtopic || '')) || null) : null;
                // V10.34 — a nota é a da própria sessão mais recente da disciplina (cada registro tem a sua).
                const lastNote = lastSession ? getSessionNote(lastSession) : '';
                const lastTimestamp = lastSession ? getSessionTimestamp(lastSession) : 0; // V10.38: data + hora
                const lastTime = lastSession ? getSessionTimeLabel(lastSession) : '';
                const hours = vals.reduce((sum,value) => sum + (Number(value.hours)||0), 0);
                const questions = vals.reduce((sum,value) => sum + (Number(value.questions)||0), 0);
                return {
                    discipline, topics, done,
                    pct: topics.length ? Math.round(done/topics.length*100) : 0,
                    priority, rank: priorityRank[priority] ?? 99,
                    pending: pendingTopics.length, hours, questions, lastDate, lastTime, lastTrack, lastNote, lastTimestamp
                };
            }).filter(item => item.pending > 0);

            if (!candidates.length) return [];
            const mode = getSuggestionMode();
            if (mode === 'priority_first') {
                const highest = Math.min(...candidates.map(item => item.rank));
                candidates = candidates.filter(item => item.rank === highest);
            }
            if (mode === 'priority_date') {
                // Dentro de cada prioridade, disciplinas nunca estudadas (data 0) e as mais antigas vêm primeiro.
                candidates.sort((a,b) => a.rank-b.rank || a.lastTimestamp-b.lastTimestamp || a.discipline.localeCompare(b.discipline,'pt-BR'));
            } else {
                candidates.sort((a,b) => a.rank-b.rank || a.pct-b.pct || Number(!!a.lastDate)-Number(!!b.lastDate) || a.lastTimestamp-b.lastTimestamp || a.discipline.localeCompare(b.discipline,'pt-BR'));
            }
            return candidates;
        }
        function getNextStudyRecommendation() {
            return getStudySuggestionCandidates()[0] || null;
        }
        function applyStudyRecommendation() {
            const item=getNextStudyRecommendation();
            if(!item||!document.getElementById('reg-discipline')) return;
            prefillStudyForm(item.discipline);
        }
