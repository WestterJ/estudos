// 12a-ux.js — V10.29/V10.30: melhorias de interface (barra inferior no celular, minutos livres, desfazer exclusão, cartões do histórico).
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

    // ---- Barra de navegação inferior (celular/tablet): Cronograma · Edital · ＋ Lançar · Estatísticas · Mais ----
    const ITENS = [
        ['cronograma', 'Cronograma', 'fa-list-check'],
        ['edital', 'Edital', 'fa-book'],
        ['__launch', 'Lançar', 'fa-plus'],
        ['estatisticas', 'Estatísticas', 'fa-chart-simple'],
        ['__more', 'Mais', 'fa-ellipsis']
    ];
    const ABAS_MAIS = ['dashboard', 'personalizacao', 'usuarios', 'configuracoes'];
    const SHEET_ITENS = [
        ['dashboard', 'Datas Importantes', 'fa-calendar-check'],
        ['personalizacao', 'Personalização', 'fa-sliders'],
        ['usuarios', 'Usuários', 'fa-users-gear'],
        ['configuracoes', 'Configurações', 'fa-gear'],
        ['__tema', 'Alternar tema', 'fa-moon'],
        ['__concurso', 'Trocar de concurso / menu completo', 'fa-bars']
    ];
    function buildBottomNav() {
        if (document.getElementById('bottom-nav')) return;
        const nav = document.createElement('nav');
        nav.id = 'bottom-nav'; nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Navegação principal');
        nav.innerHTML = ITENS.map(([id, rotulo, icone]) => id === '__launch'
            ? '<button type="button" data-bn="__launch" class="bn-launch" aria-label="Lançar estudo"><span class="bn-launch-fab"><i class="fa-solid ' + icone + '" aria-hidden="true"></i></span><span>' + rotulo + '</span></button>'
            : '<button type="button" data-bn="' + id + '"><i class="fa-solid ' + icone + '" aria-hidden="true"></i><span>' + rotulo + '</span></button>').join('');
        nav.addEventListener('click', ev => {
            const b = ev.target.closest('[data-bn]'); if (!b) return;
            const id = b.dataset.bn;
            if (id === '__more') { openMoreSheet(); return; }
            if (id === '__launch') { launchStudyFromSidebar(); return; }
            switchTab(id); window.scrollTo({ top: 0 });
        });
        document.body.appendChild(nav);
    }
    function markBottomNav() {
        const nav = document.getElementById('bottom-nav'); if (!nav) return;
        const atual = document.body.dataset.tab || '';
        nav.querySelectorAll('[data-bn]').forEach(b => {
            const id = b.dataset.bn;
            const on = id === atual || (id === '__launch' && atual === 'registro') || (id === '__more' && ABAS_MAIS.indexOf(atual) >= 0);
            b.classList.toggle('on', on);
            if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
    }

    // ---- Folha "Mais" ----
    function buildMoreSheet() {
        if (document.getElementById('more-sheet')) return;
        const wrap = document.createElement('div');
        wrap.id = 'more-sheet'; wrap.className = 'more-sheet'; wrap.hidden = true;
        wrap.innerHTML = '<div class="more-sheet-backdrop" data-ms-close="1"></div>'
            + '<div class="more-sheet-panel" role="dialog" aria-modal="true" aria-label="Mais opções">'
            + '<div class="more-sheet-head"><strong>Mais opções</strong><button type="button" class="more-sheet-close" data-ms-close="1" aria-label="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>'
            + SHEET_ITENS.map(([id, rotulo, icone]) => '<button type="button" class="more-sheet-item' + (id === 'usuarios' ? ' admin-only' : '') + '" data-ms="' + id + '"><i class="fa-solid ' + icone + '" aria-hidden="true"></i><span>' + rotulo + '</span></button>').join('')
            + '</div>';
        wrap.addEventListener('click', ev => {
            if (ev.target.closest('[data-ms-close]')) { closeMoreSheet(); return; }
            const b = ev.target.closest('[data-ms]'); if (!b) return;
            const id = b.dataset.ms;
            closeMoreSheet();
            if (id === '__tema') { if (typeof toggleDarkMode === 'function') toggleDarkMode(); return; }
            if (id === '__concurso') { openSidebarMobile(); return; }
            switchTab(id); window.scrollTo({ top: 0 });
        });
        document.body.appendChild(wrap);
    }
    function openMoreSheet() {
        buildMoreSheet();
        const sheet = document.getElementById('more-sheet');
        sheet.hidden = false;
        const first = sheet.querySelector('.more-sheet-item'); if (first) first.focus();
    }
    function closeMoreSheet() {
        const sheet = document.getElementById('more-sheet');
        if (sheet && !sheet.hidden) { sheet.hidden = true; const more = document.querySelector('#bottom-nav [data-bn="__more"]'); if (more) more.focus(); }
    }

    buildBottomNav();
    if (typeof window.switchTab === 'function') {
        const original = window.switchTab;
        window.switchTab = function () { const r = original.apply(this, arguments); markBottomNav(); return r; };
    }
    markBottomNav();

    // ---- Menu lateral: foco no botão Fechar ao abrir; Esc fecha menu e folha ----
    if (typeof window.openSidebarMobile === 'function') {
        const abrir = window.openSidebarMobile;
        window.openSidebarMobile = function () { abrir.apply(this, arguments); const x = document.querySelector('.sidebar-close-btn'); if (x) setTimeout(() => x.focus(), 60); };
    }
    if (typeof window.closeSidebarMobile === 'function') {
        const fechar = window.closeSidebarMobile;
        window.closeSidebarMobile = function () {
            const estavaAberto = document.body.classList.contains('sidebar-open');
            fechar.apply(this, arguments);
            if (estavaAberto) { const m = document.getElementById('mobile-menu-btn'); if (m && m.offsetParent !== null) m.focus(); }
        };
    }
    document.addEventListener('keydown', ev => {
        if (ev.key !== 'Escape') return;
        const sheet = document.getElementById('more-sheet');
        if (sheet && !sheet.hidden) { closeMoreSheet(); return; }
        if (document.body.classList.contains('sidebar-open')) closeSidebarMobile();
    });

    // ---- Histórico: alterna tabela <-> cartões ao girar/redimensionar a tela ----
    if (window.matchMedia) {
        const mq = window.matchMedia('(max-width:640px)');
        const trocar = () => { try { renderSessionsList(); } catch (e) { console.warn(e); } };
        if (mq.addEventListener) mq.addEventListener('change', trocar); else if (mq.addListener) mq.addListener(trocar);
    }
})();
