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

    // Semana selecionada na tela. Por padrão, começa na semana atual (segunda-feira).
    let selectedWeekStart = statsWeekBounds(new Date()).start;

    function statsDateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function statsDateFromKey(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isFinite(date.getTime()) ? date : null;
    }

    function statsParseSessionDate(session) {
        const value = session && session.date;
        return typeof parseBRDate === 'function' ? parseBRDate(value) : new Date(value);
    }

    function statsWeekRangeLabel(weekStart) {
        const bounds = statsWeekBounds(weekStart);
        const lastDay = new Date(bounds.end.getTime() - 86400000);
        const startLabel = bounds.start.getFullYear() === lastDay.getFullYear()
            ? statsFormatDate(bounds.start)
            : bounds.start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `${startLabel} – ${lastDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }

    function initializeStatisticsWeekPicker() {
        const picker = document.getElementById('statistics-week-picker');
        if (!picker) return;
        const sessions = Array.isArray(studySessions) ? studySessions : [];
        const validDates = sessions.map(statsParseSessionDate).filter(date => date && Number.isFinite(date.getTime()) && date.getTime() > 0);
        const currentStart = statsWeekBounds(new Date()).start;
        let firstStart = currentStart;
        if (validDates.length) {
            const earliest = validDates.reduce((min, date) => date < min ? date : min, validDates[0]);
            firstStart = statsWeekBounds(earliest).start;
            if (firstStart > currentStart) firstStart = currentStart;
        }

        const weeks = [];
        for (let cursor = new Date(firstStart); cursor <= currentStart; cursor.setDate(cursor.getDate() + 7)) {
            weeks.push(new Date(cursor));
        }
        // Mantém disponível uma semana selecionada fora do intervalo calculado, por segurança.
        if (!weeks.some(week => statsDateKey(week) === statsDateKey(selectedWeekStart))) weeks.push(new Date(selectedWeekStart));
        weeks.sort((a, b) => b - a);
        picker.innerHTML = weeks.map(week => {
            const key = statsDateKey(week);
            const current = key === statsDateKey(currentStart);
            const label = `${statsWeekRangeLabel(week)}${current ? ' (semana atual)' : ''}`;
            return `<option value="${key}">${escapeHtml(label)}</option>`;
        }).join('');
        picker.value = statsDateKey(selectedWeekStart);
        if (!picker.value) {
            selectedWeekStart = new Date(currentStart);
            picker.value = statsDateKey(selectedWeekStart);
        }
    }

    function changeStatisticsWeek(value) {
        const date = statsDateFromKey(value);
        if (!date) return;
        selectedWeekStart = statsWeekBounds(date).start;
        renderStudyStatistics();
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

    function buildStatisticsModel(weekStart = selectedWeekStart) {
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
        const week = statsWeekBounds(weekStart);
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
            const sessionDate = statsParseSessionDate(session);
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


    const STATS_CHART_COLORS = ['#2f80ed', '#23b26d', '#ff9f43', '#8b5cf6', '#e85d75', '#0891b2', '#d3a51e'];

    function statsShortWeekLabel(weekStart) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return { start: statsFormatDate(weekStart), end: statsFormatDate(weekEnd), title: statsWeekRangeLabel(weekStart) };
    }

    function statsBuildWeeklySeries(weekStart, count = 9) {
        const sessions = Array.isArray(studySessions) ? studySessions : [];
        const end = statsWeekBounds(weekStart).start;
        const first = new Date(end);
        first.setDate(first.getDate() - 7 * (count - 1));
        const weeks = [];
        for (let i = 0; i < count; i++) {
            const start = new Date(first);
            start.setDate(start.getDate() + i * 7);
            const next = new Date(start);
            next.setDate(next.getDate() + 7);
            const label = statsShortWeekLabel(start);
            weeks.push({ start, next, dateKey: statsDateKey(start), label: label.start, endLabel: label.end, title: label.title, studies: 0, reviews: 0, questions: 0, minutes: 0 });
        }
        const byKey = new Map(weeks.map(week => [week.dateKey, week]));
        sessions.forEach(session => {
            const date = statsParseSessionDate(session);
            if (!date || !Number.isFinite(date.getTime()) || date.getTime() <= 0) return;
            const weekKey = statsDateKey(statsWeekBounds(date).start);
            const week = byKey.get(weekKey);
            if (!week) return;
            const isReview = typeof isRevisionSession === 'function'
                ? isRevisionSession(session)
                : (session.type2 === 'Revisão' || Number(session.isReview) === 1);
            if (isReview) week.reviews++;
            else week.studies++;
            week.minutes += Math.max(0, Number(session.minutes) || 0);
            week.questions += Math.max(0, Number(session.questions) || 0);
        });
        return weeks;
    }

    function statsChartEmpty(message = 'Sem registros para exibir neste período.') {
        return `<div class="stats-chart-empty"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i><span>${escapeHtml(message)}</span></div>`;
    }

    function statsBarChartHtml(items, valueKey, color, valueFormatter = value => String(value), label = 'Valores') {
        if (!items.length || !items.some(item => (Number(item[valueKey]) || 0) > 0)) return statsChartEmpty();
        const max = Math.max(1, ...items.map(item => Number(item[valueKey]) || 0));
        const columns = items.map(item => {
            const value = Math.max(0, Number(item[valueKey]) || 0);
            const height = value ? Math.max(3, value / max * 100) : 0;
            const name = item.title || item.label || '';
            return `<div class="stats-bar-column" title="${escapeHtml(name)}: ${escapeHtml(valueFormatter(value))}" aria-label="${escapeHtml(name)}: ${escapeHtml(valueFormatter(value))}">
                <span class="stats-bar-value" style="--bar-height:${height}%">${escapeHtml(valueFormatter(value))}</span>
                <div class="stats-bar-track"><span class="stats-bar-fill" style="--bar-height:${height}%;--bar-color:${color}"></span></div>
                <span class="stats-bar-xlabel"><b>${escapeHtml(item.label || '')}</b><small>${escapeHtml(item.endLabel || '')}</small></span>
            </div>`;
        }).join('');
        return `<div class="stats-bar-chart" role="img" aria-label="${escapeHtml(label)}"><div class="stats-bar-plot" style="--stats-bar-count:${items.length}">${columns}</div></div>`;
    }

    function statsLineChartHtml(items, valueKey, color, valueFormatter = value => String(value), label = 'Evolução semanal') {
        if (!items.length || !items.some(item => (Number(item[valueKey]) || 0) > 0)) return statsChartEmpty();
        const width = 640, height = 230, left = 42, right = 16, top = 26, bottom = 48;
        const plotWidth = width - left - right, plotHeight = height - top - bottom;
        const values = items.map(item => Math.max(0, Number(item[valueKey]) || 0));
        const maxValue = Math.max(1, ...values);
        const tickStep = maxValue <= 4 ? 1 : Math.ceil(maxValue / 4);
        const axisMax = Math.max(tickStep, Math.ceil(maxValue / tickStep) * tickStep);
        const x = index => left + (items.length === 1 ? plotWidth / 2 : index * plotWidth / (items.length - 1));
        const y = value => top + plotHeight - (value / axisMax) * plotHeight;
        let grid = '';
        for (let tick = 0; tick <= axisMax; tick += tickStep) {
            const yy = y(tick);
            grid += `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="stats-svg-grid"/><text x="${left-9}" y="${yy+4}" text-anchor="end" class="stats-svg-axis-label">${escapeHtml(valueFormatter(tick))}</text>`;
        }
        const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
        const areaPoints = `${x(0)},${top+plotHeight} ${points} ${x(items.length-1)},${top+plotHeight}`;
        const dots = items.map((item, index) => {
            const value = values[index];
            return `<g><title>${escapeHtml(item.title || item.label)}: ${escapeHtml(valueFormatter(value))}</title><circle cx="${x(index)}" cy="${y(value)}" r="4.1" fill="${color}" stroke="#fff" stroke-width="1.5"/><text x="${x(index)}" y="${Math.max(14,y(value)-9)}" text-anchor="middle" class="stats-svg-value-label">${escapeHtml(valueFormatter(value))}</text><text x="${x(index)}" y="${height-25}" text-anchor="middle" class="stats-svg-axis-label">${escapeHtml(item.label || '')}</text></g>`;
        }).join('');
        return `<div class="stats-line-chart-wrap"><svg class="stats-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" preserveAspectRatio="xMidYMid meet">${grid}<polygon points="${areaPoints}" fill="${color}" opacity=".10"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg></div>`;
    }

    function statsGroupedBarChartHtml(items, keys, label = 'Comparação semanal') {
        if (!items.length || !items.some(item => keys.some(key => (Number(item[key.key]) || 0) > 0))) return statsChartEmpty();
        const max = Math.max(1, ...items.flatMap(item => keys.map(key => Number(item[key.key]) || 0)));
        const groups = items.map(item => {
            const bars = keys.map(key => {
                const value = Math.max(0, Number(item[key.key]) || 0);
                const height = value ? Math.max(3, value / max * 100) : 0;
                return `<span class="stats-grouped-bar" title="${escapeHtml(key.label)}: ${value}" style="height:${height}%;background:${key.color}"></span>`;
            }).join('');
            const values = keys.map(key => `<small style="color:${key.color}">${Number(item[key.key]) || 0}</small>`).join('');
            return `<div class="stats-grouped-column" title="${escapeHtml(item.title || item.label)}"><div class="stats-grouped-values">${values}</div><div class="stats-grouped-track">${bars}</div><span class="stats-bar-xlabel"><b>${escapeHtml(item.label || '')}</b><small>${escapeHtml(item.endLabel || '')}</small></span></div>`;
        }).join('');
        return `<div class="stats-grouped-chart" role="img" aria-label="${escapeHtml(label)}"><div class="stats-grouped-legend">${keys.map(key => `<span><i style="background:${key.color}"></i>${escapeHtml(key.label)}</span>`).join('')}</div><div class="stats-bar-plot stats-grouped-plot" style="--stats-bar-count:${items.length}">${groups}</div></div>`;
    }

    function statsDonutChartHtml(items) {
        const sorted = items.filter(item => item.weekMinutes > 0).sort((a, b) => b.weekMinutes - a.weekMinutes);
        const total = sorted.reduce((sum, item) => sum + item.weekMinutes, 0);
        if (!total) return statsChartEmpty('Nenhuma hora registrada na semana selecionada.');
        const top = sorted.slice(0, 5);
        if (sorted.length > 5) top.push({ discipline: 'Outras disciplinas', weekMinutes: sorted.slice(5).reduce((sum, item) => sum + item.weekMinutes, 0) });
        let current = 0;
        const segments = top.map((item, index) => {
            const start = current;
            current += item.weekMinutes / total * 100;
            return `${STATS_CHART_COLORS[index % STATS_CHART_COLORS.length]} ${start.toFixed(2)}% ${current.toFixed(2)}%`;
        });
        const legend = top.map((item, index) => {
            const pct = Math.round(item.weekMinutes / total * 100);
            return `<div class="stats-donut-legend-item"><i style="background:${STATS_CHART_COLORS[index % STATS_CHART_COLORS.length]}"></i><div><strong>${escapeHtml(item.discipline)}</strong><span>${statsFormatMinutes(item.weekMinutes, true)} (${pct}%)</span></div></div>`;
        }).join('');
        return `<div class="stats-donut-layout"><div class="stats-donut" role="img" aria-label="Distribuição de ${escapeHtml(statsFormatMinutes(total,true))} por disciplina" style="background:conic-gradient(${segments.join(',')})"><div class="stats-donut-center"><strong>${statsFormatMinutes(total,true)}</strong><span>total</span></div></div><div class="stats-donut-legend">${legend}</div></div>`;
    }

    function renderStatisticsCharts(weekStart, groups) {
        const root = document.getElementById('statistics-charts');
        if (!root) return;
        const weeks = statsBuildWeeklySeries(weekStart, 9);
        const selectedLabel = statsWeekRangeLabel(weekStart);
        const selectedWeekLabel = document.getElementById('statistics-charts-selected-week');
        if (selectedWeekLabel) selectedWeekLabel.textContent = selectedLabel;
        const priorityItems = groups.map(group => ({
            label: group.label.replace(/^Prioridade\s*/i, ''),
            title: group.label,
            studies: group.items.reduce((sum, item) => sum + item.weekStudies, 0),
            color: group.color
        })).filter(item => item.studies > 0);
        const selectedWeek = statsWeekBounds(weekStart);
        const subjectMinutes = groups.flatMap(group => group.items.map(item => ({ ...item, priorityLabel: group.label, priorityColor: group.color }))).filter(item => item.weekMinutes > 0);
        const chartContent = {
            'statistics-chart-studies-weekly': statsBarChartHtml(weeks, 'studies', '#4f91f4', value => String(value), 'Quantidade de sessões de estudo por semana'),
            'statistics-chart-hours-weekly': statsLineChartHtml(weeks, 'minutes', '#159669', value => statsFormatMinutes(value, true), 'Horas de estudo por semana'),
            'statistics-chart-hours-discipline': statsDonutChartHtml(subjectMinutes),
            'statistics-chart-studies-priority': statsBarChartHtml(priorityItems, 'studies', '#ef5b61', value => String(value), 'Estudos por prioridade na semana selecionada'),
            'statistics-chart-comparison': statsGroupedBarChartHtml(weeks, [{ key: 'studies', label: 'Estudos', color: '#3b82f6' }, { key: 'reviews', label: 'Revisões', color: '#8b5cf6' }], 'Comparação semanal de estudos e revisões'),
            'statistics-chart-questions-weekly': statsBarChartHtml(weeks, 'questions', '#f9a64a', value => String(value), 'Questões respondidas por semana')
        };
        Object.entries(chartContent).forEach(([id, html]) => {
            const target = document.getElementById(id);
            if (target) target.innerHTML = html;
        });
    }

    function renderStudyStatistics() {
        const root = document.getElementById('content-estatisticas');
        if (!root) return;
        initializeStatisticsWeekPicker();
        const model = buildStatisticsModel(selectedWeekStart);
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
        renderStatisticsCharts(week.start, groups);

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
    window.changeStatisticsWeek = changeStatisticsWeek;
})();
