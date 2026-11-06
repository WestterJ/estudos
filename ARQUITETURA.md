# Arquitetura — Planejador de Estudos V10.36

O app é uma página estática (GitHub Pages) + Supabase. Não há build nem bundler: o `index.html` carrega arquivos JS comuns, na ordem abaixo.

## Estrutura de arquivos

```
index.html              estrutura da tela (HTML) e ordem de carga dos scripts
service-worker.js       cache offline (PWA) — lista todos os arquivos em APP_SHELL
supabase-config.js      URL e chave PÚBLICA do Supabase
manifest.webmanifest    manifesto do PWA
icons/                  ícones do PWA
css/estilos.css         todos os estilos (cartões, menu lateral, tabela, login…)
js/                     lógica, dividida por área (tabela abaixo)
```

## Ordem de carga (importa!)

Os scripts são clássicos (não `type="module"`) e **compartilham o mesmo escopo global**: uma função de um arquivo pode ser chamada por outro e o HTML usa `onclick="…"`. Por isso:

- Funções (`function x(){}`) podem ser chamadas de qualquer arquivo **depois** que todos carregarem (ou seja, dentro de funções, eventos e do `13-iniciar.js`).
- Código solto no topo de um arquivo (fora de função) só pode usar o que já foi definido nos arquivos **anteriores** da lista.
- `13-iniciar.js` roda por último e monta a tela; novos arquivos de lógica entram **antes** dele.

| # | Arquivo | O que contém |
|---|---|---|
| 1 | `js/00-config.js` | Versão única (`APP_VERSION`) e carga da chave pública do Supabase. **Único lugar onde se muda a versão** (junto com `CACHE_NAME` em `service-worker.js`). |
| 2 | `js/01-base.js` | Dados iniciais em memória (`userProgress`, `studySessions`), toasts e caixas de diálogo, contagem regressiva, modo escuro, troca de abas, configurações de prioridade. |
| 3 | `js/02-sugestoes.js` | Utilitários de data e sessão, trilhas de estudo e a sugestão do próximo estudo. |
| 4 | `js/03-utilitarios.js` | Horas em HH:mm, exclusões duráveis (tombstones), diagnóstico/limpeza de tópicos e menu lateral retrátil. |
| 5 | `js/04-inicio.js` | Trilhas cadastráveis, subtítulo do concurso, painéis recolhíveis da Home (últimos estudos, sugestões, revisões), progresso por prioridade, cronograma e KPIs. |
| 6 | `js/05-registro.js` | Aba **Registro**: formulário de estudo, tabela editável do histórico de sessões, edição e exclusão. |
| 7 | `js/06-edital.js` | Aba **Edital Verticalizado**: filtros e renderização. |
| 8 | `js/07-concursos.js` | Concursos (criar/trocar, `contests`, `activeContest`), prioridades, disciplinas, pesos e personalização. |
| 9 | `js/08-importacao-ia.js` | Cadastro manual do edital, importação por planilha/PDF e análise do edital por IA (Edge Function). |
| 10 | `js/09-sincronizacao.js` | Supabase: login, mesclagem por ID entre aparelhos, sincronização e salvamento na nuvem. |
| 11 | `js/10-dados-backup.js` | `saveData`, cabeçalho do concurso, configurações do Supabase, reset e backup (exportar/importar). |
| 12 | `js/11-datas-anotacoes.js` | Modal de anotações e **Datas Importantes** (checklist por concurso). |
| 13 | `js/12-estatisticas.js` | Menu **Estatísticas**, totais gerais e semanais agrupados por prioridade e disciplina. |
| 13b | `js/12b-usuarios.js` | **Usuários e permissão de IA** (`window.StudyUsers`): consulta `study_my_access`, mostra/oculta os botões de IA e a aba Usuários (só administrador). Carrega antes de `13-iniciar.js`. |
| 14 | `js/13-iniciar.js` | Chamadas finais que montam a tela. **Deve ser o último arquivo de lógica** antes de `auth.js`. |
| 15 | `js/auth.js` | Tela de login, cadastro, recuperação de senha, Google OAuth e botão de instalar o PWA (função autocontida, sem globais). |
| 16 | `js/pwa.js` | Registro do service worker. |

## Funções principais por arquivo

**`01-base.js`** (17 funções): `preencherVersao`, `nivelToast`, `showToast`, `abrirCaixa`, `showCustomDialog`, `showModalDialog`, `closeDialog`, `updateCountdown`, `toggleDarkMode`, `switchTab`, `getPrioritySettings`, `getDisciplineSettings`, `getPriorityLabel`, `applyPriorityColors` …

**`02-sugestoes.js`** (14 funções): `parseBRDate`, `getSessionsNewestFirst`, `localTodayISO`, `dateToInputValue`, `dateToBR`, `isRevisionSession`, `sessionMatchesTopic`, `getStudyTracks`, `getSuggestionMode`, `updateSuggestionModeHelp`, `saveSuggestionMode`, `getStudySuggestionCandidates`, `getNextStudyRecommendation`, `applyStudyRecommendation`

**`03-utilitarios.js`** (18 funções): `fmtHM`, `fmtHoras`, `getTombstones`, `setTombstones`, `addTombstones`, `unionTombstones`, `getLegacyIdSet`, `diagnoseTopics`, `renderTopicDiagnostics`, `cleanupLegacyTopics`, `adjustProgressForSession`, `setHeaderHeightVar`, `syncSidebarToggle`, `toggleSidebar` …

**`04-inicio.js`** (26 funções): `getStudyTrackOptions`, `saveStudyTracks`, `trackOptionsHtml`, `populateRegTrackSelect`, `refreshTrackViews`, `renderStudyTracksManager`, `addStudyTrack`, `renameStudyTrack`, `deleteStudyTrack`, `contestSubtitleText`, `refreshContestSubtitle`, `isPristineLocalState`, `onboardingHtml`, `getPanelSummaryText` …

**`05-registro.js`** (17 funções): `initRegistrationForm`, `updateRegTopics`, `handleStudySessionSubmit`, `getInlineSessionEditorMarkup`, `populateInlineTopicSelect`, `saveInlineSession`, `sessionTopicLabel`, `renderSessionsList`, `fillSessionTopicSelect`, `onSessionTableChange`, `applySessionPatch`, `onSessionTableClick`, `updateEditSessionTopics`, `editSession` …

**`06-edital.js`** (3 funções): `initEditalFilters`, `updateEditalTopicsFilter`, `renderEditalVerticalizado`

**`07-concursos.js`** (22 funções): `getDeletedContestMap`, `mergeDeletedContestMaps`, `setDeletedContestMap`, `isContestDeleted`, `purgeContestLocalStorage`, `contestKey`, `renderContestSelector`, `renderContestManager`, `deleteContest`, `saveCurrentContestSnapshot`, `restoreSnapshotToMemory`, `changeContest`, `saveContestSettings`, `addContest`, `renderPrioritySettings`, `savePrioritySettings`, `recalculateDisciplineWeightsByPriority`, `renderCustomization`, `updateWeightShares`, `disciplinePriorityChanged`, `addDisciplineToContest` …

**`08-importacao-ia.js`** (15 funções): `extractPdfText`, `normalizeSyllabusKey`, `getSyllabusPriority`, `parseSpreadsheetNumber`, `clearManualSyllabusForm`, `editSyllabusItem`, `saveManualSyllabusItem`, `deleteSyllabusItem`, `refreshSyllabusViews`, `renderSyllabusManager`, `downloadSyllabusTemplate`, `importManualSyllabusFile`, `chamarIAServidor`, `analyzeEditalAI` …

**`09-sincronizacao.js`** (32 funções): `collectContestSnapshots`, `buildCurrentCloudPayload`, `mergeNoteValues`, `mergeRecordValue`, `mergeRecordLists`, `mergeSettingsObjects`, `mergeContestSnapshot`, `mergeContestSnapshots`, `upsertCloudPayloadSafely`, `persistSnapshotMapToLocal`, `adoptMergedCloudPayloadLocally`, `saveSupabaseSettings`, `initializeSupabase`, `formatSavedAt` …

**`10-dados-backup.js`** (6 funções): `updateContestHeader`, `loadSupabaseSettings`, `confirmReset`, `exportData`, `applyImportedBackup`, `importData`

**`11-datas-anotacoes.js`** (12 funções): `openModal`, `closeModal`, `saveModalNote`, `getImportantDates`, `saveImportantDates`, `dayDiffFromToday`, `fmtBRDateISO`, `daysChip`, `dateRowHtml`, `renderImportantDates`, `addImportantDate`, `renderDashboard`

## Onde mexer em cada pedido

| Quero mudar… | Arquivo |
|---|---|
| Aba Registro / tabela de sessões | `js/05-registro.js` (+ trecho `#tab-registro` no `index.html`) |
| Formato das horas (HH:mm) | `js/03-utilitarios.js` (`fmtHM`, `fmtHoras`) |
| Menu lateral | `js/03-utilitarios.js` + `css/estilos.css` |
| Painéis da Home / sugestões | `js/04-inicio.js`, `js/02-sugestoes.js` |
| Datas Importantes | `js/11-datas-anotacoes.js` |
| Edital, importação, IA | `js/06-edital.js`, `js/08-importacao-ia.js` |
| Quem pode usar IA / aba Usuários | `js/12b-usuarios.js` + `schema_usuarios_v10_33.sql` |
| Concursos, prioridades, disciplinas | `js/07-concursos.js` |
| Sincronização, login, mesclagem | `js/09-sincronizacao.js`, `js/auth.js` |
| Backup (exportar/importar) | `js/10-dados-backup.js` |
| Aparência | `css/estilos.css` |

## Ao publicar uma nova versão

1. Mude `window.APP_VERSION` em `js/00-config.js`.
2. Mude `CACHE_NAME` em `service-worker.js` (senão os aparelhos continuam com o cache antigo).
3. Se criar um arquivo novo, inclua-o em `index.html` (na ordem certa) **e** em `APP_SHELL` no `service-worker.js`.
4. Em correções pontuais, basta enviar só os arquivos alterados.


## V10.11 — gerenciamento de concursos e identidade visual
- A exclusão de concursos fica em Personalização → Gerenciar concursos.
- A exclusão registra marcas globais (`tce_deleted_contests`) que são sincronizadas com o Supabase para impedir que dados antigos de outro dispositivo recuperem concursos removidos.
- O aplicativo mantém pelo menos um concurso; ao excluir o ativo, seleciona outro automaticamente.
- Ícone do app azul com símbolo branco, favicon e ícones PWA atualizados.


## V10.20 — Seletor de semana em Estatísticas
A tela Estatísticas permite selecionar uma semana a partir do seletor no cabeçalho. Os KPIs semanais, as colunas por disciplina e os totalizadores da tabela usam a semana selecionada; os acumulados gerais não mudam. As semanas disponíveis vão da semana do registro mais antigo até a semana atual.


## V10.21 — Gráficos de Estatísticas

Adiciona seis visualizações construídas localmente (sem bibliotecas externas): evolução de sessões de estudo por semana, horas de estudo por semana, distribuição de horas por disciplina na semana selecionada, estudos por prioridade, comparação semanal entre estudos e revisões e questões respondidas por semana. Os gráficos são calculados a partir de `studySessions`; os gráficos da semana selecionada respondem ao seletor de semana já existente. A renderização é responsiva e mantém suporte offline.


## V10.22 — Visão geral nos gráficos de Estatísticas
- Os gráficos de evolução semanal passam a cobrir todo o histórico datado de sessões até a semana atual, independentemente da semana selecionada nos cartões e na tabela.
- A distribuição de horas por disciplina usa o acumulado geral de minutos e a distribuição por prioridade usa a quantidade total de sessões de estudo.
- As séries históricas permitem rolagem horizontal quando há muitas semanas registradas.
- Os cartões semanais e as colunas semanais da tabela continuam dependentes do seletor.

## V10.23 — Padronização dos módulos JavaScript
- O módulo de Estatísticas foi renomeado para `js/12-estatisticas.js`.
- O módulo de inicialização foi renomeado para `js/13-iniciar.js`, mantendo-o como último módulo de lógica.
- O `index.html` registra a versão e mantém a ordem explícita de carregamento dos módulos.

## V10.24 — Ajustes finais dos gráficos
- O gráfico de prioridades usa barras mais estreitas e com menor espaçamento.
- O comparativo semanal posiciona os valores acima das respectivas barras sem ocultar as barras.

## V10.25 — Rótulos responsivos nas prioridades
- Os rótulos de prioridade podem quebrar linha para não se sobreporem.
- O gráfico de prioridades ocupa a largura disponível no celular, mantendo “Sem prioridade definida” visível.

## V10.26 — Sincronização inicial por timestamp
- Na abertura, o app compara o `updated_at` remoto com o snapshot local.
- Dados remotos mais recentes são baixados automaticamente.
- Dados locais mais recentes continuam sendo enviados e mesclados.
- O download automático não exibe o diálogo da sincronização manual.

## V10.27 — Prioridade do snapshot remoto
- Quando `updated_at` da Supabase é mais recente, o download inicial prioriza o snapshot remoto correspondente.
- Isso evita que um timestamp antigo dentro do snapshot local impeça a aplicação dos dados mais novos da nuvem.

## V10.28 — Prioridade gravada na sessão
- `05-registro.js`: cada sessão nova (e editada) passa a guardar `priority` do tópico.
- `12-estatisticas.js`: `buildStatisticsModel` usa `session.priority` quando o tópico não está no edital carregado e preenche, uma vez, as sessões antigas sem prioridade (depois salva/sincroniza).
- O gráfico "Estudos por prioridade — geral" deixa de mostrar o aviso de deslizar (não rola no celular).

## V10.29 — Interface e histórico
- `js/12a-ux.js` (novo, carregado antes de `13-iniciar.js`): barra inferior (≤1023px), campo de minutos (±5, h:mm), desfazer exclusão de registro (restaura com id novo por causa dos tombstones) e re-renderização do histórico ao mudar entre tabela e cartões.
- `05-registro.js`: busca por texto (inclui a anotação do tópico) e filtro de período no histórico; cartões no celular (≤640px) com anotação; ação `edit`; estados vazios com ação.
- `03-utilitarios.js`: `parseMinutesInput` e `fmtMinutesHM`. `01-base.js`: `showToast(titulo, msg, nivel, {label,onClick})`.
- `index.html`: `viewport-fit=cover`, `type="button"` em todos os botões, rótulos associados aos campos. `css/estilos.css`: foco visível, `prefers-reduced-motion`, fontes mínimas de 11px, alvos de 44px no celular.

## V10.30 — Navegação, semana e datas
- `12a-ux.js`: barra inferior reorganizada (Cronograma · Edital · ＋ Lançar · Estatísticas · Mais) e folha "Mais" (Datas, Personalização, Configurações, tema, menu completo); Esc fecha menu e folha; foco no botão Fechar do menu.
- `12-estatisticas.js`: barras do gráfico semanal viram botões (`data-week`) que selecionam a semana; `renderStatisticsWeekCard` mostra totais e horas por disciplina; a tabela "Detalhamento por prioridade e disciplina" foi removida. `openHistoryForWeek` (em `05-registro.js`) abre o histórico filtrado pela semana (período `range`).
- `09-sincronizacao.js`: `mergeImportantDateLists`/`withMergedImportantDates` mesclam as datas importantes por id (`updatedAt`) com lista de excluídas (`importantDatesDeleted`); selo de nuvem relativo ("há 2 dias"; âmbar após 24h).
- `11-datas-anotacoes.js`: lista única por data, concluídas riscadas e visíveis.
- `04-inicio.js`: selo "+1h20 na semana" por disciplina e botão "Lançar estudo desta disciplina" nas sugestões. CSS: espaço da barra aplicado ao `main` (o `body` tem `h-full`), botão flutuante ocultado, cabeçalho compacto.

## V10.31 — Correção do Cronograma
- Removido o bloco de CSS que reordenava o Cronograma no celular (`display:contents`, `order`, faixa de KPIs): ele sobrescrevia a regra que esconde as abas (`#content-cronograma{display:flex}` vence `.hidden`) e quebrava a ordem dos 4 cartões. A ordem estabelecida continua em `.activity-panels-grid` (colunas `study-column`/`suggestions-column`, `order` 1–4).
- Regra geral: nunca aplique `display` por id/seletor específico em `.tab-content`; use `:not(.hidden)`.
- Ícone do selo de nuvem desatualizado trocado por `fa-triangle-exclamation` (o de nuvem com exclamação é Pro).

## V10.32 — Espaço inferior, filtros e observações
- Espaço no fim das páginas: `main::after` (≤1023px). O `.app-shell` tem `min-height:0` e o `body` altura fixa, então o `main` tem a altura da tela e o conteúdo transborda; padding no `main` não cria espaço, um elemento no fluxo após o conteúdo cria.
- Rolagem lateral: selects com opções longas (filtros do histórico e do Edital) alargavam a página. `main select{max-width:100%}`, filtros do Edital com `flex-wrap`, `body{overflow-x:clip}` como rede de segurança.
- `05-registro.js`: campo `obs` na sessão (formulário `#reg-obs`, modal `#edit-session-obs`, tabela inline, cartões, busca) e `filterHistoryByFormDiscipline()` (botão "Disciplina do lançamento").
- `11-datas-anotacoes.js`: a data final ("até") só aparece quando existe; senão o botão "+ período".
- `09-sincronizacao.js`: o selo de nuvem só fica âmbar com alteração local pendente (`pendente · há N`).

## V10.33 — Módulo de usuários (permissão de IA)
- Modelo (igual ao do Planner Escolar, adaptado): `study_app_admins` (administradores) e `study_ai_access` (`allowed` por usuário; sem linha = sem IA). As tabelas não têm acesso direto (RLS sem policy): tudo passa por funções `study_*` (security definer).
- Funções: `study_is_admin`, `study_can_use_ai` (usada também pela Edge Function), `study_my_access` (o app chama no login), `study_all_users` (só admin; lê `auth.users`) e `study_set_ai` (só admin).
- Padrão: só o administrador (westter@gmail.com) usa IA. Os demais ficam "Sem IA" até o admin liberar na aba **Usuários**.
- Interface: todo elemento com a classe `ia-only` some quando o usuário não tem IA (`body:not(.ia-allowed) .ia-only`); `admin-only` some para quem não é admin. **Todo botão/painel novo com IA deve receber `ia-only`** e a função correspondente deve chamar `StudyUsers.requireAI()` no início.
- Falha fechada: se a consulta ao banco falhar (ou o SQL não tiver sido rodado), a IA fica oculta.
- Ocultar botão é só interface. A barreira real é o banco/servidor: veja no LEIA-ME-V10.33.txt o trecho para a Edge Function `dynamic-service`.
- Atualização da permissão: ao logar, ao abrir o Edital e ao voltar para o app (no máximo a cada 30 s).

## V10.34 — Nota por registro, lançamento pré-preenchido e uso da IA
- **Nota por registro**: a nota fica na própria sessão (`obs` + `notesUpdatedAt`). Nenhum painel por tópico/disciplina tem nota própria: eles mostram a nota da **sessão mais recente** (`getTopicNote`, `getLatestSessionByItemMap`) e editar ali (`openModal(idDoTópico)` → `setLatestNoteForItem`) altera só essa sessão. `openModal('session:<id>')` edita a nota de um registro específico (histórico e "Últimos estudos"). Ficam em `js/05-registro.js` e `js/11-datas-anotacoes.js`.
- **Migração única** (`ensureNotesMigrated`): a nota antiga do tópico (`userProgress[].notes`) vira a nota da sessão mais recente do tópico e o item recebe `notesMigrated`. O campo antigo só é usado como reserva quando o tópico não tem nenhuma sessão.
- **Sincronização**: `mergeRecordValue` trata `obs` como as notas (vence o `notesUpdatedAt` mais recente, inclusive para apagar a nota).
- **Lançar estudo desta disciplina** (`prefillStudyForm`, em `05-registro.js`): usado pelos botões das Sugestões e por "Usar disciplina". Preenche disciplina, último tópico estudado, tipo, trilha, minutos e a nota do último estudo; data = hoje; questões = 0; filtra o histórico pela disciplina. A pesquisa do último estudo ignora revisões (se só houver revisão, usa a revisão).
- **Formulário**: o campo "Observações" virou "Nota"; os botões −5/+5 foram removidos (continua aceitando `85` ou `1:25`).
- **Uso da IA**: `study_ai_usage` (+ `study_log_ai`, `study_ai_usage_summary`, `study_ai_usage_recent`, em `schema_ia_uso_v10_34.sql`). `chamarIAServidor` registra cada consulta (sucesso ou falha) via `StudyUsers.logAI`, com os tokens que a resposta informa (`usageMetadata`) e o modelo (`modelVersion`). Sem esses dados, estima por caracteres ÷ 4 e marca como estimado. A aba Usuários mostra totais, por modelo, por usuário e as últimas consultas, com filtro de período.
- Todo novo ponto de chamada de IA deve passar por `chamarIAServidor` para entrar no histórico.

## V10.35 — Edições não voltam mais ao valor antigo (sincronização)
- Sintoma: ao editar um dado (ex.: diminuir os minutos de uma sessão), o selo ficava "Local" e, ao voltar para "Nuvem", a tela exibia o valor antigo. Causa: a mesclagem com a cópia da nuvem (`mergeRecordValue`) mantinha o MAIOR valor de `minutes/hours/questions/reviews`, o `completed` marcado e o valor não vazio; depois a mesclagem era aplicada na tela (`adoptMergedCloudPayloadLocally`).
- Correção (`js/09-sincronizacao.js`): `saveData()` chama `stampChangedRecords()`, que compara cada registro (sessões, progresso dos tópicos, itens do edital) com o último estado salvo (`localStorage tce_rechash_<usuário>_<concurso>_<lista>`) e grava `updatedAt` só nos que mudaram. Em `mergeRecordLists`, se os dois lados têm `updatedAt` e ele difere, vale o registro inteiro mais recente.
- Registros antigos sem `updatedAt` continuam na regra anterior (maior valor). `baselineRecordHashes(force)` define o ponto de partida sem carimbar: ao abrir o app (`13-iniciar.js`), ao entrar na conta (`auth.js`) e após carregar dados da nuvem/trocar de concurso (`restoreSnapshotToMemory`).
- Limite conhecido: o progresso por tópico (`userProgress.hours/questions/reviews`) é um total derivado das sessões; se dois aparelhos lançarem sessões diferentes no mesmo tópico ao mesmo tempo, vale o total do mais recente (não a soma).

## V10.36 — Ocultação da IA sem depender do CSS em cache
- Relato: outro usuário viu o botão "Análise assistida do edital com IA" (visível, mas sem funcionar: o clique caía na trava `StudyUsers.requireAI()`).
- Reforço: a regra `body:not(.ia-allowed) .ia-only` / `body:not(.is-admin) .admin-only` agora também está embutida no `<head>` do `index.html`, e `StudyUsers.apply()` esconde/mostra os elementos direto por JavaScript (`style.display`), já na abertura do app. Antes isso dependia só do `css/estilos.css`, que o navegador pode manter antigo.
- Só existe um ponto de IA no app (`#ai-edital-file` / `analyzeEditalAI`, dentro do card `.ia-only`). Qualquer novo ponto de IA deve ter a classe `ia-only`.
- Ocultar é só interface; a barreira real continua sendo a checagem `study_can_use_ai()` na Edge Function `dynamic-service` (ver LEIA-ME-V10.33.txt).
