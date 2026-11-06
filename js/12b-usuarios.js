// 12b-usuarios.js — V10.33/V10.34: módulo de usuários. O administrador libera ou bloqueia o uso da IA por pessoa
// e acompanha o uso (consultas e tokens aproximados por modelo, por usuário e o histórico recente).
// Regra: sem permissão, todo elemento com a classe .ia-only fica oculto (CSS: body:not(.ia-allowed) .ia-only).
// A decisão é do banco (funções study_* em schema_usuarios_v10_33.sql / schema_ia_uso_v10_34.sql); aqui o navegador só reflete o resultado.
// Falha "fechada": se a consulta de permissão falhar, a IA permanece oculta.
window.StudyUsers = (function () {
    'use strict';
    const st = { isAdmin: false, ai: false, users: [], usage: [], recent: [], usageErr: '', busy: false };
    let seq = 0, lastRefresh = 0;
    const $ = id => document.getElementById(id);
    const errMsg = e => (e && e.message) ? e.message : String(e || 'erro desconhecido');
    const esc = v => escapeHtml(v);

    function apply() {
        document.body.classList.toggle('is-admin', st.isAdmin);
        document.body.classList.toggle('ia-allowed', st.ai);
        // Segunda barreira, independente do CSS: esconde/mostra direto os elementos marcados.
        document.querySelectorAll('.ia-only').forEach(el => { if (st.ai) el.style.removeProperty('display'); else el.style.setProperty('display', 'none', 'important'); });
        document.querySelectorAll('.admin-only').forEach(el => { if (st.isAdmin) el.style.removeProperty('display'); else el.style.setProperty('display', 'none', 'important'); });
        if (!st.isAdmin && document.body.dataset.tab === 'usuarios') switchTab('cronograma');
    }

    function reset() {
        seq++; lastRefresh = 0;
        st.isAdmin = false; st.ai = false; st.users = []; st.usage = []; st.recent = []; st.usageErr = '';
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

    // ---------- Registro do uso da IA (chamado por chamarIAServidor) ----------
    // Usa os tokens que a resposta informa (usageMetadata do Gemini). Se não vierem, estima por caracteres ÷ 4 e marca como estimado.
    function logAI(payload, resp, ok, errText, ms) {
        if (typeof sbClient === 'undefined' || !sbClient) return;
        const um = (resp && (resp.usageMetadata || resp.usage)) || {};
        const num = v => (v === undefined || v === null || v === '') ? NaN : Number(v);
        let inT = num(um.promptTokenCount !== undefined ? um.promptTokenCount : (um.input_tokens !== undefined ? um.input_tokens : um.prompt_tokens));
        let outT = num(um.candidatesTokenCount !== undefined ? um.candidatesTokenCount : (um.output_tokens !== undefined ? um.output_tokens : um.completion_tokens));
        const think = num(um.thoughtsTokenCount);
        let total = num(um.totalTokenCount !== undefined ? um.totalTokenCount : um.total_tokens);
        let estimated = false;
        if (!ok) { inT = 0; outT = 0; total = 0; }
        else if (!Number.isFinite(inT) && !Number.isFinite(total)) {
            let text = '';
            try { text = ((resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts) || []).map(p => p.text || '').join(''); } catch (_) {}
            inT = Math.ceil(JSON.stringify(payload || {}).length / 4);
            outT = Math.ceil(text.length / 4);
            total = inT + outT; estimated = true;
        } else {
            if (!Number.isFinite(inT)) inT = 0;
            outT = (Number.isFinite(outT) ? outT : 0) + (Number.isFinite(think) ? think : 0);
            if (Number.isFinite(total) && total > inT + outT) outT = total - inT;
            if (!Number.isFinite(total)) total = inT + outT;
        }
        const model = (resp && (resp.modelVersion || resp.model || (resp.metadata && resp.metadata.model))) || '';
        Promise.resolve(sbClient.rpc('study_log_ai', {
            p_modo: (payload && payload.modo) || '', p_model: String(model || ''),
            p_prompt: Math.round(inT), p_output: Math.round(outT), p_total: Math.round(total),
            p_estimated: estimated, p_ok: !!ok, p_error: ok ? null : String(errText || '').slice(0, 300), p_ms: Math.round(ms || 0)
        })).then(r => { if (r && r.error) console.warn('Uso da IA não registrado:', r.error.message); })
          .catch(e => console.warn('Uso da IA não registrado:', e));
    }

    // ---------- Aba Usuários (somente administrador) ----------
    const fmtDate = v => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR') : '—'; };
    const fmtDateTime = v => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };
    const fmtInt = n => (Number(n) || 0).toLocaleString('pt-BR');
    function fmtTok(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' mi';
        if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' mil';
        return String(n);
    }

    async function loadUsers() {
        const box = $('users-list');
        if (!box || !st.isAdmin) return;
        box.innerHTML = '<p class="text-xs text-slate-500">Carregando…</p>';
        const per = $('ai-usage-period');
        const days = per && per.value ? Number(per.value) : null;
        const [u, s, r] = await Promise.all([
            sbClient.rpc('study_all_users'),
            sbClient.rpc('study_ai_usage_summary', { p_days: days }),
            sbClient.rpc('study_ai_usage_recent', { p_limit: 50 })
        ]).catch(e => [{ error: e }, { error: e }, { error: e }]);
        if (u.error) { box.innerHTML = '<p class="text-xs text-red-600">Não foi possível carregar os usuários: ' + esc(errMsg(u.error)) + '</p>'; return; }
        st.users = u.data || [];
        const uerr = s.error || r.error;
        st.usageErr = uerr ? errMsg(uerr) : '';
        st.usage = s.error ? [] : (s.data || []);
        st.recent = r.error ? [] : (r.data || []);
        render(); renderUsage();
    }

    function usageByUser() {
        const m = new Map();
        st.usage.forEach(x => {
            const k = String(x.r_user_id || '');
            const a = m.get(k) || { q: 0, tok: 0 };
            a.q += Number(x.r_queries) || 0; a.tok += Number(x.r_total) || 0; m.set(k, a);
        });
        return m;
    }

    function render() {
        const box = $('users-list'); if (!box) return;
        const q = (($('users-search') || {}).value || '').trim().toLowerCase();
        const uso = usageByUser();
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
            const email = esc(u.r_email || '(sem e-mail)');
            const a = uso.get(String(u.r_user_id));
            const usoTxt = a && a.q ? ' · ' + fmtInt(a.q) + ' consulta' + (a.q === 1 ? '' : 's') + ' · ~' + fmtTok(a.tok) + ' tokens' : '';
            const info = '<div class="user-info"><b>' + email + '</b><small>'
                + (u.r_is_admin ? 'Administrador · acesso total à IA' : (u.r_ai_allowed ? 'IA liberada' : 'IA bloqueada'))
                + ' · cadastro em ' + fmtDate(u.r_created_at) + ' · último acesso ' + fmtDate(u.r_last_sign_in) + '</small>'
                + (usoTxt ? '<small>Uso da IA' + esc(usoTxt) + '</small>' : '') + '</div>';
            if (u.r_is_admin) return '<div class="user-row">' + info + '</div>';
            return '<div class="user-row">' + info
                + '<select class="user-select" data-user="' + esc(u.r_user_id) + '" data-email="' + email + '" aria-label="Uso de IA para ' + email + '">'
                + '<option value="0"' + (u.r_ai_allowed ? '' : ' selected') + '>Sem IA</option>'
                + '<option value="1"' + (u.r_ai_allowed ? ' selected' : '') + '>IA liberada</option></select></div>';
        }).join('');
    }

    function renderUsage() {
        const kp = $('ai-usage-kpis'), md = $('ai-usage-models'), rc = $('ai-usage-recent');
        if (!kp || !md || !rc) return;
        if (st.usageErr) {
            kp.innerHTML = '<p class="text-xs text-amber-700">Não foi possível carregar o uso da IA (' + esc(st.usageErr) + '). Se for a primeira vez, rode schema_ia_uso_v10_34.sql no Supabase.</p>';
            md.innerHTML = ''; rc.innerHTML = ''; return;
        }
        const tot = st.usage.reduce((a, x) => {
            a.q += Number(x.r_queries) || 0; a.f += Number(x.r_failed) || 0;
            a.i += Number(x.r_prompt) || 0; a.o += Number(x.r_output) || 0; a.t += Number(x.r_total) || 0; a.e += Number(x.r_estimated) || 0; return a;
        }, { q: 0, f: 0, i: 0, o: 0, t: 0, e: 0 });
        kp.innerHTML = [
            ['Consultas', fmtInt(tot.q), tot.f ? fmtInt(tot.f) + ' com falha' : 'sem falhas'],
            ['Tokens (aprox.)', '~' + fmtTok(tot.t), 'entrada + saída'],
            ['Entrada', '~' + fmtTok(tot.i), 'texto enviado'],
            ['Saída', '~' + fmtTok(tot.o), 'resposta da IA']
        ].map(k => '<div class="usage-kpi"><span>' + k[0] + '</span><b>' + k[1] + '</b><small>' + k[2] + '</small></div>').join('');
        const byModel = new Map();
        st.usage.forEach(x => {
            const k = x.r_model || 'não informado';
            const a = byModel.get(k) || { q: 0, i: 0, o: 0, t: 0, e: 0 };
            a.q += Number(x.r_queries) || 0; a.i += Number(x.r_prompt) || 0; a.o += Number(x.r_output) || 0; a.t += Number(x.r_total) || 0; a.e += Number(x.r_estimated) || 0;
            byModel.set(k, a);
        });
        const rows = [...byModel.entries()].sort((a, b) => b[1].t - a[1].t);
        md.innerHTML = rows.length
            ? '<div class="usage-scroll"><table class="usage-table"><thead><tr><th>Modelo</th><th>Consultas</th><th>Entrada</th><th>Saída</th><th>Total</th></tr></thead><tbody>'
              + rows.map(([m, a]) => '<tr><td>' + esc(m) + '</td><td>' + fmtInt(a.q) + '</td><td>~' + fmtTok(a.i) + '</td><td>~' + fmtTok(a.o) + '</td><td><b>~' + fmtTok(a.t) + '</b>' + (a.e ? ' *' : '') + '</td></tr>').join('')
              + '</tbody></table></div>' + (tot.e ? '<p class="mt-1 text-[11px] text-slate-500">* inclui consultas com tokens estimados (o servidor não informou a contagem; cálculo por caracteres ÷ 4).</p>' : '')
            : '<p class="text-xs text-slate-500">Nenhuma consulta registrada neste período.</p>';
        rc.innerHTML = st.recent.length
            ? '<div class="usage-scroll"><table class="usage-table"><thead><tr><th>Quando</th><th>Usuário</th><th>Modelo</th><th>Tokens</th><th>Situação</th></tr></thead><tbody>'
              + st.recent.map(x => '<tr><td>' + esc(fmtDateTime(x.r_created_at)) + '</td><td>' + esc(x.r_email || '(conta excluída)') + '</td><td>' + esc(x.r_model || 'não informado') + (x.r_modo ? ' <small>· ' + esc(x.r_modo) + '</small>' : '') + '</td><td>~' + fmtInt(x.r_total) + (x.r_estimated ? ' *' : '') + '</td><td>' + (x.r_ok ? 'OK' : '<span class="text-red-600" title="' + esc(x.r_error || '') + '">Falhou</span>') + '</td></tr>').join('')
              + '</tbody></table></div>'
            : '<p class="text-xs text-slate-500">Nenhuma consulta registrada ainda.</p>';
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

    // Ao carregar o app, já esconde tudo (ninguém vê IA/admin antes de a permissão ser confirmada pelo banco).
    apply();

    // Ligações da tela
    const listEl = $('users-list'); if (listEl) listEl.addEventListener('change', onChange);
    const search = $('users-search'); if (search) search.addEventListener('input', render);
    const period = $('ai-usage-period'); if (period) period.addEventListener('change', loadUsers);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false); });

    return { refresh, reset, loadUsers, canUseAI, requireAI, logAI, isAdmin: () => st.isAdmin };
})();
