import './style.css';
import { TILES, SEATS, tileName, nextSeat, sortTiles, countsOf } from './tiles.js';
import { tileView, tileRow } from './tile-view.js';
import { replay, applyEvent, expectedInput, visibleCounts, eventText } from './game.js';
import { winInfo } from './hand.js';
import { DEFAULT_RULES, normalizeRules, winPayments } from './rules.js';
import { loadRecord, saveRecord, loadRules, saveRules, validateRecord } from './storage.js';
import { demoRecord } from './demo.js';
import { operationEvents } from './operations.js';
import { createDoubleTap } from './double-tap.js';
import { HELP_CONTENT } from './help-content.js';

const app = document.querySelector('#app');
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n.toFixed(2)).toString();
const signed = (n) => `${n > 0 ? '+' : ''}${num(n)}`;
const kindName = { chi: '吃', peng: '碰', minggang: '明杠', angang: '暗杠', bugang: '补杠' };
const operationNames = { chi: '吃', peng: '碰', gang: '杠', hu: '胡' };
const discardTap = createDoubleTap();
let discardTapTimer;
let record = null, state = null, tab = 'play', setup = { hand: [], dealer: 0 }, config = { ...DEFAULT_RULES };
let advice = null, analysisId = 0, analysisBusy = false, analysisError = '', worker;
let modalActions = [], storageError = '', offlineReady = false, installPrompt;
let boardExpanded = false;
let swRegistration = null;
try { config = loadRules(); } catch { storageError = '保存的规则无法读取，已载入默认家规。'; }
try { const saved = loadRecord(); if (saved) ({ record, state } = saved); }
catch { storageError = '上次牌局无法读取。原始记录仍保留在浏览器中，请先导出故障记录。'; }

function toast(message) {
  const target = document.querySelector('#toast');
  target.textContent = message;
  target.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => target.classList.remove('visible'), 4000);
}
function persist() {
  try { saveRecord(record); storageError = ''; }
  catch { storageError = '本次记录未能保存到浏览器，请导出牌局备份。'; toast(storageError); }
}
function commit(event) {
  try {
    const next = applyEvent(state, event);
    record.events.push(event);
    state = next;
    closeDialog(); persist(); render(); analyze();
  } catch (error) { toast(error.message); }
}
function analyze() {
  resetDiscardTap();
  const id = ++analysisId;
  advice = null; analysisError = ''; analysisBusy = !!state && state.phase !== 'ended';
  // Stop obsolete work when rapid inputs arrive; never show stale suggestions.
  worker?.terminate();
  if (!analysisBusy) { renderAdvice(); return; }
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.id !== analysisId) return;
      if (data.error) analysisError = data.error;
      if (data.result) advice = data.result;
      analysisBusy = !data.final;
      renderAdvice();
    };
    worker.onerror = () => {
      if (id !== analysisId) return;
      analysisError = '建议计算暂不可用，仍可正常记牌和撤销。'; analysisBusy = false; renderAdvice();
    };
    worker.postMessage({ id, state });
  } catch { analysisError = '浏览器未能启动建议计算。'; analysisBusy = false; }
  renderAdvice();
}
function helpButton(topic, label) {
  return `<button type="button" class="help-button" data-action="info" data-topic="${topic}" aria-label="${label}说明" aria-haspopup="dialog"><span aria-hidden="true">?</span></button>`;
}
function showInfo(topic) {
  const content = HELP_CONTENT[topic]; if (!content || document.querySelector('#info-dialog')) return;
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'info-dialog'; dialog.className = 'info-dialog'; dialog.setAttribute('aria-labelledby', 'info-title');
  const status = topic === 'general' ? `<div class="info-status">${offlineReady ? '本机保存 · 离线已就绪' : '本机计算与保存'}</div><p>安卓离线安装需要HTTPS地址，首次完整缓存后可使用。局域网HTTP仅用于在线预览。</p><button class="button wide" data-action="install">添加到主屏幕</button>` : '';
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="info-title">${content.title}</h2><button type="button" class="icon-button" data-action="close-info" aria-label="关闭说明">×</button></div><div class="info-body">${content.body}${status}</div>`;
  document.body.append(dialog);
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    const target = opener?.isConnected ? opener : document.querySelector(`[data-topic="${topic}"]`);
    target?.focus({ preventScroll: true });
  });
  dialog.showModal();
}
function header() {
  return `<header class="app-header"><div class="brand-signature"><a class="brand" href="#" data-action="go-play"><img src="./icon.svg" alt="" width="36" height="36"><span>牌伴</span></a><a class="author-link" href="https://github.com/namgnal" target="_blank" rel="noopener noreferrer" aria-label="作者 namgnal 的 GitHub 主页"><span>by</span> namgnal</a></div><div class="project-links"><button type="button" class="about-button" data-action="info" data-topic="about" aria-label="关于牌伴" aria-haspopup="dialog">关于</button>${helpButton('general', '使用')}</div></header>
    <nav class="tabs" aria-label="主导航">${[['play', '牌局'], ['history', '记录'], ['rules', '规则']].map(([id, label]) => `<button data-action="tab" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
    ${storageError ? `<div class="notice error">${escape(storageError)} <button data-action="raw-export">导出故障记录</button></div>` : ''}
    ${swRegistration?.waiting ? '<div class="update-notice">新版已就绪<button class="button compact" data-action="update-app">刷新使用新版</button></div>' : ''}`;
}
function keypad({ setupMode = false } = {}) {
  const input = state ? expectedInput(state) : null;
  const active = setupMode || (input.kind !== 'none' && !(input.actor === 0 && input.kind === 'discard'));
  const counts = setupMode ? countsOf(setup.hand) : visibleCounts(state);
  const limit = setup.dealer === 0 ? 14 : 13;
  const title = setupMode ? (setup.hand.length === limit ? '起手牌已齐' : `选牌 · 还差 ${limit - setup.hand.length} 张`)
    : input.kind === 'none' ? '确认胡牌或结束本局'
      : input.actor === 0 && input.kind === 'discard' ? '未见牌'
        : input.actor === 0 ? '我摸到的牌' : `${SEATS[input.actor]}出牌`;
  return `<section class="keypad-panel" aria-label="牌面输入"><div class="keypad-heading"><strong>${title}</strong>${helpButton(setupMode ? 'setup' : 'input', setupMode ? '选牌' : '录牌与计数')}</div>
    <div class="keypad ${active ? '' : 'keypad-inactive'}">${[0, 1, 2, 3].map((suit) => `<div class="keypad-row">${TILES.filter((t) => t.suit === suit).map((tile) => tileView(tile.id, { action: setupMode ? 'setup-tile' : 'input-tile', count: setupMode ? null : 4 - counts[tile.id], extra: !setupMode && counts[tile.id] === 4 ? 'tile-exhausted' : '', disabled: !active || counts[tile.id] >= 4 || (setupMode && setup.hand.length >= limit), label: `${title}：${tile.label}${setupMode ? '' : `，未见${4 - counts[tile.id]}张`}` })).join('')}${suit === 3 && !setupMode ? '<span class="keypad-legend">未见张数</span>' : ''}</div>`).join('')}</div></section>`;
}
function setupView() {
  const limit = setup.dealer === 0 ? 14 : 13;
  const activeRules = setup.editing ? setup.rules : config;
  return `<main class="setup-layout"><section class="setup-card"><div class="page-heading"><h1>${setup.editing ? '修正起手牌' : '新牌局'}</h1>${helpButton('setup', '开局')}</div>
    <fieldset class="dealer-picker"><legend>这局谁坐庄？</legend>${SEATS.map((seat, id) => `<label><input type="radio" name="dealer" value="${id}" ${setup.dealer === id ? 'checked' : ''}><span>${seat}</span></label>`).join('')}</fieldset>
    <div class="section-heading"><h2>起手牌</h2><span>${setup.hand.length} / ${limit}</span></div><div class="hand setup-hand">${setup.hand.map((tile, index) => tileView(tile, { action: 'setup-remove', index, label: `移除${tileName(tile)}` })).join('')}${!setup.hand.length ? '<div class="empty-hand">从下方选牌</div>' : ''}</div>
    <button class="button primary wide" data-action="start" ${setup.hand.length !== limit ? 'disabled' : ''}>${setup.editing ? '确认起手牌，重新记录' : '开始这一局'}</button>${setup.editing ? '<button class="button text wide" data-action="cancel-setup">取消修改，返回原牌局</button>' : '<button class="button text wide" data-action="demo">先体验示例牌局 <span aria-hidden="true">↗</span></button>'}
    <div class="setup-note"><span>${setup.editing ? '沿用本局规则' : '家庭规则'} · 底分 ${num(activeRules.base)}</span><button data-action="show-rules">查看规则</button></div></section>${keypad({ setupMode: true })}</main>`;
}
function playerCard(seat) {
  const player = state.players[seat];
  const current = state.turn === seat && state.phase !== 'ended';
  return `<section class="player-card player-${seat} ${current ? 'current-player' : ''}" aria-label="${SEATS[seat]}的牌区"><div class="player-heading"><strong>${SEATS[seat]}${state.dealer === seat ? '<span class="dealer-tag">庄</span>' : ''}</strong><span class="score ${state.scores[seat] > 0 ? 'positive' : ''}">${signed(state.scores[seat])}<small>分</small></span></div>
    <div class="melds">${player.melds.map((m) => `<span class="meld" title="${kindName[m.kind]}">${tileRow(m.tiles, { small: true })}<small>${kindName[m.kind]}</small></span>`).join('')}</div>
    <div class="river">${player.discards.map((d) => tileView(d.tile, { small: true, extra: `${d.claimedBy !== null ? 'claimed' : ''} ${state.pending?.actor === seat && state.pending.discardIndex === player.discards.indexOf(d) ? 'last-discard' : ''}`, label: `${tileName(d.tile)}${d.claimedBy !== null ? `，已被${SEATS[d.claimedBy]}吃碰杠` : ''}` })).join('') || '<span class="empty-river">尚未出牌</span>'}</div></section>`;
}
function selfActions() {
  if (state.phase === 'ended') return '';
  return `<div class="operation-bar" aria-label="记录吃碰杠胡">${Object.entries(operationNames).map(([operation, label]) => {
    const available = SEATS.some((_, actor) => operationEvents(state, operation, actor).length);
    return `<button class="button operation-button ${operation === 'hu' ? 'win' : ''}" data-action="operation" data-operation="${operation}" ${available ? '' : 'disabled'} aria-label="${label}" title="${available ? `记录${label}牌，下一步选人` : `当前没有可记录的${label}牌`}">${label}</button>`;
  }).join('')}</div>${state.phase === 'response' && nextSeat(state.pending.actor) === 0 ? '<button class="button subtle pass-button" data-action="pass">无人响应，继续</button>' : ''}`;
}
function boardView() {
  const selfDiscard = state.turn === 0 && state.phase === 'discard';
  const input = expectedInput(state), showKeypad = input.kind !== 'none' && !selfDiscard;
  return `<main class="play-layout ${selfDiscard ? 'own-discard' : ''} ${showKeypad ? 'has-keypad' : ''} ${state.phase === 'ended' ? 'ended-layout' : ''}"><div class="play-column"><div class="game-toolbar"><div>${state.demo ? '<span class="demo-tag">示例牌局</span>' : ''}<span class="muted">牌墙 ${state.wall}</span></div><div><button class="button compact" data-action="undo" ${record.events.length ? '' : 'disabled'}>↶ 撤销</button><button class="button compact subtle" data-action="new">新一局</button></div></div>
    <div class="mobile-table-summary"><button data-action="toggle-board" aria-expanded="${boardExpanded}"><span>${state.phase === 'ended' ? '本局已结束' : state.pending && state.phase === 'response' ? `${SEATS[state.pending.actor]}刚打出 <strong>${tileName(state.pending.tile)}</strong>` : state.turn === 0 ? '轮到我' : `轮到${SEATS[state.turn]}`}</span><small>${boardExpanded ? '收起 ▴' : '牌桌 ▾'}</small></button><div class="mini-scores">${SEATS.map((seat, id) => `<span>${seat}${id === state.dealer ? '·庄' : ''} <b>${signed(state.scores[id])}</b></span>`).join('')}</div></div>
    <div class="table-board ${boardExpanded ? 'expanded' : ''}">${playerCard(2)}${playerCard(3)}<div class="table-center">${state.pending && state.phase === 'response' ? `<div class="last-play">${tileView(state.pending.tile)}<span>${SEATS[state.pending.actor]}刚打出</span></div>` : `<span class="table-status">${state.phase === 'ended' ? '本局已结束' : state.phase === 'exhausted' ? '牌墙已摸完' : state.turn === 0 ? '轮到我' : `轮到${SEATS[state.turn]}`}</span>`}</div>${playerCard(1)}${playerCard(0)}</div>
    ${state.phase === 'ended' ? endSummary() : ''}
    <section class="my-hand-panel"><div class="section-heading"><h2>我的手牌 <small>${state.hand.length} 张</small></h2>${helpButton('hand', '手牌与操作')}</div><div class="hand">${state.hand.map((tile, index) => tileView(tile, { action: selfDiscard ? 'discard' : '', index, selected: state.drawn === tile && state.hand.lastIndexOf(tile) === index, label: selfDiscard ? `打出${tileName(tile)}` : tileName(tile) })).join('')}</div>${selfActions()}</section>
    <section id="advice" class="advice-panel" aria-label="操作建议" aria-live="polite"></section>${state.phase !== 'ended' ? '<button class="button text mobile-end" data-action="end">流局 / 结束本局</button>' : ''}</div>
    <aside class="input-column">${state.phase !== 'ended' ? keypad() : '<section class="card next-round"><h2>本局已结束</h2><button class="button primary wide" data-action="new">开始新一局</button><button class="button wide" data-action="export">导出这局记录</button></section>'}${state.phase !== 'ended' ? '<button class="button text wide end-button" data-action="end">流局 / 结束本局</button>' : ''}</aside></main>`;
}
function endSummary() {
  const end = state.end;
  return `<section class="result-panel"><div class="section-heading"><strong>${end.kind === 'win' ? `${SEATS[end.winner]}${end.from === null ? '自摸' : '胡牌'} · ${end.patterns.join(' + ') || '普通胡'}` : '本局结束'}</strong>${helpButton('win', '本局结算')}</div><p>${end.kind === 'win' ? end.payment.details.map((d) => `${SEATS[d.payer]}付 ${num(d.amount)} 分`).join('，') : '已保留杠牌积分'}</p></section>`;
}
function adviceHTML() {
  if (!state || state.phase === 'ended') return '';
  if (analysisError) return `<strong>建议暂不可用</strong><p>${escape(analysisError)}</p><button data-action="retry">重新计算</button>`;
  if (!advice) return '<div class="advice-label"><span class="pulse"></span>正在核对这一手…</div>';
  const best = advice.candidates[0];
  const fact = (item) => item.action === 'win' ? `本次胡牌收取 ${num(item.points)} 分 · ${item.patterns.join(' + ')}`
    : `${item.shanten === 0 ? '听牌' : `距听牌 ${item.shanten} 步`} · ${item.tiles.length} 种有效牌 / 未见 ${item.count} 张${item.points ? ` · 杠牌立即 +${num(item.points)} 分` : ''}`;
  return `<div class="advice-label"><span>${best ? '下一步参考' : '手牌观察'}</span><div class="heading-tools"><span class="method-tag">${analysisBusy ? '试验 · 细算中' : '试验策略'}</span>${helpButton('advice', '建议')}</div></div>
    ${best ? `<div class="advice-main"><div><h2>${best.label}</h2><p>${fact(best)}</p></div>${best.action === 'discard' ? `<div class="discard-shortcut">${tileView(best.tile, { action: 'recommended-discard', index: state.revision, extra: 'recommended-discard', label: `双击打出${tileName(best.tile)}` })}<span class="discard-shortcut-hint">双击出牌</span></div>` : ''}</div>
      ${best.risk?.length ? `<p class="risk-note">留意：${best.risk.join('；')}</p>` : ''}
      ${best.tiles?.length ? `<div class="effective-tiles"><span>${best.shanten === 0 ? '可胡的牌' : '可推进的牌'}</span>${best.tiles.map((t) => tileView(t.tile, { small: true, count: t.count })).join('')}</div>` : ''}
      ${best.action !== 'discard' && best.action !== 'pass' ? '<button class="button compact" data-action="adopt">记录这步</button>' : ''}
      ${advice.candidates.length > 1 || best.targets?.length ? `<details class="alternatives"><summary>更多选择${advice.candidates.length > 1 ? ` · ${advice.candidates.length - 1}` : ''}</summary>${best.targets?.length ? `<p class="muted">可关注：${best.targets.join('、')}</p>` : ''}${advice.candidates.slice(1).map((c) => `<div class="alternative"><strong>${c.label}</strong><span>${fact(c)}</span></div>`).join('')}</details>` : ''}`
      : advice.progress ? `<h2 class="progress-heading">${advice.progress.shanten === 0 ? '已经听牌' : `距听牌 ${advice.progress.shanten} 步`}</h2>` : '<p>牌墙已摸完，请确认最后一张是否有人胡牌。</p>'}`;
}
function renderAdvice() {
  const target = document.querySelector('#advice'); if (!target) return;
  const previous = target.querySelector('.recommended-discard');
  target.innerHTML = adviceHTML();
  const next = target.querySelector('.recommended-discard');
  // Keep the touch target when refinement returns the same discard.
  if (previous && next && previous.dataset.tile === next.dataset.tile && previous.dataset.index === next.dataset.index) {
    next.replaceWith(previous);
    if (previous.classList.contains('tap-armed')) target.querySelector('.discard-shortcut-hint').textContent = '再点一次出牌';
  } else resetDiscardTap();
}
function resetDiscardTap() {
  discardTap.reset(); clearTimeout(discardTapTimer);
  document.querySelector('.recommended-discard')?.classList.remove('tap-armed');
  const hint = document.querySelector('.discard-shortcut-hint'); if (hint) hint.textContent = '双击出牌';
}
function tapRecommendedDiscard(button) {
  const tile = Number(button.dataset.tile), revision = Number(button.dataset.index);
  const best = advice?.candidates[0];
  if (!state || state.turn !== 0 || state.phase !== 'discard' || state.revision !== revision || best?.action !== 'discard' || best.tile !== tile) {
    resetDiscardTap(); return;
  }
  if (discardTap.tap(`${analysisId}:${revision}:${tile}`)) {
    resetDiscardTap(); commit({ type: 'discard', actor: 0, tile });
  } else {
    button.classList.add('tap-armed');
    document.querySelector('.discard-shortcut-hint').textContent = '再点一次出牌';
    clearTimeout(discardTapTimer); discardTapTimer = setTimeout(resetDiscardTap, 450);
  }
}

function historyView() {
  return `<main class="document-page"><div class="page-heading"><h1>牌局记录</h1>${helpButton('history', '记录与纠错')}</div>
    <div class="history-tools"><button class="button" data-action="export" ${record ? '' : 'disabled'}>导出牌局</button><button class="button" data-action="import">导入牌局</button><button class="button" data-action="undo" ${record?.events.length ? '' : 'disabled'}>↶ 撤销最后一步</button></div>
    ${state ? `<section class="card"><div class="section-heading"><h2>本局积分${state.demo ? ' · 示例' : ''}</h2><div class="heading-tools"><span class="muted">底分 ${num(state.rules.base)}</span>${helpButton('win', '本局积分')}</div></div><div class="score-grid">${SEATS.map((seat, id) => `<div><span>${seat}${id === state.dealer ? ' · 庄' : ''}</span><strong>${signed(state.scores[id])}</strong></div>`).join('')}</div>${state.ledger.map((entry) => `<p class="ledger-line"><strong>${entry.label}</strong> ${entry.details.map((d) => `${SEATS[d.payer]} → ${SEATS[d.receiver]} ${num(d.amount)}分`).join(' · ')}</p>`).join('')}</section>
    <ol class="timeline">${record.events.map((event, index) => `<li><span class="event-no">${index + 1}</span><div><strong>${escape(eventText(event))}</strong></div><button class="button compact subtle" data-action="rewind" data-index="${index}">从此步重录</button></li>`).reverse().join('')}<li class="initial-event"><span class="event-no">起</span><div><strong>${SEATS[record.initial.dealer]}坐庄 · 起手 ${record.initial.hand.length} 张</strong><div class="initial-tiles">${tileRow(sortTiles(record.initial.hand), { small: true })}</div></div><button class="button compact subtle" data-action="edit-initial">修正起手牌</button></li></ol>` : '<section class="empty-state"><p>还没有牌局记录</p><button class="button primary" data-action="go-play">去开局</button></section>'}</main>`;
}
const boolFields = [['allowChi', '吃上家'], ['allowPeng', '碰牌'], ['allowGang', '明杠、暗杠、补杠'], ['sevenPairs', '小七对'], ['quadAsPairs', '四张同牌计两对'], ['pureSuit', '清一色奖励'], ['scattered', '十三烂'], ['stackSpecial', '特殊倍率叠加']];
const numberFields = [['base', '底分'], ['dealerMultiplier', '庄家倍率'], ['discardMultiplier', '点炮者付款倍率'], ['otherDiscardPay', '其余两家付款倍率'], ['selfDrawMultiplier', '自摸付款倍率'], ['specialMultiplier', '特殊牌型倍率'], ['kongPayment', '杠牌付款倍率']];
function rulesView() {
  return `<main class="document-page"><div class="page-heading"><h1>规则设置</h1><div class="heading-tools"><span class="muted">用于下一局</span>${helpButton('rules', '规则生效')}</div></div>
    <form id="rules-form"><section class="card"><div class="section-heading"><h2>牌型与操作</h2>${helpButton('patterns', '牌型与操作规则')}</div><div class="toggle-grid">${boolFields.map(([key, label]) => `<label class="toggle-row"><span>${label}</span><input type="checkbox" name="${key}" role="switch" ${config[key] ? 'checked' : ''}></label>`).join('')}</div></section>
    <section class="card"><div class="section-heading"><h2>积分结算</h2>${helpButton('scoring', '积分与倍率')}</div><div class="number-grid">${numberFields.map(([key, label]) => `<label class="number-field"><span>${label}</span><input type="number" name="${key}" value="${config[key]}" min="${['kongPayment', 'otherDiscardPay'].includes(key) ? 0 : 0.01}" max="10000" step="0.01" required inputmode="decimal"></label>`).join('')}<label class="number-field"><span>单家封顶倍率</span><input type="number" name="cap" value="${config.cap ?? ''}" min="1" max="10000" step="0.01" placeholder="不封顶" inputmode="decimal"></label></div><details class="rule-preview"><summary>查看结算示例</summary><div class="rule-example" id="rule-example">${ruleExample(config)}</div></details></section>
    <div class="rule-limits"><span>抢杠胡等规则尚未支持</span>${helpButton('unsupported', '未支持规则')}</div>
    <div class="form-actions"><button class="button primary" type="submit">保存，下一局生效</button><button class="button" type="button" data-action="reset-rules">恢复默认</button></div></form></main>`;
}
function ruleExample(rules) {
  const ron = winPayments({ winner: 1, from: 0, dealer: 2, rules }).delta;
  const self = winPayments({ winner: 0, dealer: 0, patterns: rules.sevenPairs ? ['小七对'] : [], rules }).delta;
  return `<strong>按当前设置试算</strong><p>闲家点炮给闲家，庄家旁观：点炮者付 ${num(-ron[0])}，庄家付 ${num(-ron[2])}，另一家付 ${num(-ron[3])}。</p><p>庄家自摸${rules.sevenPairs ? '小七对' : '普通胡'}：另外三家各付 ${num(-self[1])}。</p><p>任何人开杠：每家付 ${num(rules.base * rules.kongPayment)}，开杠者收 ${num(rules.base * rules.kongPayment * 3)}。</p>`;
}
function readRuleForm(form) {
  const data = new FormData(form), result = {};
  for (const [key] of boolFields) result[key] = data.has(key);
  for (const [key] of numberFields) result[key] = data.get(key);
  result.cap = data.get('cap');
  return normalizeRules(result);
}
function render() {
  resetDiscardTap();
  app.innerHTML = `${header()}${tab === 'rules' ? rulesView() : tab === 'history' ? historyView() : state ? boardView() : setupView()}`;
  renderAdvice();
}
function openDialog(title, body, actions = [], topic = '') {
  const opener = document.activeElement;
  closeDialog(); modalActions = actions;
  const dialog = document.createElement('dialog'); dialog.id = 'modal';
  dialog.setAttribute('aria-labelledby', 'modal-title');
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="modal-title">${title}</h2><div class="heading-tools">${topic ? helpButton(topic, title) : ''}<button class="icon-button" data-action="close" aria-label="关闭">×</button></div></div><div class="dialog-body">${body}</div>`;
  document.body.append(dialog);
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDialog();
  });
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus({ preventScroll: true }); });
  dialog.showModal();
}
function closeDialog() { const dialog = document.querySelector('#modal'); if (dialog) { dialog.close(); dialog.remove(); } }
function actionButtons(actions) {
  return actions.map((action, index) => `<button class="button dialog-action" data-action="modal-event" data-index="${index}">${action.label}</button>`).join('');
}
function operationDialog(operation) {
  const label = operationNames[operation]; if (!label) return;
  const buttons = SEATS.map((seat, actor) => {
    const available = operationEvents(state, operation, actor).length > 0;
    return `<button class="button seat-choice" data-action="operation-actor" data-operation="${operation}" data-actor="${actor}" ${available ? '' : 'disabled'}>${seat}</button>`;
  }).join('');
  const context = state.phase === 'response' ? `${SEATS[state.pending.actor]}刚打出${tileName(state.pending.tile)}` : `当前轮到${SEATS[state.turn]}`;
  openDialog(`谁${label}？`, `<p class="operation-context">${context}</p><div class="operation-seats">${buttons}</div>`, [], 'operations');
}
function actorOperationDialog(operation, actor) {
  const events = operationEvents(state, operation, actor);
  if (!events.length) return;
  if (operation === 'hu' && events.length === 1) { winDialog(actor, events[0].method); return; }
  const actions = events.filter((event) => !(actor !== 0 && event.kind === 'angang')).map((event) => ({
    event,
    label: event.type === 'win' ? (event.method === 'self' ? '自摸胡' : `胡${SEATS[state.pending.actor]}打出的${tileName(state.pending.tile)}`)
      : `${kindName[event.kind]} ${tileRow(event.tiles ?? [event.tile], { small: true })}`,
    ...(event.type === 'win' ? { run: () => winDialog(actor, event.method) } : {}),
  }));
  if (actor !== 0 && events.some((event) => event.kind === 'angang')) actions.push({ label: '暗杠', run: () => concealedKongDialog(actor) });
  openDialog(`${SEATS[actor]}${operationNames[operation]}`, `<button class="button text dialog-back" data-action="operation" data-operation="${operation}">‹ 重选玩家</button><div class="operation-options">${actionButtons(actions)}</div>`, actions, operation === 'gang' ? 'kong' : 'operations');
}
function concealedKongDialog(actor) {
  const events = operationEvents(state, 'gang', actor).filter((event) => event.kind === 'angang');
  const unknown = events.some((event) => event.tile === null);
  const actions = TILES.map((tile) => ({ event: events.find((event) => event.tile === tile.id) }));
  openDialog(`${SEATS[actor]}暗杠`, `<button class="button primary wide" data-action="unknown-kong" data-actor="${actor}" ${unknown ? '' : 'disabled'}>暗杠，牌面未知</button><details><summary>我看到了暗杠牌面</summary><div class="dialog-tile-grid">${TILES.map((tile) => tileView(tile.id, { action: 'modal-event', index: tile.id, disabled: !actions[tile.id].event })).join('')}</div></details>`, actions, 'kong');
}
function winDialog(actor, method) {
  const own = actor === 0;
  const patterns = own ? winInfo(method === 'ron' ? [...state.hand, state.pending.tile] : state.hand, state.players[0].melds, state.rules).patterns : [];
  let body = `<p>记录${SEATS[actor]}${method === 'self' ? '自摸' : `胡${SEATS[state.pending.actor]}的牌`}。</p>`;
  if (own) body += `<p><strong>${patterns.join(' + ')}</strong></p>`;
  else body += `<fieldset class="win-patterns"><legend>特殊奖励 · 可选</legend>${[['sevenPairs', '小七对'], ['pureSuit', '清一色'], ['scattered', '十三烂']].filter(([key]) => state.rules[key]).map(([_, label]) => `<label><input type="checkbox" name="win-pattern" value="${label}" ${(label === '小七对' || label === '十三烂') && state.players[actor].melds.length ? 'disabled' : ''}>${label}</label>`).join('')}</fieldset>`;
  body += `<div class="rule-example" id="win-preview"></div><button class="button primary wide" data-action="confirm-win" data-actor="${actor}" data-method="${method}">确认胡牌并结算</button>`;
  openDialog('确认本次胡牌', body, [], 'win'); updateWinPreview(actor, method, patterns);
}
function selectedPatterns() { return [...document.querySelectorAll('[name="win-pattern"]:checked')].map((input) => input.value); }
function updateWinPreview(actor, method, patterns) {
  const payment = winPayments({ winner: actor, from: method === 'ron' ? state.pending.actor : null, dealer: state.dealer, patterns, rules: state.rules });
  document.querySelector('#win-preview').innerHTML = `<strong>胡牌收入 ${num(payment.delta[actor])} 分</strong><p>${payment.details.map((d) => `${SEATS[d.payer]}付 ${num(d.amount)} 分`).join(' · ')}</p>`;
}
function startRecord(initial, events = []) {
  const next = { format: 'paiban-v1', initial, events };
  const valid = validateRecord(next); record = valid.record; state = valid.state; tab = 'play';
  persist(); render(); analyze(); window.scrollTo({ top: 0 });
}
function undo(count = 1) {
  if (!record?.events.length) return;
  record.events.splice(Math.max(0, record.events.length - count));
  state = replay(record.initial, record.events); advice = null;
  persist(); render(); analyze(); toast(count === 1 ? '已撤销，手牌与积分一并还原' : '已回到所选操作之前');
}
function download(content, name) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function reviewImport(raw) {
  const valid = validateRecord(JSON.parse(raw));
  const actions = [{ label: '导入这局', run: () => { closeDialog(); startRecord(valid.record.initial, valid.record.events); toast('已校验并导入'); } }];
  openDialog('导入已通过校验', `<p>共 ${valid.record.events.length} 次操作，${SEATS[valid.record.initial.dealer]}坐庄。${record ? '导入会替换当前显示的牌局，请先导出需要保留的记录。' : ''}</p>${actionButtons(actions)}`, actions);
}
function importRecord() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      if (file.size > 500_000) throw new Error('牌局文件过大，最多支持500KB');
      reviewImport(await file.text());
    } catch (error) { toast(`无法导入：${error.message}`); }
  };
  input.click();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) { resetDiscardTap(); return; }
  event.preventDefault();
  const action = button.dataset.action, tile = Number(button.dataset.tile), index = Number(button.dataset.index);
  if (action !== 'recommended-discard') resetDiscardTap();
  try {
    if (action === 'tab') { tab = button.dataset.tab; render(); window.scrollTo({ top: 0 }); }
    else if (action === 'go-play') { tab = 'play'; render(); }
    else if (action === 'show-rules') { tab = 'rules'; render(); }
    else if (action === 'toggle-board') { boardExpanded = !boardExpanded; render(); }
    else if (action === 'update-app') {
      if (record) saveRecord(record);
      if (!state && setup.hand.length) { toast('请先完成起手录入，再刷新更新'); return; }
      if (tab === 'rules') { toast('请先保存规则并返回牌局，再刷新更新'); return; }
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      swRegistration?.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
    }
    else if (action === 'setup-tile') { if (setup.hand.length < (setup.dealer === 0 ? 14 : 13) && countsOf(setup.hand)[tile] < 4) setup.hand.push(tile); render(); }
    else if (action === 'setup-remove') { setup.hand.splice(index, 1); render(); }
    else if (action === 'start') startRecord({ hand: setup.hand, dealer: setup.dealer, rules: setup.editing ? setup.rules : config, demo: setup.editing ? setup.demo : false });
    else if (action === 'demo') { const demo = demoRecord(config); startRecord(demo.initial, demo.events); }
    else if (action === 'discard') commit({ type: 'discard', actor: 0, tile });
    else if (action === 'recommended-discard') tapRecommendedDiscard(button);
    else if (action === 'input-tile') { const input = expectedInput(state); commit({ type: input.kind, actor: input.actor, tile }); }
    else if (action === 'undo') undo();
    else if (action === 'pass') commit({ type: 'pass' });
    else if (action === 'operation') operationDialog(button.dataset.operation);
    else if (action === 'operation-actor') actorOperationDialog(button.dataset.operation, Number(button.dataset.actor));
    else if (action === 'confirm-win') commit({ type: 'win', actor: Number(button.dataset.actor), method: button.dataset.method, patterns: selectedPatterns() });
    else if (action === 'unknown-kong') commit({ type: 'kong', actor: Number(button.dataset.actor), kind: 'angang', tile: null });
    else if (action === 'modal-event') { const selected = modalActions[index]; if (selected.run) selected.run(); else commit(selected.event); }
    else if (action === 'close') closeDialog();
    else if (action === 'info') showInfo(button.dataset.topic);
    else if (action === 'close-info') document.querySelector('#info-dialog')?.close();
    else if (action === 'adopt') { const selected = advice?.candidates[0]; if (!selected) return; if (selected.event.type === 'win') winDialog(0, selected.event.method); else commit(selected.event); }
    else if (action === 'retry') analyze();
    else if (action === 'new') {
      const actions = [{ label: '开始录入新一局', run: () => { closeDialog(); worker?.terminate(); ++analysisId; state = null; advice = null; setup = { hand: [], dealer: record?.initial.dealer ?? 0 }; tab = 'play'; render(); } }];
      openDialog('开始新一局', `<p>新牌局开始后会替换当前牌局。需要保留时，先导出记录。下一局由你指定庄家。</p><button class="button" data-action="export">先导出当前牌局</button>${actionButtons(actions)}`, actions);
    }
    else if (action === 'end') {
      const actions = [{ label: '确认结束本局', event: { type: 'end' } }];
      openDialog('结束本局', '<p>保留已发生的杠牌收付，不自动计算尚未约定的流局罚分。也可以随后撤销。</p>' + actionButtons(actions), actions);
    }
    else if (action === 'rewind') {
      const count = record.events.length - index;
      const actions = [{ label: `撤销这 ${count} 步并重录`, run: () => { closeDialog(); undo(count); } }];
      openDialog('从这里重新记录', `<p>将撤销第 ${index + 1} 步及之后共 ${count} 步，恢复到“${escape(eventText(record.events[index]))}”之前。</p>${actionButtons(actions)}`, actions);
    }
    else if (action === 'edit-initial') {
      const actions = [{ label: '载入原起手牌进行修改', run: () => {
        closeDialog(); worker?.terminate(); ++analysisId; advice = null;
        setup = { ...structuredClone(record.initial), editing: true }; state = null; tab = 'play'; render(); window.scrollTo({ top: 0 });
      } }];
      openDialog('修正起手牌', `<p>原来的起手牌会保留供你修改。确认后需要重新记录后续 ${record.events.length} 步；取消时原牌局不变。</p>${actionButtons(actions)}`, actions);
    }
    else if (action === 'cancel-setup') { state = replay(record.initial, record.events); setup = { hand: [], dealer: 0 }; render(); analyze(); }
    else if (action === 'export' && record) openDialog('导出这一局', `<p>保存为JSON文件，或复制完整记录文字。导入后能还原规则、手牌、操作和积分。</p><div class="dialog-options"><button class="button primary" data-action="download-record">下载记录文件</button><button class="button" data-action="copy-record">复制记录文字</button></div><label class="record-text-label">完整记录<textarea id="record-text" readonly spellcheck="false">${escape(JSON.stringify(record, null, 2))}</textarea></label><p class="field-help">如果浏览器不支持下载，可复制文字到本地文件保存。请完整保留大括号和标点。</p>`);
    else if (action === 'download-record' && record) { download(JSON.stringify(record, null, 2), `牌伴-${record.initial.demo ? '示例-' : ''}${new Date().toISOString().slice(0, 10)}.json`); toast('已请求下载；若未保存，可复制记录文字'); }
    else if (action === 'copy-record') {
      const text = document.querySelector('#record-text');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text.value).then(() => toast('完整记录已复制')).catch(() => { text.select(); toast('请长按选中的文字复制'); });
      else { text.select(); toast('请长按选中的文字复制'); }
    }
    else if (action === 'raw-export') download(localStorage.getItem('paiban.game.v1') || '{}', '牌伴-原始记录.json');
    else if (action === 'import') openDialog('导入牌局', '<p>选择牌伴导出的JSON文件，或粘贴完整记录文字。载入前会检查整局是否合法。</p><button class="button" data-action="import-file">选择记录文件</button><label class="record-text-label">粘贴记录文字<textarea id="import-text" placeholder="在这里粘贴完整JSON记录" spellcheck="false"></textarea></label><button class="button primary wide" data-action="import-text">检查并导入文字</button>');
    else if (action === 'import-file') importRecord();
    else if (action === 'import-text') { const raw = document.querySelector('#import-text').value; if (raw.length > 500_000) throw new Error('记录过长，最多支持500KB'); reviewImport(raw); }
    else if (action === 'reset-rules') { config = { ...DEFAULT_RULES }; render(); toast('已载入默认值，点击保存后生效'); }
    else if (action === 'install') { if (installPrompt) { installPrompt.prompt(); installPrompt = null; } else toast(offlineReady ? '请使用浏览器菜单中的“添加到主屏幕”' : '当前页面尚未具备离线安装条件，请使用正式 HTTPS 地址'); }
  } catch (error) { toast(error.message); }
});
window.addEventListener('blur', resetDiscardTap);
document.addEventListener('visibilitychange', resetDiscardTap);
document.addEventListener('pointercancel', resetDiscardTap);
document.addEventListener('change', (event) => {
  if (event.target.name === 'dealer') {
    const dealer = Number(event.target.value);
    if (dealer !== 0 && setup.hand.length > 13) { toast('请先从起手牌移除一张，再选择其他庄家'); render(); return; }
    setup.dealer = dealer; render();
  }
  if (event.target.name === 'win-pattern') {
    const button = document.querySelector('[data-action="confirm-win"]');
    updateWinPreview(Number(button.dataset.actor), button.dataset.method, selectedPatterns());
  }
});
document.addEventListener('input', (event) => {
  const form = event.target.closest('#rules-form'); if (!form) return;
  try { document.querySelector('#rule-example').innerHTML = ruleExample(readRuleForm(form)); }
  catch { document.querySelector('#rule-example').textContent = '请填写有效的倍率和底分。'; }
});
document.addEventListener('submit', (event) => {
  if (event.target.id !== 'rules-form') return; event.preventDefault();
  try { const next = readRuleForm(event.target); saveRules(next); config = next; toast('已保存，下一局按新规则计算'); }
  catch (error) { toast(`未保存：${error.message}`); }
});
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; });
render(); analyze();
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    swRegistration = registration;
    const showUpdate = () => {
      if (!registration.waiting || document.querySelector('.update-notice')) return;
      const banner = document.createElement('div'); banner.className = 'update-notice';
      banner.innerHTML = '新版已就绪<button class="button compact" data-action="update-app">刷新使用新版</button>';
      document.querySelector('.tabs').after(banner);
    };
    showUpdate();
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', showUpdate));
    return navigator.serviceWorker.ready;
  }).then(() => {
    offlineReady = true;
  }).catch(() => { /* LAN HTTP preview and restricted browsers remain usable online. */ });
}
