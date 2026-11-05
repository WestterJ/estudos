// 12b-usuarios.js — V10.33: módulo de usuários. O administrador libera ou bloqueia o uso da IA por pessoa.
// Regra: sem permissão, todo elemento com a classe .ia-only fica oculto (CSS: body:not(.ia-allowed) .ia-only).
// A decisão é do banco (funções study_* em schema_usuarios_v10_33.sql); aqui o navegador só reflete o resultado.
// Falha "fechada": se a consulta falhar, a IA permanece oculta.
window.StudyUsers = (function () {
    'use strict';
    const st = { isAdmin: false, ai: false, users: [], busy: false };
    let seq = 0, lastRefresh = 0;
    const $ = id => document.getElementById(id);
    const errMsg = e => (e && e.message) ? e.message : String(e || 'erro desconhecido');

    function apply() {
        document.body.classList.toggle('is-admin', st.isAdmin);
        document.body.classList.toggle('ia-allowed', st.ai);
        if (!st.isAdmin && document.body.dataset.tab === 'usuarios') switchTab('cronograma');
    }

    function reset() {
        seq++; lastRefresh = 0;
        st.isAdmin = false; st.ai = false; st.users = [];
        apply();
    }

    // Consulta o banco (no máximo a cada 30 s, salvo force). Chamada no login, ao abrir o Edital e ao voltar para o app.
    async function refresh(force) {
        const now = Date.now();
        if (!force && now - lastRefresh < 30000) return;
        if (typeof sbClient === 'undefined' || !sbClient || typeof sbUser === 'undefined' || !sbUser) { reset(); return; }
        const mine = ++seq; lastRefresh = now;
        try {
            const { data, error } = await sbClient.rpc('study_my_access');
            if (mine !== seq) return;
            if (error) throw error;
            const r = Array.isArray(data) ? data[0] : data;
            st.isAdmin = !!(r && r.r_is_admin);
            st.ai = !!(r && r.r_ai);
        } catch (e) {
            if (mine !== seq) return;
            console.warn('Não foi possível consultar as permissões de usuário:', e);
            st.isAdmin = false; st.ai = false;
        }
        apply();
        if (st.isAdmin && document.body.dataset.tab === 'usuarios') loadUsers();
    }

    // ---------- Aba Usuários (somente administrador) ----------
    async function loadUsers() {
        const box = $('users-list');
        if (!box || !st.isAdmin) return;
        box.innerHTML = '<p class="text-xs text-slate-500">Carregando…</p>';
        try {
            const { data, error } = await sbClient.rpc('study_all_users');
            if (error) throw error;
            st.users = data || [];
            render();
        } catch (e) {
            box.innerHTML = '<p class="text-xs text-red-600">Não foi possível carregar os usuários: ' + escapeHtml(errMsg(e)) + '</p>';
        }
    }

    function fmtDate(v) {
        const d = v ? new Date(v) : null;
        return d && !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR') : '—';
    }

    function render() {
        const box = $('users-list'); if (!box) return;
        const q = (($('users-search') || {}).value || '').trim().toLowerCase();
        const all = st.users.slice().sort((a, b) =>
            (Number(b.r_is_admin) - Number(a.r_is_admin)) ||
            (Number(b.r_ai_allowed) - Number(a.r_ai_allowed)) ||
            String(a.r_email).localeCompare(String(b.r_email)));
        const list = all.filter(u => !q || String(u.r_email || '').toLowerCase().includes(q));
        const comIA = all.filter(u => u.r_is_admin || u.r_ai_allowed).length;
        const resumo = $('users-summary');
        if (resumo) resumo.textContent = all.length + ' usuário(s) · ' + comIA + ' com IA liberada';
        if (!list.length) { box.innerHTML = '<p class="text-xs text-slate-500">Nenhum usuário encontrado.</p>'; return; }
        box.innerHTML = list.map(u => {
            const email = escapeHtml(u.r_email || '(sem e-mail)');
            const info = '<div class="user-info"><b>' + email + '</b><small>'
                + (u.r_is_admin ? 'Administrador · acesso total à IA' : (u.r_ai_allowed ? 'IA liberada' : 'IA bloqueada'))
                + ' · cadastro em ' + fmtDate(u.r_created_at) + ' · último acesso ' + fmtDate(u.r_last_sign_in) + '</small></div>';
            if (u.r_is_admin) return '<div class="user-row">' + info + '</div>';
            return '<div class="user-row">' + info
                + '<select class="user-select" data-user="' + escapeHtml(u.r_user_id) + '" data-email="' + email + '" aria-label="Uso de IA para ' + email + '">'
                + '<option value="0"' + (u.r_ai_allowed ? '' : ' selected') + '>Sem IA</option>'
                + '<option value="1"' + (u.r_ai_allowed ? ' selected' : '') + '>IA liberada</option></select></div>';
        }).join('');
    }

    async function onChange(ev) {
        const s = ev.target.closest('select[data-user]');
        if (!s || !st.isAdmin || st.busy) return;
        const allowed = s.value === '1';
        st.busy = true; s.disabled = true;
        try {
            const { error } = await sbClient.rpc('study_set_ai', { p_user: s.dataset.user, p_allowed: allowed });
            if (error) throw error;
            showToast(allowed ? 'IA liberada' : 'IA bloqueada', s.dataset.email, 'ok');
        } catch (e) {
            showToast('Não foi possível salvar a permissão', errMsg(e), 'erro');
        } finally {
            st.busy = false;
        }
        await loadUsers();
    }

    // ---------- Uso pelos demais módulos ----------
    function canUseAI() { return !!st.ai; }
    function requireAI() {
        if (st.ai) return true;
        showCustomDialog('IA não liberada', 'O uso de IA não está liberado para a sua conta. Peça ao administrador para liberar.');
        return false;
    }

    // Ligações da tela
    const list = $('users-list'); if (list) list.addEventListener('change', onChange);
    const search = $('users-search'); if (search) search.addEventListener('input', render);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false); });

    return { refresh, reset, loadUsers, canUseAI, requireAI, isAdmin: () => st.isAdmin };
})();
