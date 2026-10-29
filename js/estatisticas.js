// estatisticas.js — Estatísticas gerais e semanais por disciplina, agrupadas pela prioridade principal.
// Carregado antes de 12-iniciar.js para manter as funções globais disponíveis para a navegação.
(function () {
    'use strict';

    function statsWeekBounds(referenceDate = new Date()) {
        const start = new Date(referenceDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { start, end };
    }

    function statsFormatMinutes(minutes, compact = false) {
        const total = Math.max(0, Math.round(Number(minutes) || 0));
        const hours = Math.floor(total / 60);
        const rest = total % 60;
        if (compact) return `${hours}h ${String(rest).padStart(2, '0')}m`;
        return `${hours}h ${String(rest).padStart(2, '0')}m`;
    }

    function statsFormatDate(date) {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }

    function statsNormalize(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
    }

    function statsEmpty() {
        return {
            totalMinutes: 0, totalStudies: 0, totalReviews: 0, totalQuestions: 0,
            weekMinutes: 0, weekStudies: 0, weekReviews: 0, weekQuestions: 0,
            _progressMinutes: 0, _progressQuestions: 0, _progressReviews: 0,
            _sessionMinutes: 0, _sessionQuestions: 0, _sessionReviews: 0
        };
    }

    function statsAddSession(target, session, isWeek) {
        const minutes = Math.max(0, Number(session.minutes) || 0);
        const questions = Math.max(0, Number(session.questions) || 0);
        const isReview = typeof isRevisionSession === 'function'
            ? isRevisionSession(session)
            : (session.type2 === 'Revisão' || Number(session.isReview) === 1);

        target._sessionMinutes += minutes;
        target._sessionQuestions += questions;
        if (isReview) target._sessionReviews++;
        else target.totalStudies++;

        if (isWeek) {
            target.weekMinutes += minutes;
            target.weekQuestions += questions;
            if (isReview) target.weekReviews++;
            else target.weekStudies++;
        }
    }

    function buildStatisticsModel() {
        const pSettings = typeof getPrioritySettings === 'function' ? getPrioritySettings() : {
            Vermelha: { label: 'Alta', color: '#dc2626', weight: 3 },
            Amarela: { label: 'Média', color: '#d97706', weight: 2 },
            Verde: { label: 'Baixa / revisão', color: '#059669', weight: 1 }
        };
        const priorityOrder = Object.keys(pSettings).sort((a, b) => (Number(pSettings[b].weight) || 1) - (Number(pSettings[a].weight) || 1));
        const priorityRank = new Map(priorityOrder.map((key, index) => [key, index]));
        const topics = Array.isArray(masterEditalData) ? masterEditalData : [];
        const sessions = Array.isArray(studySessions) ? studySessions : [];
        const progressEntries = Array.isArray(userProgress) ? userProgress : [];
        const week = statsWeekBounds();
        const byDiscipline = new Map();
        const topicById = new Map(topics.map(topic => [String(topic.id), topic]));
        const progressById = new Map(progressEntries.filter(item => item && item.id != null).map(item => [String(item.id), item]));
        const topicPriorityByDiscipline = new Map();

        // A disciplina aparece uma vez na tabela, no grupo da prioridade mais alta
        // atribuída a qualquer tópico dela. Os acumulados incluem todos os registros da disciplina.
        topics.forEach(topic => {
            const discipline = String(topic.discipline || '').trim();
            if (!discipline) return;
            const priority = String(topic.priority || 'Amarela');
            if (!topicPriorityByDiscipline.has(discipline)) {
                topicPriorityByDiscipline.set(discipline, priority);
            } else {
                const current = topicPriorityByDiscipline.get(discipline);
                if ((priorityRank.get(priority) ?? 999) < (priorityRank.get(current) ?? 999)) {
                    topicPriorityByDiscipline.set(discipline, priority);
                }
            }
        });

        const getOrCreateDiscipline = (discipline, priority = null) => {
            const name = String(discipline || 'Sem disciplina').trim() || 'Sem disciplina';
            if (!byDiscipline.has(name)) {
                byDiscipline.set(name, {
                    discipline: name,
                    priority: priority || topicPriorityByDiscipline.get(name) || null,
                    ...statsEmpty()
                });
            } else if (!byDiscipline.get(name).priority && priority) {
                byDiscipline.get(name).priority = priority;
            }
            return byDiscipline.get(name);
        };

        // Use os acumulados já guardados no progresso para preservar dados históricos
        // que possam existir antes do histórico detalhado de sessões.
        topics.forEach(topic => {
            const discipline = String(topic.discipline || '').trim();
            if (!discipline) return;
            const target = getOrCreateDiscipline(discipline, topicPriorityByDiscipline.get(discipline) || String(topic.priority || 'Amarela'));
            const progress = progressById.get(String(topic.id)) || topic;
            target._progressMinutes += Math.max(0, Number(progress.hours) || 0) * 60;
            target._progressQuestions += Math.max(0, Number(progress.questions) || 0);
            target._progressReviews += Math.max(0, Number(progress.reviews) || 0);
        });

        // Inclua registros de progresso órfãos (por exemplo, tópicos removidos do edital)
        // sem duplicar os tópicos que já foram contabilizados acima.
        progressEntries.forEach(progress => {
            if (!progress || progress.id == null || topicById.has(String(progress.id))) return;
            const discipline = String(progress.discipline || '').trim();
            if (!discipline) return;
            const target = getOrCreateDiscipline(discipline, progress.priority ? String(progress.priority) : null);
            target._progressMinutes += Math.max(0, Number(progress.hours) || 0) * 60;
            target._progressQuestions += Math.max(0, Number(progress.questions) || 0);
            target._progressReviews += Math.max(0, Number(progress.reviews) || 0);
        });

        sessions.forEach(session => {
            let topic = session.itemId ? topicById.get(String(session.itemId)) : null;
            if (!topic && typeof sessionMatchesTopic === 'function') {
                topic = topics.find(candidate => sessionMatchesTopic(session, candidate)) || null;
            }
            const discipline = String(topic?.discipline || session.discipline || 'Sem disciplina').trim() || 'Sem disciplina';
            const target = getOrCreateDiscipline(discipline, topic?.priority ? String(topic.priority) : null);
            const sessionDate = typeof parseBRDate === 'function' ? parseBRDate(session.date) : new Date(session.date);
            const isWeek = Number.isFinite(sessionDate.getTime()) && sessionDate.getTime() > 0 && sessionDate >= week.start && sessionDate < week.end;
            statsAddSession(target, session, isWeek);
        });

        const general = statsEmpty();
        byDiscipline.forEach(item => {
            // Escolhe o acumulado maior entre progresso e histórico, evitando duplicação
            // quando os dois já representam os mesmos registros e evitando perder dados antigos.
            item.totalMinutes = Math.max(Math.round(item._progressMinutes), Math.round(item._sessionMinutes));
            item.totalQuestions = Math.max(Math.round(item._progressQuestions), Math.round(item._sessionQuestions));
            item.totalReviews = Math.max(Math.round(item._progressReviews), Math.round(item._sessionReviews));
            delete item._progressMinutes;
            delete item._progressQuestions;
            delete item._progressReviews;
            delete item._sessionMinutes;
            delete item._sessionQuestions;
            delete item._sessionReviews;

            general.totalMinutes += item.totalMinutes;
            general.totalStudies += item.totalStudies;
            general.totalReviews += item.totalReviews;
            general.totalQuestions += item.totalQuestions;
            general.weekMinutes += item.weekMinutes;
            general.weekStudies += item.weekStudies;
            general.weekReviews += item.weekReviews;
            general.weekQuestions += item.weekQuestions;
        });

        const groups = priorityOrder.map(priority => ({
            priority,
            label: `Prioridade ${pSettings[priority]?.label || priority}`,
            color: pSettings[priority]?.color || '#64748b',
            weight: Number(pSettings[priority]?.weight) || 1,
            items: []
        }));
        const unassigned = { priority: '__sem_prioridade__', label: 'Sem prioridade definida', color: '#64748b', weight: 0, items: [] };

        [...byDiscipline.values()].forEach(item => {
            const group = groups.find(candidate => candidate.priority === item.priority);
            if (group) group.items.push(item);
            else unassigned.items.push(item);
        });
        groups.forEach(group => group.items.sort((a, b) => a.discipline.localeCompare(b.discipline, 'pt-BR')));
        unassigned.items.sort((a, b) => a.discipline.localeCompare(b.discipline, 'pt-BR'));
        if (unassigned.items.length) groups.push(unassigned);

        return { general, groups, week };
    }

    function statsSubjectRowHtml(item, group, index) {
        const name = escapeHtml(item.discipline);
        const safePriority = escapeHtml(group.priority);
        const generalHours = statsFormatMinutes(item.totalMinutes, true);
        const weekHours = statsFormatMinutes(item.weekMinutes, true);
        const escapedName = escapeHtml(statsNormalize(item.discipline));
        return `<tr class="study-stats-subject-row" data-name="${escapedName}" data-priority="${safePriority}"
            data-week-minutes="${item.weekMinutes}" data-week-studies="${item.weekStudies}" data-week-reviews="${item.weekReviews}" data-week-questions="${item.weekQuestions}">
            <td><div class="study-stats-subject-cell"><span class="study-stats-subject-icon"><i class="fa-solid fa-book-open"></i></span><div class="min-w-0"><div class="study-stats-subject-name">${name}</div>
            <div class="study-stats-subject-total"><span class="study-stats-general-label">Geral</span><span><i class="fa-regular fa-clock"></i> <b>${generalHours}</b></span><span><i class="fa-solid fa-book-open"></i> <b>${item.totalStudies}</b> estudos</span><span><i class="fa-solid fa-rotate"></i> <b>${item.totalReviews}</b> revisões</span><span><i class="fa-solid fa-list-check"></i> <b>${item.totalQuestions}</b> questões</span></div>
            </div></div></td>
            <td class="study-stats-week-hours">${weekHours}</td>
            <td><span class="study-stats-count ${item.weekStudies ? '' : 'is-zero'}">${item.weekStudies}</span></td>
            <td><span class="study-stats-count is-revision ${item.weekReviews ? '' : 'is-zero'}">${item.weekReviews}</span></td>
            <td class="study-stats-week-questions ${item.weekQuestions ? '' : 'is-zero-text'}">${item.weekQuestions}</td>
        </tr>`;
    }

    function renderStudyStatistics() {
        const root = document.getElementById('content-estatisticas');
        if (!root) return;
        const model = buildStatisticsModel();
        const { general, groups, week } = model;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setText('statistics-total-hours', statsFormatMinutes(general.totalMinutes, true));
        setText('statistics-total-studies', String(general.totalStudies));
        setText('statistics-total-reviews', String(general.totalReviews));
        setText('statistics-total-questions', String(general.totalQuestions));
        // Cartões de desempenho semanal: valores baseados apenas nas sessões datadas da semana atual.
        setText('statistics-week-hours', statsFormatMinutes(general.weekMinutes, true));
        setText('statistics-week-studies', String(general.weekStudies));
        setText('statistics-week-reviews', String(general.weekReviews));
        setText('statistics-week-questions', String(general.weekQuestions));
        const weekLastDay = new Date(week.end.getTime() - 86400000);
        const startLabel = week.start.getFullYear() === weekLastDay.getFullYear()
            ? statsFormatDate(week.start)
            : week.start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        setText('statistics-week-range', `Semana atual: ${startLabel} – ${weekLastDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);

        const body = document.getElementById('statistics-table-body');
        if (!body) return;
        body.innerHTML = groups.map((group, groupIndex) => {
            if (!group.items.length) return '';
            const key = escapeHtml(group.priority);
            const color = escapeHtml(group.color);
            return `<tr class="study-stats-priority-band" data-priority="${key}" style="--stats-priority-color:${color}"><td colspan="5"><span class="study-stats-priority-dot" aria-hidden="true"></span><span class="study-stats-priority-title">${escapeHtml(group.label)}</span><span class="study-stats-priority-meta">${group.items.length} ${group.items.length === 1 ? 'disciplina' : 'disciplinas'}</span></td></tr>${group.items.map((item, index) => statsSubjectRowHtml(item, group, index)).join('')}`;
        }).join('');

        const search = document.getElementById('statistics-discipline-search');
        filterStudyStatistics(search ? search.value : (window._studyStatsSearch || ''));
    }

    function filterStudyStatistics(value) {
        window._studyStatsSearch = String(value || '');
        const query = statsNormalize(value);
        const body = document.getElementById('statistics-table-body');
        if (!body) return;
        let visibleRows = 0;
        let visibleGroups = 0;
        const totals = { minutes: 0, studies: 0, reviews: 0, questions: 0 };

        body.querySelectorAll('.study-stats-priority-band').forEach(band => {
            let groupRows = 0;
            let row = band.nextElementSibling;
            while (row && !row.classList.contains('study-stats-priority-band')) {
                if (row.classList.contains('study-stats-subject-row')) {
                    const visible = !query || (row.dataset.name || '').includes(query);
                    row.hidden = !visible;
                    if (visible) {
                        visibleRows++;
                        groupRows++;
                        totals.minutes += Number(row.dataset.weekMinutes) || 0;
                        totals.studies += Number(row.dataset.weekStudies) || 0;
                        totals.reviews += Number(row.dataset.weekReviews) || 0;
                        totals.questions += Number(row.dataset.weekQuestions) || 0;
                    }
                }
                row = row.nextElementSibling;
            }
            band.hidden = groupRows === 0;
            if (groupRows) {
                visibleGroups++;
                const count = band.querySelector('.study-stats-priority-meta');
                if (count) count.textContent = `${groupRows} ${groupRows === 1 ? 'disciplina' : 'disciplinas'}`;
            }
        });

        const empty = document.getElementById('statistics-empty-state');
        if (empty) empty.hidden = visibleRows !== 0;
        const visibleCount = document.getElementById('statistics-visible-count');
        if (visibleCount) visibleCount.textContent = `${visibleRows} ${visibleRows === 1 ? 'disciplina' : 'disciplinas'} em ${visibleGroups} ${visibleGroups === 1 ? 'prioridade' : 'prioridades'}`;
        const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        setText('statistics-week-total-hours', statsFormatMinutes(totals.minutes, true));
        setText('statistics-week-total-studies', String(totals.studies));
        setText('statistics-week-total-reviews', String(totals.reviews));
        setText('statistics-week-total-questions', String(totals.questions));
    }

    // Exposição intencional de duas funções para a navegação e o campo de busca do HTML.
    window.renderStudyStatistics = renderStudyStatistics;
    window.filterStudyStatistics = filterStudyStatistics;
})();
