// 12a-ux.js — V10.29: melhorias de interface (barra inferior no celular, minutos livres, desfazer exclusão, cartões do histórico).
(function () {
    'use strict';

    // ---- Minutos: ±5, h:mm e dica de conversão ----
    function wireMinutes(inputId, hintId, minusId, plusId) {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.minWired) return;
        input.dataset.minWired = '1';
        const hint = hintId ? document.getElementById(hintId) : null;
        const refresh = () => {
            if (!hint) return;
            const v = parseMinutesInput(input.value);
            hint.textContent = v ? '= ' + fmtMinutesHM(v) + ' · digite 85 ou 1:25' : 'Digite os minutos (ex.: 85) ou 1:25';
        };
        const step = delta => {
            const cur = parseMinutesInput(input.value) || 0;
            input.value = Math.max(1, cur + delta);
            refresh();
        };
        input.addEventListener('input', refresh);
        input.addEventListener('blur', () => { const v = parseMinutesInput(input.value); if (v) { input.value = v; refresh(); } });
        const minus = minusId && document.getElementById(minusId), plus = plusId && document.getElementById(plusId);
        if (minus) minus.addEventListener('click', () => step(-5));
        if (plus) plus.addEventListener('click', () => step(5));
        refresh();
    }
    wireMinutes('reg-minutes', 'reg-minutes-hint', 'reg-min-minus', 'reg-min-plus');

    // ---- Desfazer exclusão de registro ----
    if (typeof window.deleteSession === 'function') {
        const original = window.deleteSession;
        window.deleteSession = function (id) {
            const old = studySessions.find(s => s.id === id);
            const copia = old ? JSON.parse(JSON.stringify(old)) : null;
            const r = original.apply(this, arguments);
            if (copia && typeof showToast === 'function') {
                showToast('Registro excluído', (copia.discipline || 'Registro') + ' · ' + fmtMinutesHM(copia.minutes), 'info', { label: 'Desfazer', onClick: () => restoreDeletedSession(copia) });
            }
            return r;
        };
    }
    // Restaura com um id novo: o id antigo já foi marcado como excluído (tombstone) e voltaria a sumir na sincronização.
    function restoreDeletedSession(copia) {
        const s = { ...copia, id: crypto.randomUUID() };
        studySessions.unshift(s);
        adjustProgressForSession(s, 1);
        localStorage.setItem('tce_go_pro_sessions', JSON.stringify(studySessions));
        saveData();
        initRegistrationForm(); renderSessionsList(); renderRecentRotation(); renderDashboard(); renderPriorityDisciplineProgress();
        showToast('Registro restaurado', '', 'ok');
    }

    // ---- Barra de navegação inferior (celular/tablet) ----
    const ITENS = [
        ['cronograma', 'Cronograma', 'fa-list-check'],
        ['registro', 'Registro', 'fa-pen-to-square'],
        ['edital', 'Edital', 'fa-book'],
        ['estatisticas', 'Estatísticas', 'fa-chart-simple'],
        ['__menu', 'Mais', 'fa-ellipsis']
    ];
    function buildBottomNav() {
        if (document.getElementById('bottom-nav')) return;
        const nav = document.createElement('nav');
        nav.id = 'bottom-nav'; nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Navegação principal');
        nav.innerHTML = ITENS.map(([id, rotulo, icone]) => '<button type="button" data-bn="' + id + '"><i class="fa-solid ' + icone + '" aria-hidden="true"></i><span>' + rotulo + '</span></button>').join('');
        nav.addEventListener('click', ev => {
            const b = ev.target.closest('[data-bn]'); if (!b) return;
            if (b.dataset.bn === '__menu') { openSidebarMobile(); return; }
            switchTab(b.dataset.bn); window.scrollTo({ top: 0 });
        });
        document.body.appendChild(nav);
    }
    function markBottomNav() {
        const nav = document.getElementById('bottom-nav'); if (!nav) return;
        const atual = document.body.dataset.tab || '';
        nav.querySelectorAll('[data-bn]').forEach(b => {
            const on = b.dataset.bn === atual;
            b.classList.toggle('on', on);
            if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
    }
    buildBottomNav();
    if (typeof window.switchTab === 'function') {
        const original = window.switchTab;
        window.switchTab = function () { const r = original.apply(this, arguments); markBottomNav(); return r; };
    }
    markBottomNav();

    // ---- Histórico: alterna tabela <-> cartões ao girar/redimensionar a tela ----
    if (window.matchMedia) {
        const mq = window.matchMedia('(max-width:640px)');
        const trocar = () => { try { renderSessionsList(); } catch (e) { console.warn(e); } };
        if (mq.addEventListener) mq.addEventListener('change', trocar); else if (mq.addListener) mq.addListener(trocar);
    }
})();
