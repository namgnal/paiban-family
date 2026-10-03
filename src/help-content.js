// Explanations live here so the table stays focused on the current decision.
export const HELP_CONTENT = {
  general: {
    title: '使用牌伴',
    body: '<ol class="help-list"><li>选庄家，录入自己的全部起手牌。</li><li>按提示点选摸到的牌或他家弃牌。吃、碰、杠、胡分别记录。</li><li>点手牌记录出牌，也可双击建议牌；单击建议牌不会出牌。</li><li>点错用“撤销”，也可在记录页从某一步重录。</li></ol><p>各区右上角的“？”解释该处操作。牌局只保存在当前浏览器，换设备或开始新局前可先导出。</p>',
  },
  about: {
    title: '关于牌伴',
    body: '<section class="project-about"><div class="about-identity"><img src="./icon.svg" alt="" width="48" height="48"><div><h3>牌伴</h3><span class="about-version">v0.1.4</span></div></div><p class="about-description">麻将记牌与决策参考。</p><div class="about-author"><span>设计与开发</span><a href="https://github.com/namgnal" target="_blank" rel="noopener noreferrer">namgnal <span aria-hidden="true">↗</span></a></div><a class="about-github" href="https://github.com/namgnal/paiban-family" target="_blank" rel="noopener noreferrer">查看 GitHub 项目 <span aria-hidden="true">↗</span></a><p class="about-star">觉得有帮助，欢迎在 GitHub 点个 Star。</p><details class="about-credits"><summary>实现与致谢</summary><p>普通牌效计算基于 @kobalab/majiang-core 1.4.1（MIT）。</p><p><a href="./license.txt" target="_blank" rel="noopener noreferrer">项目许可 · MIT</a> · <a href="./third-party-notices.txt" target="_blank" rel="noopener noreferrer">第三方许可</a></p></details><p class="about-copyright">© 2026 namgnal</p></section>',
  },
  setup: {
    title: '录入起手牌',
    body: '<p>自己坐庄录14张，其他人坐庄录13张。先选庄家，再点选下方牌面，每点一次加入一张。</p><p>点起手牌可以移除误录的牌。牌齐后点击“开始这一局”。请从开局完整记录，不要中途补猜他家暗牌。</p>',
  },
  input: {
    title: '录牌与未见张数',
    body: '<p>标题显示当前需要记录谁的牌。普通轮转直接点牌；有人吃、碰、杠、胡，先点对应操作再继续录牌。</p><p><strong>牌面角标 = 4 − 已知可见张数。</strong>包括自己的手牌、各家弃牌和已知吃碰杠，转移的牌只计一次。</p><p>未见牌可能在牌墙，也可能在他家暗手中；它不是牌墙余量或摸到的概率。没看到的暗杠牌面不会被猜成某一种牌。角标为0时不可再录入。</p><p>点错可撤销，计数会一并恢复。</p>',
  },
  hand: {
    title: '手牌与操作',
    body: '<p>轮到你出牌时，单击手牌即可记录；也可以双击“下一步参考”中的建议牌。</p><p>吃、碰、杠、胡：先选操作，再选玩家和具体牌面。灰色表示当前轮次、规则或已知牌面下不可选。</p><p>自己的摸牌需要录入具体牌面。他家暗手保持未知，正常摸牌会随其出牌或其他操作自动记录。点错后可随时撤销。</p>',
  },
  advice: {
    title: '怎样看建议',
    body: '<p><strong>当前为试验策略，尚未证明实桌长期净积分提升。</strong>建议比较牌效、特殊奖励、杠牌收益与公开危险信号，不能保证是最优解。</p><p>“距听牌”是结构上还差的步数。“有效牌”能推进手牌；旁边的数字是未见张数，可能在他家手中，不是真实摸牌概率。结构听牌也可能遇到所需牌已全部露出。</p><p>双击建议牌会记录出牌，单击只提示再次点击。建议不会自行推进牌局；当前合法胡牌默认建议收下。</p><details><summary>计算依据与开源许可</summary><p>普通向听计算复用 @kobalab/majiang-core 1.4.1（MIT），没有套用日麻计分或振听。七对、十三烂及积分结算由本项目适配。</p><p>当前是启发式排序，尚无校准的对手手牌分布、完整净积分期望或跨局连庄价值模型。</p><a href="./third-party-notices.txt" target="_blank" rel="noopener">查看开源许可</a></details>',
  },
  history: {
    title: '记录与纠错',
    body: '<p>每次记录自动保存于当前浏览器，刷新后可恢复。撤销会同时还原手牌、轮次和积分。</p><p>“从此步重录”会撤销该步及之后的所有操作，再由你重新输入。“修正起手牌”确认后需要重录后续操作，取消则保留原局。</p><p>当前只自动保存一局。开始新局、清理浏览器或换设备前，请导出文件或复制完整记录文字。导入会先检查记录是否合法。</p>',
  },
  rules: {
    title: '规则何时生效',
    body: '<p>默认牌组共136张：万、筒、条各1—9，东南西北中发白，每种4张，无花牌或万能牌。</p><p><strong>每局开局时锁定规则。</strong>这里的修改保存后只用于下一局，不重算当前牌局。每局由你指定庄家。</p><p>恢复默认后仍需点击保存。抢杠胡、一炮多响等规则，当前尚未支持。</p>',
  },
  patterns: {
    title: '牌型与操作规则',
    body: '<dl class="help-definitions"><dt>吃、碰、杠</dt><dd>只能吃上家的弃牌；可以碰任意他家的弃牌。杠牌开关同时控制明杠、暗杠和补杠。</dd><dt>小七对</dt><dd>门清14张组成七对；“四张同牌计两对”决定四张相同牌能否作为两对。</dd><dt>清一色</dt><dd>胡牌全部属于同一种数牌花色；先满足胡牌结构，再计奖励。</dd><dt>十三烂</dt><dd>门清14张，不重复；同花色数牌相差至少3，字牌也不能重复。</dd><dt>特殊倍率叠加</dt><dd>开启时，各种实际成立的特殊牌型倍率相乘；关闭时只计一次特殊奖励。</dd></dl>',
  },
  scoring: {
    title: '积分与倍率',
    body: '<dl class="help-definitions"><dt>底分</dt><dd>计分的基础单位。调整底分，全部收付等比例改变。</dd><dt>庄家倍率</dt><dd>付款方或赢家是庄家时，相关收付乘此倍率。</dd><dt>点炮付款</dt><dd>点炮者按“点炮者付款倍率”付给赢家，另外两家各按“其余两家付款倍率”付款。</dd><dt>自摸付款</dt><dd>另外三家各按自摸倍率付款，再计庄家与特殊牌型奖励。</dd><dt>特殊牌型倍率</dt><dd>适用于小七对、清一色、十三烂。是否相乘由叠加开关决定。</dd><dt>杠牌付款</dt><dd>每家付底分×杠牌倍率，开杠者向另外三家收取；独立于庄家、特殊奖励和胡牌封顶。</dd><dt>单家封顶倍率</dt><dd>限制一次胡牌中每家付款相对底分的最高倍数；留空不封顶，不限制杠牌。</dd></dl>',
  },
  unsupported: {
    title: '尚未支持的规则',
    body: '<p>抢杠胡、一炮多响、过手胡限制、流局罚分尚未实现。每局手动指定庄家，不自动处理连庄奖励。</p><p>若实际遇到这些情况，请保留记录并按现场约定结算，不能直接按普通单人胡记录；应用无法据此给出可靠建议。</p>',
  },
  operations: {
    title: '怎样记录吃碰杠胡',
    body: '<p>先选现场实际操作的人，再选具体牌面或胡牌方式。只能吃上家的牌，可以碰其他任意玩家的牌。</p><p>灰色表示当前轮次、规则或已知牌面下不可选。如果与现场不符，请先检查上一笔是否录错。</p><p>胡刚打出的牌与随后摸牌自摸是两种操作。多人同时胡、抢杠胡尚未配置，不能按普通单人胡记录。</p>',
  },
  kong: {
    title: '怎样记录杠牌',
    body: '<p>明杠使用他家刚打出的牌；暗杠是自己手中的四张同牌；补杠是在已有碰牌上补第四张。</p><p>他家暗杠看不到牌面时选择“牌面未知”，不要猜牌。自己的暗杠必须录入具体牌面。</p><p>按本局规则，每家付底分×杠牌付款倍率，独立于庄家和胡牌奖励。撤销杠牌会一并撤销积分。</p>',
  },
  win: {
    title: '胡牌与本局积分',
    body: '<p>自己的胡牌和奖励根据手牌判断；他家胡牌时，请依据亮出的牌勾选实际成立的奖励。普通胡不需要勾选。</p><p>确认后结算本次胡牌。此前的杠牌积分另记并保留，牌桌与记录页显示的是本局累计积分。结束本局不会自动增加未约定的流局罚分。</p><p>多人同时胡、抢杠胡尚未支持，不能按普通单人胡录入。</p>',
  },
};
