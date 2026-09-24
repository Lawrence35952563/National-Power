/* National Power: static, dependency-free data browser. All research values come from dataset.json. */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textValue = value => value == null || value === '' ? '未注明' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const format = (value, digits = 4) => value == null || value === '' ? '—' : numeric(value) ? (value!==0 && Math.abs(value)<10**(-digits) ? value.toExponential(Math.max(2,digits)) : value.toLocaleString('zh-CN', {maximumFractionDigits:digits})) : String(value);
const shortDate = value => value ? String(value).slice(0,10) : '未注明';
const palette = ['#176b61','#b57d48','#637b9b','#9c647b','#7c864c'];
const app = $('#main');
let db, byId, byIndicator, bySheet;
let currentRoute = '';
const sheetState = new Map();
const routeURL = (path, params = {}) => '#/' + path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
const entityURL = entity => routeURL('entity/' + encodeURIComponent(entity.id));
const indicatorURL = indicator => routeURL('indicator/' + encodeURIComponent(indicator.id));
const cellId = (entityId, indicatorId) => `data-entity="${esc(entityId)}" data-metric="${esc(indicatorId)}"`;
function compositePart(cell, partId) { return cell?.composite?.parts?.find(part=>part.id===partId); }
function displayCellValue(cell, partId=null) {
  if(cell?.error)return cell.error;
  if(cell?.value==null||cell?.value==='')return '—';
  if(cell?.composite?.status==='unparsed')return '待核对';
  if(partId){const part=compositePart(cell,partId);return part?.digits==null?'未单列':String(part.digits);}
  if(cell?.kind==='composite')return cell.composite?.display || '组合记录';
  return format(cell.value);
}
function compositeDefinitions(indicator) { return Array.isArray(indicator?.compositeParts)?indicator.compositeParts:[]; }
function inspectCell(cell, attrs, className='', partId=null) {
  const shown=displayCellValue(cell,partId),part=partId?compositePart(cell,partId):null;
  const tooltip=partId?`${part?.label||'分项记录'}：${shown}${part?.note?' · '+part.note:''}`:cell?.kind==='composite'?`组合写法：${shown} · 查看分项与说明`:`原值：${cell?.error || (cell?.raw ?? cell?.value ?? '空白')}`;
  return `<button type="button" class="cell-button inspect ${cell?.error?'error':''} ${className}" ${attrs} ${partId?`data-component="${esc(partId)}"`:''} title="${esc(tooltip)} · 查看来源与说明">${shown==='—'||shown==='未单列'||shown==='待核对'?`<span class="empty-value">${esc(shown)}</span>`:esc(shown)}</button>`;
}
function compositeValues(cell,indicator,attrs) {
  return `<div class="composite-values">${compositeDefinitions(indicator).map((part,index)=>`<div class="composite-value"><span class="composite-label">${esc(part.label)}<small>${index===0?'点前记录':'点后记录'}</small></span><span class="composite-number">${inspectCell(cell,attrs,'',part.id)}</span></div>`).join('')}</div>`;
}
function reportCitation(explanation) {
  const pages=Array.isArray(explanation?.pages)?explanation.pages:explanation?.pages?[explanation.pages]:[];
  const title=String(db.readerNotes?.document?.title||'综合国力2.0.pdf').replace(/\.pdf$/i,'');
  return `背景报告《${title}》${pages.length?' PDF 第'+pages.join('、')+'页':''}；解释口径，数值以当前 Excel 为准。`;
}
function readerExplanation(explanation,{compact=false,title=true}={}) {
  if(!explanation?.text)return '';
  const paragraphs=String(explanation.text).split(/\n+/).filter(Boolean);
  return `<div class="reader-explanation ${compact?'compact':''}">${title&&explanation.title?`<h3>${esc(explanation.title)}</h3>`:''}${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<p class="explanation-source">${esc(reportCitation(explanation))}</p></div>`;
}
function readerNotesDirectory() {
  const notes=db.readerNotes;
  if(!notes)return '';
  const domains=Object.entries(notes.domains||{}),fields=Object.entries(notes.fields||{});
  const detail=(explanation,label)=>`<details class="research-note"><summary><span>${esc(label||explanation.title)}</span><small>PDF 第${esc((explanation.pages||[]).join('、')||'—')}页</small></summary>${readerExplanation(explanation,{title:false})}</details>`;
  const groups=db.sheets.map(sheet=>({name:sheet.name,fields:fields.filter(([id])=>byIndicator.get(id)?.sheetId===sheet.id)})).filter(group=>group.fields.length);
  const unmapped=fields.filter(([id])=>!byIndicator.has(id));if(unmapped.length)groups.push({name:'其他口径说明',fields:unmapped});
  return `<section class="reader-directory"><h2>研究口径说明</h2><p>以下解释整理自背景报告《${esc(String(notes.document?.title||'综合国力2.0.pdf').replace(/\.pdf$/i,''))}》。保留报告的概念说明，并注明 PDF 页码；实体数值和研究结果仍以当前工作簿为准。</p>${(notes.overview||[]).map(explanation=>readerExplanation(explanation)).join('')}${domains.length?`<h3>一级领域</h3>${domains.map(([id,explanation])=>detail(explanation,db.domains.find(domain=>domain.id===id)?.name||explanation.title)).join('')}`:''}${groups.length?`<h3>字段含义与口径</h3><p class="section-note">按工作表展开，再选择要阅读的字段；同一段报告解释可能适用于多个字段。</p>${groups.map(group=>`<details class="research-field-group"><summary><span>${esc(group.name)}</span><small>${group.fields.length} 项字段说明</small></summary><div class="research-field-items">${group.fields.map(([id,explanation])=>detail(explanation,byIndicator.get(id)?.name||explanation.title)).join('')}</div></details>`).join('')}`:''}</section>`;
}
function tableColumns(fields) {
  return fields.flatMap(field=>compositeDefinitions(field).length?compositeDefinitions(field).map((part,index)=>({...field,displayId:field.id+'::'+part.id,parentIndicatorId:field.id,partId:part.id,partPosition:index,name:part.label,originalName:field.name})): [{...field,displayId:field.id}]);
}
const entityLink = entity => `<a class="entity-name" href="${entityURL(entity)}"><span class="entity-dot" aria-hidden="true"></span>${esc(entity.name)}</a>`;
const domainKind = domain => domain.kind === 'rank' ? '名次 ↓' : '评分 ↑';
const referenceLabel = () => db.meta.referenceValueLabel || '公式参考值（非百分制）';
const empty = (title='没有匹配的数据', note='试着调整搜索词或筛选条件。') => `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(note)}</p></div>`;
const mainHeading = (eyebrow,title,description,action='') => `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${description ? `<p class="lead">${description}</p>` : ''}</div>${action}</div>`;
const breadcrumb = (...items) => `<div class="breadcrumb"><a href="#/">首页</a>${items.map(([name,href])=>`<span aria-hidden="true">/</span>${href?`<a href="${href}">${esc(name)}</a>`:`<span>${esc(name)}</span>`}`).join('')}</div>`;
const metadata = indicator => `<div class="metadata-grid">${knownMetadata(indicator).map(([label,value])=>`<div class="metadata-item"><div class="metadata-label">${esc(label)}</div><div class="metadata-value">${esc(value)}</div></div>`).join('')}</div>`;
const summaryNotice = () => `<p class="reading-note">综合名次沿用作者原表，含小数名次。点击实体名称查看能力结构；领域结果可按需展开。<a href="#/methodology">理解名次与计算参考 →</a></p>`;
function sortValues(a,b,direction='asc') {
  const av = a && typeof a==='object' && 'value' in a ? a.value : a, bv = b && typeof b==='object' && 'value' in b ? b.value : b;
  const am = av == null || av === '', bm = bv == null || bv === '';
  if(am || bm) return am === bm ? 0 : am ? 1 : -1;
  return (numeric(av) && numeric(bv) ? av-bv : String(av).localeCompare(String(bv),'zh-CN',{numeric:true})) * (direction === 'asc' ? 1 : -1);
}
function rankedEntities() { return db.entities.filter(e=>e.ranked).sort((a,b)=>sortValues(a.rank,b.rank)); }
function namedFields(sheetId, includeAuxiliary=false) { return db.indicators.filter(i=>i.sheetId===sheetId && i.role!=='identity' && (includeAuxiliary || i.role!=='auxiliary')); }
function indicatorCells(indicator) {
  const orderedIds=[...new Set((bySheet.get(indicator.sheetId)?.rows||[]).map(row=>row.entityId).filter(id=>byId.has(id)))];
  const seen=new Set(orderedIds);
  const entities=[...orderedIds.map(id=>byId.get(id)),...db.entities.filter(entity=>!seen.has(entity.id))];
  return entities.map(entity=>({entity,cell:entity.metrics?.[indicator.id]}));
}
function numIndicatorCells(indicator) { return indicatorCells(indicator).filter(item=>numeric(item.cell?.value) && !item.cell?.error); }

function knownMetadata(indicator) {
  return [['单位',indicator?.unit],['观测年份',indicator?.year],['数据来源',indicator?.source],['工作表',indicator?.sheetName]].filter(([,value])=>value!=null && value!=='');
}
function readingMode(indicator) {
  if(!indicator)return 'value';
  if(indicator.type==='composite')return 'composite';
  const domain=db.domains.find(d=>d.metricId===indicator.id);
  if(domain)return domain.kind;
  if(indicator.role==='score'&&db.domains.some(d=>d.id===indicator.sheetId&&d.kind==='score'))return 'score';
  if(indicator.role==='reference')return 'reference';
  if(indicator.role==='rank'||indicator.direction==='asc'||/排名|名次/.test(indicator.originalHeader||indicator.name||''))return 'rank';
  return 'value';
}
const scoreLabels = ['明显短缺','依赖外部条件','够用','基本完整且单项突出','充足且有余量'];
function scoreReading(value,eligible=true) {
  if(!numeric(value))return '<span class="empty-value">—</span>';
  if(!eligible||value<1||value>5)return `<span class="record-reading">${esc(format(value))}<small>${eligible?'原始记录':'补充记录'}</small></span>`;
  return `<span class="score-reading"><strong>${esc(format(value))}<small> / 5</small></strong><span class="score-scale" aria-hidden="true">${[1,2,3,4,5].map(n=>`<i class="${n===value?'selected':value>n&&value<n+1?'between':''}">${n}</i>`).join('')}</span><small>${Number.isInteger(value)?scoreLabels[value-1]:'原表小数评分'}</small></span>`;
}
function comparisonReading(kind,rows,indicator) {
  return `<div class="reading-rows" data-reading="${esc(kind)}">${rows.map(r=>`<div class="reading-row"><a href="${entityURL(r.entity)}">${esc(r.entity.name)}</a><div>${kind==='score'&&numeric(r.value)?scoreReading(r.value,r.chartable!==false):`<span class="reading-number">${r.cell?inspectCell(r.cell,cellId(r.entity.id,r.metricId)):esc(format(r.value))}</span>${kind==='rank'&&r.chartable!==false&&numeric(r.value)?'<small>名次</small>':r.chartable===false?'<small>补充记录</small>':''}`}</div></div>`).join('')}</div>`;
}
const domainURL = id => routeURL('domain/'+id);
const guideFor = id => READING_GUIDE.domains[id];
const nextStep = (title,text,href,label) => `<aside class="next-step"><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div><a class="button" href="${href}">${esc(label)} →</a></aside>`;
function domainLinks(ids) { return ids.map(id=>{const d=db.domains.find(d=>d.id===id);return `<a href="${domainURL(id)}">${esc(d.name)} →</a>`;}).join(''); }
function scopeNote(entity) {
  if(entity.id==='european-union')return '<div class="notice">欧盟在原表中作为独立评价实体，保留小数名次和单独的公式修正。各项总量不意味着成员资源能够完全统一调度。</div>';
  if(!entity.ranked)return '<div class="notice">这是补充实体，未赋综合名次。领域中的原始标记单独保留，不解释为正式名次或 1–5 级评分。</div>';
  return '';
}

function navActive(path) {
  const key = path.startsWith('entity/') ? 'rankings' : path.startsWith('domain/') ? 'framework' : ['data','indicators','methodology','downloads'].includes(path)||path.startsWith('indicator/') ? 'library' : path;
  $$('#navigation a').forEach(a=>a.getAttribute('href') === '#/'+key ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'));
  $('#navigation').classList.remove('open'); $('.menu-toggle').setAttribute('aria-expanded','false');
}
function route() {
  const raw = location.hash.replace(/^#\/?/,'');
  const [path,query=''] = raw.split('?');
  const params = new URLSearchParams(query);
  navActive(path);
  currentRoute = path;
  try {
    if (!path) renderHome();
    else if(path==='framework') renderFramework();
    else if(path.startsWith('domain/')) renderDomain(decodeURIComponent(path.slice(7)));
    else if(path==='library') renderLibrary();
    else if(path==='rankings') renderRankings(params);
    else if(path==='data') renderData(params);
    else if(path.startsWith('entity/')) renderEntity(decodeURIComponent(path.slice(7)));
    else if(path==='compare') renderCompare(params);
    else if(path==='indicators') renderIndicators(params);
    else if(path.startsWith('indicator/')) renderIndicator(decodeURIComponent(path.slice(10)),params);
    else if(path==='methodology') renderMethodology();
    else if(path==='downloads') renderDownloads();
    else app.innerHTML = breadcrumb(['页面未找到'])+empty('这个页面不存在','请通过上方导航继续浏览。');
  } catch(error) {
    console.error('Page render failed',error);
    app.innerHTML = `<div class="error-panel"><h1>这个页面暂时无法显示</h1><p>数据结构可能发生了变化。请返回首页或下载原始数据查看。</p><code>${esc(error.message)}</code><p><a class="button" href="#/">返回首页</a></p></div>`;
  }
  if($('#main h1')) document.title = $('#main h1').textContent + ' · 国家长期能力综合排名';
  window.scrollTo({top:0,behavior:'instant'});
}
function renderHome() {
  const preview=rankedEntities().slice(0,8),japan=byId.get('japan');
  app.innerHTML=`<section class="hero reading-hero"><div><p class="eyebrow">综合国力研究 · 阅读导引</p><h1>看见排名背后的<br>长期能力</h1><p class="lead">一个国家能调动多少资源，又靠什么维持长期行动？这项研究把生产、技术、军事与基础供给放在一起，观察国家在长期压力下组织资源、持续行动的条件。</p><p class="hero-thesis">综合名次给出整体位置，八个领域帮助理解能力结构。</p><div class="button-group"><a class="button primary" href="#/rankings">从综合排名开始 →</a><a class="button text" href="#/framework">先理解八个领域 ↗</a></div></div><aside class="research-question"><p class="eyebrow">这项研究在看什么</p><h2>形成能力，<br class="mobile-break">也要支撑能力</h2><div><b>生产、知识与行动</b><p>经济积累、技术和组织条件、军事与动员，构成已经形成的能力基础。</p></div><div><b>供给、连接与持续组织</b><p>食物、能源、原料、交通与稳定，影响这些能力得以持续运转的条件。</p></div><p class="section-note">研究关注长期能力基础；不用于预测具体战争结果、承压天数或生活质量。</p></aside></section>
  <ol class="reading-path"><li><span>01</span><div><a href="#/rankings">看综合位置 →</a><p>先认识结果与梯队，选择一个熟悉的国家。</p></div></li><li><span>02</span><div><a href="${entityURL(japan||preview[0])}">读能力结构 →</a><p>把领域名次与基础评分分开，理解它们各自回答什么。</p></div></li><li><span>03</span><div><a href="#/compare">比较，再追问依据 →</a><p>比较同一领域，沿字段解释回到原始记录。</p></div></li></ol>
  <section class="section home-bottom"><div><div class="section-heading"><div><p class="eyebrow">从结果进入研究</p><h2>综合排名一览</h2><p class="section-note">${db.meta.counts.rankedEntities} 个正式排名实体 · 沿用作者在工作簿中的综合名次</p></div></div><div class="table-wrap"><table><thead><tr><th>综合名次</th><th>国家 / 实体</th><th>原表分类</th></tr></thead><tbody>${preview.map(e=>`<tr><td class="rank-cell">${esc(format(e.rank))}</td><td style="text-align:left">${entityLink(e)}</td><td>${esc(e.category||'—')}</td></tr>`).join('')}</tbody></table></div><a class="button text" href="#/rankings">查看完整排名与实体档案 →</a></div><aside class="home-aside reading-aside"><h3>相邻名次，不等于固定差距</h3><p>综合结果保留了作者的研究判断，包括欧盟等实体的小数名次。名次帮助定位，不能据此计算能力相差几倍。</p><p>进一步理解一个国家，应同时看它在不同领域的位置和基础条件。公式参考值是计算线索，不能代替综合名次。</p><a class="feature-link" href="#/methodology">数据怎样成为研究结果<span>→</span></a></aside></section>
  ${japan?`<section class="section worked-example"><p class="eyebrow">以日本为例 · 数值随工作簿更新</p><h2>同一个国家，可以呈现不同的能力侧面</h2><p>日本在当前原表中的综合名次为 ${esc(format(japan.rank))}。把结果拆开读，才能看到“在何处排位”与“靠什么持续支撑”是不同问题。</p><div class="example-columns"><div><h3>经济与军事的相对位置</h3><div class="example-values">${['economy','military'].map(id=>`<div><span>${esc(db.domains.find(d=>d.id===id).name)}</span><strong>${japan.ranked&&numeric(japan.domains[id])?`第 ${esc(format(japan.domains[id]))} 名`:esc(format(japan.domains[id]))}</strong></div>`).join('')}</div><p>这是各自领域的顺序，不能把名次之比当作能力之比。</p></div><div><h3>供给与连接的基础条件</h3><div class="example-values">${['agriculture','energy','minerals','transport'].map(id=>`<div><span>${esc(db.domains.find(d=>d.id===id).name)}</span>${scoreReading(japan.domains[id],japan.ranked&&japan.domainChartable?.[id]!==false)}</div>`).join('')}</div><p>这些评分描述各领域的基础条件。理解它们，需要继续看供给依赖、运输与具体记录。</p></div></div><a class="button" href="${entityURL(japan)}">展开日本的能力结构 →</a></section>`:''}
  ${nextStep('八个领域怎样联系起来？','从人口和知识，到生产与资源，再到连接和持续组织，理解各领域为何同时出现。','#/framework','阅读研究框架')}`;
}
function renderFramework() {
  app.innerHTML=breadcrumb(['八个领域'])+mainHeading('READING THE FRAMEWORK','八个领域，回答不同的问题','已有能力需要供给、连接和组织来支撑。下面按阅读关系归为三组，帮助理解八领域之间的联系；分组不改变原研究的领域、权重或计算。');
  app.innerHTML+=READING_GUIDE.groups.map((group,index)=>`<section class="framework-group"><div class="section-heading"><div><p class="eyebrow">${String(index+1).padStart(2,'0')}</p><h2>${esc(group.title)}</h2><p class="lead">${esc(group.intro)}</p></div></div><div class="guide-grid">${group.domains.map(id=>{const d=db.domains.find(d=>d.id===id),g=guideFor(id);return `<a class="guide-card" href="${domainURL(id)}"><p class="eyebrow">${esc(d.name)} · ${d.kind==='rank'?'领域名次':'基础评分'}</p><h3>${esc(g.question)}</h3><p>${esc(g.intro)}</p><span>看研究依据与本领域结果 →</span></a>`;}).join('')}</div></section>`).join('');
  app.innerHTML+=`<div class="meaning-grid"><article><h3>三项领域名次</h3><p>政治、经济、军事：名次越小，原表位置越靠前。顺序不表达能力差距。</p></article><article><h3>五项基础评分</h3><p>交通、农业、能源、矿产、稳定：主要使用 1–5 等级，描述各自的基础条件，保留原表小数评分。</p></article><article><h3>一个综合判断</h3><p>综合名次来自作者保存的结果。公式提供参考，尚不能由底层字段完整复现所有人工判断。</p></article></div>${nextStep('带着框架看一个具体国家','从综合位置进入实体档案，分别观察领域名次和基础条件。','#/rankings','选择国家')}`;
}
function renderDomain(id) {
  const domain=db.domains.find(d=>d.id===id),g=guideFor(id);
  if(!domain||!g){app.innerHTML=empty('未找到该领域');return;}
  const metric=byIndicator.get(domain.metricId);
  app.innerHTML=breadcrumb(['八个领域','#/framework'],[domain.name])+mainHeading(domain.kind==='rank'?'领域名次':'基础条件',domain.name+'：'+g.question,esc(g.intro))+`<div class="domain-story"><article>${g.facets.map(f=>`<section class="facet"><h2>${esc(f.title)}</h2><p>${esc(f.text)}</p><div class="field-links">${f.fields.map(id=>byIndicator.get(id)).filter(Boolean).map(i=>`<a href="${indicatorURL(i)}">${esc(i.name)} →</a>`).join('')}</div></section>`).join('')}<section class="facet"><h2>放回整体看</h2><p>${esc(g.connections)}</p><a class="button text" href="#/framework">返回八领域关系 →</a></section><details class="research-note"><summary>展开背景报告的完整解释与页码</summary>${readerExplanation(domain.explanation,{title:false})}</details></article><aside class="side-note"><h3>本领域怎样读数</h3><p>${domain.kind==='rank'?'使用原表名次。数值越小，位置越靠前；第 4 名与第 8 名不能解释成能力相差一倍。':'使用基础评分，主要为 1–5 级。整数等级说明见下方，原表小数评分保持原值；这些等级不表示能力倍数。'}</p>${domain.kind==='score'?`<ol class="score-key">${scoreLabels.map(label=>`<li>${label}</li>`).join('')}</ol>`:''}<a class="button text" href="${indicatorURL(metric)}">查看本领域全部结果 →</a><a class="button text" href="${routeURL('data',{sheet:id})}">查阅本领域原表 →</a></aside></div>${nextStep('比较同一个问题','选择几个国家，在同一领域下比较，再回到具体字段理解差异。',routeURL('compare',{metric:domain.metricId}),'建立比较')}`;
}
function renderLibrary() {
  app.innerHTML=breadcrumb(['数据与方法'])+mainHeading('EVIDENCE & METHODS','数据与方法','读到一个结果后，从这里追问它的含义、计算与原始依据。日常数值由同一份 Excel 生成，报告解释提供研究背景。')+`<div class="library-grid">${[
    ['methodology','结果是怎样形成的','理解名次、基础评分、公式参考值与作者判断各自的作用。','来源与方法'],
    ['indicators','一个字段究竟在看什么','查找字段解释，查看各实体记录，再追到原单元格。','字段目录'],
    ['data','核对原表的完整记录','保留原工作表结构、辅助列与公式；可搜索、排序、选择显示字段。','完整数据'],
    ['downloads','下载与复用研究数据','获取权威 Excel、CSV、JSON 与单文件离线版。','下载文件']
  ].map(([route,title,description,label])=>`<a class="guide-card" href="#/${route}"><p class="eyebrow">${esc(label)}</p><h2>${esc(title)}</h2><p>${esc(description)}</p><span>打开 →</span></a>`).join('')}</div><p class="section-note library-foot">本版本覆盖 ${db.meta.counts.entities} 个实体、${db.meta.counts.sheets} 张工作表。字段数量包含派生与重复记录，不等于独立研究指标数量。只在资料有明确记录时显示单位、年份与来源。</p>`;
}
function referenceCell(entity) {
  const metric=db.indicators.find(i=>i.role==='reference');
  return metric && entity.metrics?.[metric.id] ? inspectCell(entity.metrics[metric.id],cellId(entity.id,metric.id)) : esc(format(entity.referenceValue));
}
function summaryTableRows(entities) {
  return entities.map(e=>`<tr><td class="freeze">${entityLink(e)}</td><td class="rank-cell">${e.ranked?esc(format(e.rank)):'<span class="empty-value">未排名</span>'}</td><td>${esc(e.category||'—')}</td>${db.domains.map(d=>`<td class="ranking-detail">${inspectCell(e.metrics?.[d.metricId] || {value:e.domains?.[d.id]},cellId(e.id,d.metricId))}</td>`).join('')}<td class="reference-cell ranking-detail">${referenceCell(e)}</td></tr>`).join('');
}
function renderRankings(params) {
  const state={search:params.get('q')||'',category:params.get('category')||'',scope:params.get('scope')||'ranked',sort:params.get('sort')||'rank',direction:params.get('dir')||'asc'};
  const categories=[...new Set(db.entities.map(e=>e.category).filter(Boolean))];
  app.innerHTML=mainHeading('COMPOSITE RANKING','综合排名','先选择一个熟悉的国家，进入档案理解其领域结构。原表分类可辅助观察梯队；补充实体单独查看。',`<a class="button" href="#/compare">建立实体比较 ↗</a>`)+summaryNotice()+`<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索实体</span><input class="input" id="ranking-search" placeholder="搜索中文或英文实体名称…" value="${esc(state.search)}"></label><select class="select" id="ranking-category" aria-label="实体分类"><option value="">全部分类</option>${categories.map(c=>`<option ${state.category===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select><select class="select" id="ranking-scope" aria-label="排名范围"><option value="ranked" ${state.scope==='ranked'?'selected':''}>正式排名实体</option><option value="all" ${state.scope==='all'?'selected':''}>全部实体</option><option value="supplementary" ${state.scope==='supplementary'?'selected':''}>补充实体</option></select><label class="checkbox-label"><input type="checkbox" id="ranking-details">展开领域与计算参考</label><span class="toolbar-end" id="ranking-count" aria-live="polite"></span></div><p class="scroll-caption">左右滑动查看全部领域；点击列标题排序。</p><div class="table-wrap" tabindex="0" role="region" aria-label="综合排名数据表"><table id="ranking-table" class="ranking-summary"><thead><tr>${[['name','实体',''],['rank','既定名次','原始综合排名'],['category','分类',''],...db.domains.map(d=>[d.id,d.name,domainKind(d)]),['reference','公式参考值','非百分制']].map(([key,label,sub],i)=>`<th class="${i===0?'freeze header':i>2?'ranking-detail':''}" data-rank-key="${key}"><button type="button" data-ranking-sort="${key}">${esc(label)} <span class="sort-arrow">↕</span></button>${sub?`<span class="table-group">${esc(sub)}</span>`:''}</th>`).join('')}</tr></thead><tbody id="ranking-body"></tbody></table></div><p id="ranking-scope-note" class="section-note"></p><div id="ranking-empty"></div><p class="table-hint"><span>点击数字可查看完整原值、单元格位置及公式。</span><a href="#/data">转到工作簿完整数据 →</a></p>`;
  function update() {
    const search=state.search.trim().toLowerCase();
    const list=db.entities.filter(e=>(state.scope==='all'||state.scope==='ranked'&&e.ranked||state.scope==='supplementary'&&!e.ranked)&&(!state.category||e.category===state.category)&&(!search||(e.name+' '+e.englishName).toLowerCase().includes(search)));
    const value=e=>state.sort==='reference'?e.referenceValue:db.domains.some(d=>d.id===state.sort)?e.domains?.[state.sort]:e[state.sort];
    list.sort((a,b)=>sortValues(value(a),value(b),state.direction));
    $('#ranking-body').innerHTML=summaryTableRows(list);
    $('#ranking-count').textContent=`${list.length} 个实体`;
    $('#ranking-scope-note').textContent=state.scope==='ranked'?'':'补充实体没有综合名次，其领域标记不解释为正式名次或基础评分。';
    $('#ranking-empty').innerHTML=list.length?'':empty();
    $$('[data-rank-key]').forEach(th=>{const active=th.dataset.rankKey===state.sort;th.setAttribute('aria-sort',active?state.direction==='asc'?'ascending':'descending':'none');$('.sort-arrow',th).textContent=active?state.direction==='asc'?'↑':'↓':'↕';});
  }
  $('#ranking-search').addEventListener('input',e=>{state.search=e.target.value;update();});
  $('#ranking-category').addEventListener('change',e=>{state.category=e.target.value;update();});
  $('#ranking-scope').addEventListener('change',e=>{state.scope=e.target.value;update();});
  $$('[data-ranking-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.rankingSort;state.direction=state.sort===key&&state.direction==='asc'?'desc':'asc';state.sort=key;update();}));
  $('#ranking-details').addEventListener('change',e=>$('#ranking-table').classList.toggle('ranking-summary',!e.target.checked));
  if(state.sort!=='rank'&&state.sort!=='name'&&state.sort!=='category'){$('#ranking-details').checked=true;$('#ranking-table').classList.remove('ranking-summary');}
  update();
}
function renderData(params) {
  const sheet=bySheet.get(params.get('sheet')) || db.sheets[0];
  const fields=sheet.columns.map(c=>byIndicator.get(c.indicatorId || c.id) || {...c,sheetId:sheet.id,sheetName:sheet.name});
  const identity=fields.find(f=>f.role==='identity' && (f.name==='国家'||f.name==='实体'||f.type!=='englishName')) || fields.find(f=>f.role==='identity') || fields[0];
  const initialSelected=fields.filter(f=>f.role!=='auxiliary').map(f=>f.id);
  const state=sheetState.get(sheet.id)||{search:'',sort:null,direction:'asc',showRaw:false,selected:new Set(initialSelected)};
  if(params.has('q'))state.search=params.get('q');
  state.selected.add(identity.id); sheetState.set(sheet.id,state);
  const primary=fields.filter(f=>f.role!=='auxiliary'&&f.id!==identity.id),aux=fields.filter(f=>f.role==='auxiliary'&&f.id!==identity.id);
  const hasComposite=fields.some(f=>compositeDefinitions(f).length);
  const explained=fields.filter(f=>f.explanation?.text);
  const fieldOption=f=>`<label class="checkbox-label"><input type="checkbox" data-column="${esc(f.id)}" ${state.selected.has(f.id)?'checked':''}><span>${esc(f.name)}${compositeDefinitions(f).length?` <small>（${compositeDefinitions(f).length} 个分项）</small>`:fields.filter(x=>x.name===f.name).length>1?` <small>(${esc(f.column)})</small>`:''}</span></label>`;
  app.innerHTML=mainHeading('THE WORKBOOK','完整数据','按原工作表查看数据与计算内容。首列固定实体名称；组合记录分为独立数量列，点击数值可查看解释与来源。',`<a class="button" href="#/downloads">下载工作簿 ↗</a>`)+`<div class="sheet-tabs" aria-label="选择工作表">${db.sheets.map(s=>`<a class="${sheet.id===s.id?'active':''}" ${sheet.id===s.id?'aria-current="page"':''} href="${routeURL('data',{sheet:s.id})}">${esc(s.name)}</a>`).join('')}</div><p class="sheet-meta">${esc(sheet.name)} · ${esc(sheet.role==='summary'?'综合结果表':'数据与计算表')} · ${fields.length} 个原工作簿字段（含身份及辅助字段）。匿名计算行可一并查看；“—”表示空白，不代表零。</p>${sheet.explanation?`<details class="research-note"><summary>本工作表的研究口径</summary>${readerExplanation(sheet.explanation,{compact:true})}</details>`:''}${hasComposite?`<div class="notice">点号前后分别记录不同数量，下表已拆成独立列。“点后记录”仅按当前保存的位数展示；整数记录的第二项显示“未单列”，不补成零。${explained.length?'各项含义见下方口径说明。':''}</div>`:''}${explained.length?`<details class="field-explanations"><summary>指标含义与口径 · ${explained.length} 项说明</summary><div class="explanation-list">${explained.map(f=>readerExplanation(f.explanation,{compact:true})).join('')}</div></details>`:''}<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索工作表</span><input class="input" id="sheet-search" placeholder="搜索实体名称或单元格内容…" value="${esc(state.search)}"></label><label class="checkbox-label"><input id="sheet-raw-rows" type="checkbox" ${state.showRaw?'checked':''}>包含辅助行</label><span class="toolbar-end" id="sheet-count" aria-live="polite"></span></div><details class="column-picker"><summary>选择显示字段 <span id="column-count"></span> · 展开 / 折叠</summary><div class="column-picker-body"><div class="column-actions"><button class="button small" id="columns-main" type="button">仅具名字段</button><button class="button small" id="columns-all" type="button">全部字段</button><button class="button small" id="columns-clear" type="button">仅保留实体</button></div><div class="column-group-label">具名字段${hasComposite?'（组合字段按组选择）':''} <button class="group-toggle" data-column-group="primary" type="button">全选 / 取消</button></div><div class="column-grid">${primary.map(fieldOption).join('')}</div>${aux.length?`<details style="margin-top:15px"><summary style="padding:0;font-size:11px;color:var(--muted)">未命名辅助字段 · ${aux.length} 列（原样保留）</summary><div class="column-group-label"><button class="group-toggle" data-column-group="aux" type="button">全选 / 取消</button></div><div class="column-grid">${aux.map(fieldOption).join('')}</div></details>`:''}</div></details><p class="scroll-caption">左右滑动查看更多列；实体列与表头保持固定。</p><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(sheet.name)}完整数据表"><table id="sheet-table"></table></div><div id="sheet-empty"></div><p class="table-hint"><span>${hasComposite?'拆分数量按保存记录的位数显示；点击分项可查看组合写法和来源。':'表格默认精简小数显示；点击单元格可查看完整精度与来源。'}</span><span id="sheet-sort-note">${hasComposite?'组合记录及拆分项不参与数值排序。':'点击列标题排序。'}</span></p>`;
  function update() {
    const selectedFields=[identity,...fields.filter(f=>f.id!==identity.id&&state.selected.has(f.id))];
    const cols=tableColumns(selectedFields);
    const search=state.search.trim().toLowerCase();
    const searchable=c=>c?.kind==='composite'?[c.composite?.display,...(c.composite?.parts||[]).map(p=>[p.label,p.digits].join(' '))].join(' '):String(c?.value??c?.error??'');
    let rows=sheet.rows.filter(r=>r.kind!=='header' && (state.showRaw || r.entityId) && (!search || Object.values(r.cells).some(c=>searchable(c).toLowerCase().includes(search)) || (byId.get(r.entityId)?.englishName||'').toLowerCase().includes(search)));
    if(state.sort)rows.sort((a,b)=>sortValues(a.cells[state.sort]?.value,b.cells[state.sort]?.value,state.direction));
    $('#sheet-table').innerHTML=`<thead><tr>${cols.map((f,i)=>`<th class="${i===0?'freeze header':''} ${f.partId?'composite-column':''}" aria-sort="${state.sort===f.column?state.direction==='asc'?'ascending':'descending':'none'}"><span class="field-header">${f.type==='composite'?esc(f.name):`<button type="button" data-sheet-sort="${esc(f.column)}">${esc(f.name)} <span class="sort-arrow">${state.sort===f.column?state.direction==='asc'?'↑':'↓':'↕'}</span></button>`}${f.explanation?.text?`<a class="field-info" href="${indicatorURL(f)}" title="${esc(f.explanation.text)}" aria-label="查看${esc(f.name)}的定义">ⓘ</a>`:''}</span><span class="table-group">${f.partId?`${f.partPosition===0?'点前记录':'点后记录'} · ${esc(f.originalName)}`:esc(f.role==='auxiliary'?'辅助列 '+f.column:f.unit || (f.role==='identity'?'实体名称':f.column+' 列'))}</span></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map((f,i)=>{const c=r.cells[f.column],e=byId.get(r.entityId);return `<td class="${i===0?'freeze':''} ${f.partId?'composite-column':''}">${i===0&&e?entityLink(e):i===0&&(!c||c.value==null)?`<span class="empty-value">辅助行 ${esc(r.row)}</span>`:inspectCell(c,`data-sheet="${esc(sheet.id)}" data-row="${esc(r.row)}" data-column-ref="${esc(f.column)}"`,'',f.partId)}</td>`;}).join('')}</tr>`).join('')}</tbody>`;
    $('#sheet-count').textContent=`${rows.length} 行 · ${cols.length} 个显示列`;
    $('#column-count').textContent=`（${selectedFields.length} / ${fields.length} 个原字段）`;
    $('#sheet-empty').innerHTML=rows.length?'':empty();
    $$('[data-sheet-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sheetSort;state.direction=state.sort===key&&state.direction==='asc'?'desc':'asc';state.sort=key;update();}));
    $$('[data-column]').forEach(input=>{input.checked=state.selected.has(input.dataset.column);});
  }
  $('#sheet-search').addEventListener('input',e=>{state.search=e.target.value;update();});
  $('#sheet-raw-rows').addEventListener('change',e=>{state.showRaw=e.target.checked;update();});
  $$('[data-column]').forEach(input=>input.addEventListener('change',()=>{input.checked?state.selected.add(input.dataset.column):state.selected.delete(input.dataset.column);update();}));
  $('#columns-main').addEventListener('click',()=>{state.selected=new Set(initialSelected);state.selected.add(identity.id);update();});
  $('#columns-all').addEventListener('click',()=>{state.selected=new Set(fields.map(f=>f.id));update();});
  $('#columns-clear').addEventListener('click',()=>{state.selected=new Set([identity.id]);update();});
  $$('[data-column-group]').forEach(button=>button.addEventListener('click',()=>{const group=button.dataset.columnGroup==='aux'?aux:primary;const all=group.every(f=>state.selected.has(f.id));group.forEach(f=>all?state.selected.delete(f.id):state.selected.add(f.id));update();}));
  update();
}
function renderEntity(id) {
  const entity=byId.get(id);
  if(!entity){app.innerHTML=breadcrumb(['实体档案'])+empty('未找到该实体');return;}
  const fieldsHTML=fields=>`<div class="detail-fields">${fields.map(f=>`<div class="detail-field"><div class="detail-field-name"><a href="${indicatorURL(f)}">${esc(f.name)}${namedFields(f.sheetId,true).filter(x=>x.name===f.name).length>1?' ('+esc(f.column)+')':''} ↗</a></div><div class="detail-field-value">${compositeDefinitions(f).length?compositeValues(entity.metrics?.[f.id],f,cellId(entity.id,f.id)):inspectCell(entity.metrics?.[f.id],cellId(entity.id,f.id))}</div>${f.unit||f.year?`<p class="detail-field-meta">${[f.unit,f.year].filter(v=>v!=null&&v!=='').map(esc).join(' · ')}</p>`:''}${f.explanation?.text?`<details class="inline-explanation"><summary>含义与口径</summary>${readerExplanation(f.explanation,{compact:true})}</details>`:''}</div>`).join('')}</div>`;
  app.innerHTML=breadcrumb(['综合排名','#/rankings'],[entity.name])+`<div class="entity-hero"><div><p class="eyebrow">从位置到结构</p><span class="pill">${esc(entity.category||(entity.ranked?'正式排名实体':'补充实体'))}</span><h1>${esc(entity.name)}</h1><p class="entity-en">${esc(entity.englishName||'')}</p><a class="button" href="${routeURL('compare',{entities:entity.id})}">选择其他实体，与${esc(entity.name)}比较 →</a></div><div class="entity-numbers"><div class="entity-number"><p class="stat-label">综合名次 · 作者原表结果</p><p class="big">${entity.ranked?esc(format(entity.rank)):'未排名'}</p><p class="stat-sub">${entity.ranked?'接着看领域结构，理解不同侧面':'补充记录单独阅读'}</p></div></div></div>${scopeNote(entity)}<p class="lead profile-intro">先看政治、经济、军事的相对位置，再看五项基础条件。它们使用不同尺度；点击一个领域，展开${esc(entity.name)}在该领域的具体记录。</p>
  ${['rank','score'].map(kind=>`<section class="section"><div class="section-heading"><div><h2>${kind==='rank'?'三项领域名次':'五项基础条件'}</h2><p class="section-note">${kind==='rank'?'原表顺序；名次不表达能力差距。':'主要使用 1–5 等级；不与名次相加，也不解释为能力倍数。'}</p></div></div><div class="profile-domains">${db.domains.filter(d=>d.kind===kind).map(d=>`<button type="button" class="domain-card" data-open-domain="${d.id}"><div class="domain-card-head"><b>${esc(d.name)}</b><small>${kind==='rank'?'名次':'评分'}</small></div>${kind==='score'?scoreReading(entity.domains?.[d.id],entity.ranked&&entity.domainChartable?.[d.id]!==false):`<p class="domain-value">${esc(format(entity.domains?.[d.id]))}</p>${!entity.ranked?'<small>补充记录</small>':''}`}<p class="domain-question">${esc(guideFor(d.id).question)}</p><span class="domain-explanation-link">展开本实体的领域依据 ↓</span></button>`).join('')}</div></section>`).join('')}
  <section class="section"><h2>从领域结果追问依据</h2><p class="section-note">每个领域先给出阅读线索，再展示已记录字段。未记录项与辅助列保留在展开项中。</p>${READING_GUIDE.groups.flatMap(g=>g.domains).map(id=>{const d=db.domains.find(d=>d.id===id),g=guideFor(id),fields=namedFields(id,true),populated=fields.filter(f=>f.role!=='auxiliary'&&(entity.metrics?.[f.id]?.value!=null||entity.metrics?.[f.id]?.error)),other=fields.filter(f=>!populated.includes(f));return `<details class="detail-section" id="entity-domain-${id}"><summary><span>${esc(d.name)}<small>${populated.length} 项已记录字段</small></span></summary><div class="entity-domain-guide"><p>${esc(g.intro)}</p>${id==='military'?'<p class="section-note">组合字段分为点前、点后记录。点后未单列时不补零；日本部分 .1 等记录仍待作者确认，不当作已核实的装备数量。</p>':''}<div class="field-links"><a href="${domainURL(id)}">${esc(d.name)}为何这样观察 →</a><a href="${routeURL('compare',{entities:entity.id,metric:d.metricId})}">比较这个领域 →</a><a href="${routeURL('data',{sheet:id,q:entity.name})}">定位原表 →</a></div></div>${populated.length?fieldsHTML(populated):'<p class="entity-domain-guide">本实体没有已填写的具名明细记录。</p>'}${other.length?`<details class="other-records"><summary>未记录项与辅助字段 · ${other.length} 项</summary>${fieldsHTML(other)}</details>`:''}</details>`;}).join('')}</section><details class="research-note"><summary>计算参考与综合名次的关系</summary><div class="entity-domain-guide"><p>本实体公式参考值：${referenceCell(entity)}。该值不是百分制总分，也不用于重新排列综合名次。</p><a class="button text" href="#/methodology">查看计算方法与作者判断的边界 →</a></div></details>`;
  $$('[data-open-domain]').forEach(button=>button.addEventListener('click',()=>{const target=$('#entity-domain-'+button.dataset.openDomain);target.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});$('summary',target).focus();}));
}
function renderCompare(params) {
  const supplied=params.has('entities');
  const ids=[...new Set((params.get('entities')||'').split(',').filter(id=>byId.has(id)))].slice(0,5);
  if(!supplied)ids.push(...rankedEntities().slice(0,3).map(e=>e.id));
  let selected=ids.map(id=>byId.get(id));
  const detailIndicators=db.indicators.filter(i=>!['identity','classification','auxiliary'].includes(i.role));
  let chosenMetric=detailIndicators.some(i=>i.id===params.get('metric'))?params.get('metric'):'';
  app.innerHTML=mainHeading('从差异追问依据','实体比较','选择 2–5 个实体。先比较整体位置，再分开看领域名次与基础条件；感兴趣的差异可以继续追到具体字段。')+`<div class="compare-selector"><div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索待添加实体</span><input class="input" id="compare-search" placeholder="搜索要添加的实体…"></label><select class="select" id="compare-select" aria-label="选择待比较实体"></select><button class="button primary" id="compare-add" type="button">添加实体 +</button></div><div class="chosen-entities" id="chosen-entities"></div><p class="section-note" id="compare-limit" aria-live="polite"></p><p class="section-note">地址栏链接会随选择更新，可直接复制分享。</p></div><div id="compare-content"></div>`;
  function syncHash(){history.replaceState(null,'',routeURL('compare',{entities:selected.map(e=>e.id).join(','),...(chosenMetric?{metric:chosenMetric}:{})}));}
  function options(){const q=$('#compare-search').value.trim().toLowerCase();const list=db.entities.filter(e=>!selected.some(s=>s.id===e.id)&&(!q||(e.name+' '+e.englishName).toLowerCase().includes(q)));$('#compare-select').innerHTML=list.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}${e.ranked?' · '+format(e.rank):' · 补充'}</option>`).join('');$('#compare-add').disabled=selected.length>=5||!list.length;}
  function chartCard(name,kind,rows,indicator=null){
    if(compositeDefinitions(indicator).length)return `<article class="comparison-card composite-comparison"><div class="comparison-card-heading"><h3>${esc(name)}</h3><small>组合记录 · 分项阅读</small></div>${rows.map(r=>`<div class="composite-compare-row"><a class="entity-name" href="${entityURL(r.entity)}">${esc(r.entity.name)}</a>${compositeValues(r.cell,indicator,cellId(r.entity.id,r.metricId))}</div>`).join('')}<p class="bar-note">点后按保存位数显示，“未单列”不代表零。日本部分 .1 等特殊点后记录含义仍待作者确认。</p></article>`;
    const domain=db.domains.find(d=>d.metricId===indicator?.id);
    return `<article class="comparison-card"><div class="comparison-card-heading"><h3>${esc(name)}</h3><small>${kind==='rank'?'原表名次':kind==='score'?'固定 1–5 等级':kind==='reference'?'计算参考 · 非百分制':esc(indicator?.unit||'原始记录')}</small></div>${comparisonReading(kind,rows,indicator)}${domain?`<p class="comparison-question">${esc(guideFor(domain.id).question)}</p><a class="button text small" href="${domainURL(domain.id)}">理解这个领域 →</a>`:''}</article>`;
  }
  function rowsFor(metricId){return selected.map(e=>({entity:e,value:e.metrics?.[metricId]?.value,cell:e.metrics?.[metricId],metricId,chartable:!['rank','score'].includes(readingMode(byIndicator.get(metricId)))||e.ranked}));}
  function update(){
    $('#chosen-entities').innerHTML=selected.map((e,i)=>`<span class="entity-chip" style="--color:${palette[i]}"><i aria-hidden="true"></i><a href="${entityURL(e)}">${esc(e.name)}</a><button data-remove-entity="${esc(e.id)}" type="button" aria-label="移除${esc(e.name)}">×</button></span>`).join('');
    $('#compare-limit').textContent=`已选 ${selected.length} / 5 个实体${selected.length<2?' · 请再添加实体进行比较':''}`;
    options();syncHash();
    $$('[data-remove-entity]').forEach(b=>b.addEventListener('click',()=>{selected=selected.filter(e=>e.id!==b.dataset.removeEntity);update();}));
    if(selected.length<2){$('#compare-content').innerHTML=empty('选择至少两个实体','从上方搜索并添加另一个实体。');return;}
    $('#compare-content').innerHTML=`${selected.filter(e=>!e.ranked||e.id==='european-union').map(scopeNote).join('')}<div class="table-wrap"><table><thead><tr><th class="freeze header">整体位置</th>${selected.map(e=>`<th>${esc(e.name)}</th>`).join('')}</tr></thead><tbody><tr><td class="freeze">综合名次</td>${selected.map(e=>`<td>${e.ranked?esc(format(e.rank)):'补充实体'}</td>`).join('')}</tr></tbody></table></div>
    ${['rank','score'].map(kind=>`<section class="section"><div class="section-heading"><div><h2>${kind==='rank'?'领域位置：看顺序':'基础条件：看等级'}</h2><p class="section-note">${kind==='rank'?'名次越小，原表位置越靠前；不通过条长暗示能力差距。':'评分采用固定 1–5 等级，不随比较对象变化。小数评分保留原值。'}</p></div></div><div class="comparison-grid">${db.domains.filter(d=>d.kind===kind).map(d=>chartCard(d.name,d.kind,rowsFor(d.metricId),byIndicator.get(d.metricId))).join('')}</div></section>`).join('')}
    <section class="section"><div class="section-heading"><div><h2>进一步比较具体依据</h2><p class="section-note">选择一个感兴趣的字段，把领域差异放回实际记录中理解。</p></div></div><label class="select-label">选择字段<select class="select" id="compare-metric" style="max-width:100%;width:440px"><option value="">请选择要追问的字段</option>${db.sheets.map(s=>`<optgroup label="${esc(s.name)}">${detailIndicators.filter(i=>i.sheetId===s.id).map(i=>`<option value="${esc(i.id)}" ${i.id===chosenMetric?'selected':''}>${esc(i.name)}${detailIndicators.filter(x=>x.name===i.name&&x.sheetId===i.sheetId).length>1?'（'+esc(i.column)+' 列）':''}</option>`).join('')}</optgroup>`).join('')}</select></label><div id="compare-metric-content" style="margin-top:20px"></div></section><details class="research-note"><summary>查看各实体的公式参考值</summary><div class="entity-domain-guide"><p>公式参考值不是百分制，也不用于重新排列综合名次。</p>${selected.map(e=>`<p>${esc(e.name)}：${referenceCell(e)}</p>`).join('')}<a href="#/methodology">查看方法 →</a></div></details>`;
    $('#compare-metric').addEventListener('change',e=>{chosenMetric=e.target.value;syncHash();updateMetric();});updateMetric();
  }
  function updateMetric(){const indicator=byIndicator.get(chosenMetric);$('#compare-metric-content').innerHTML=indicator?`${readerExplanation(indicator.explanation)}${metadata(indicator)}${indicator.note?`<details class="research-note"><summary>字段口径补充</summary><p class="entity-domain-guide">${esc(indicator.note)}</p></details>`:''}${chartCard(indicator.name,readingMode(indicator),rowsFor(indicator.id),indicator)}<a class="button text" href="${indicatorURL(indicator)}">查看所有实体的该字段 →</a>`:'';}
  $('#compare-search').addEventListener('input',options);
  $('#compare-add').addEventListener('click',()=>{const entity=byId.get($('#compare-select').value);if(entity&&selected.length<5&&!selected.includes(entity)){selected.push(entity);$('#compare-search').value='';update();}});
  update();
}
function renderIndicators(params) {
  const state={sheet:params.get('sheet')||'',q:params.get('q')||'',aux:false};
  const fields=db.indicators.filter(i=>i.role!=='identity'&&i.role!=='classification');
  app.innerHTML=breadcrumb(['数据与方法','#/library'],['字段目录'])+mainHeading('追问一个具体问题','字段目录','按领域查找记录与解释。第一次阅读可先进入八领域导读，了解这些字段为什么放在一起。',`<a class="button" href="#/framework">八领域导读 →</a>`)+`<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索指标字段</span><input class="input" id="indicator-search" placeholder="搜索指标、领域或工作表…" value="${esc(state.q)}"></label><label class="checkbox-label"><input type="checkbox" id="indicator-aux">包含未命名辅助字段</label><span class="toolbar-end" id="indicator-count" aria-live="polite"></span></div><div class="indicator-layout"><aside class="indicator-sidebar" aria-label="按工作表筛选"><button type="button" data-indicator-sheet="" class="${state.sheet?'':'active'}">全部工作表<span>${fields.filter(i=>i.role!=='auxiliary').length}</span></button>${db.sheets.map(s=>`<button type="button" data-indicator-sheet="${esc(s.id)}" class="${state.sheet===s.id?'active':''}">${esc(s.name)}<span>${fields.filter(i=>i.sheetId===s.id&&i.role!=='auxiliary').length}</span></button>`).join('')}</aside><div id="indicator-list"></div></div>`;
  function update(){const q=state.q.trim().toLowerCase();const list=fields.filter(i=>(!state.sheet||i.sheetId===state.sheet)&&(state.aux||i.role!=='auxiliary')&&(!q||(i.name+' '+i.sheetName+' '+(i.unit||'')+' '+(i.explanation?.text||'')).toLowerCase().includes(q)));$('#indicator-count').textContent=`${list.length} 个字段`;$('#indicator-list').innerHTML=(!state.sheet&&!q?`<div class="directory-intro"><h2>从领域问题进入</h2><div class="field-links">${domainLinks(db.domains.map(d=>d.id))}</div><p>下方保留完整字段目录，也可使用左侧工作表筛选。</p></div>`:'')+(list.length?`<div class="indicator-cards">${list.map(i=>{const count=indicatorCells(i).filter(r=>r.cell?.value!=null||r.cell?.error).length;return `<a class="indicator-card" href="${indicatorURL(i)}"><p class="eyebrow">${esc(i.sheetName)} · ${esc(i.column)} 列</p><h3>${esc(i.name)}${i.type==='composite'?' <span class="pill ochre">两项数量</span>':''}</h3>${i.explanation?.text?`<p class="indicator-excerpt">${esc(i.explanation.text)}</p>`:''}<div class="indicator-card-meta">${knownMetadata(i).filter(([label])=>label!=='工作表').map(([label,value])=>`<span>${esc(label)}：${esc(value)}</span>`).join('')}</div><div class="indicator-card-count"><span>${count} 个实体有记录${i.role==='auxiliary'?' · 辅助字段':''}</span><span aria-hidden="true">↗</span></div></a>`;}).join('')}</div>`:empty());$$('[data-indicator-sheet]').forEach(b=>b.classList.toggle('active',b.dataset.indicatorSheet===state.sheet));}
  $('#indicator-search').addEventListener('input',e=>{state.q=e.target.value;update();});$('#indicator-aux').addEventListener('change',e=>{state.aux=e.target.checked;update();});$$('[data-indicator-sheet]').forEach(b=>b.addEventListener('click',()=>{state.sheet=b.dataset.indicatorSheet;update();}));update();
}
function renderIndicator(id,params) {
  const indicator=byIndicator.get(id);if(!indicator){app.innerHTML=empty('未找到该指标');return;}
  const parts=compositeDefinitions(indicator),mode=readingMode(indicator),domain=db.domains.find(d=>d.id===indicator.sheetId||d.metricId===id);
  const canOrder=indicator.rankingAllowed!==false&&indicator.type!=='composite';
  const state={q:params.get('q')||'',order:canOrder?(mode==='rank'?'asc':'source'):'source',only:false};
  const meaning=mode==='rank'?'这是原表名次，越小越靠前。名次之比不代表能力之比。':mode==='score'?'这是该领域的基础评分，主要采用固定 1–5 等级。':mode==='reference'?'这是公式计算的参考值，可能超过 100；它不是百分制总分，也不决定综合名次。':parts.length?'两项记录分别阅读，点号不是普通小数点。':'观察同一个字段在不同实体中的记录。数值顺序不自动构成新的研究排名。';
  app.innerHTML=breadcrumb(['数据与方法','#/library'],['字段目录','#/indicators'],[indicator.name])+mainHeading('从领域到依据',indicator.name,esc(meaning),`<a class="button" href="${routeURL('data',{sheet:indicator.sheetId})}">定位原工作表 ↗</a>`)+readerExplanation(indicator.explanation)+`${domain?`<p class="field-context"><a href="${domainURL(domain.id)}">放回${esc(domain.name)}领域理解 →</a></p>`:''}`+metadata(indicator)+`${indicator.note?`<details class="research-note" ${parts.length?'open':''}><summary>字段口径补充</summary><p class="entity-domain-guide">${esc(indicator.note)}</p></details>`:''}<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索实体</span><input class="input" id="indicator-entity-search" value="${esc(state.q)}" placeholder="搜索实体名称…"></label>${canOrder?`<select class="select" id="indicator-order" aria-label="数值排序"><option value="source" ${state.order==='source'?'selected':''}>原表实体顺序</option><option value="asc" ${state.order==='asc'?'selected':''}>${mode==='rank'?'名次靠前优先':'数值从小到大'}</option><option value="desc">${mode==='rank'?'名次靠后优先':'数值从大到小'}</option></select>`:''}<label class="checkbox-label"><input type="checkbox" id="indicator-only">仅显示有记录项</label><span class="toolbar-end" id="indicator-entity-count" aria-live="polite"></span></div><div class="indicator-results ${parts.length?'composite-results':''}"><div><div class="table-wrap" tabindex="0" role="region" aria-label="指标实体数据"><table><thead><tr><th class="freeze header">实体</th>${parts.length?parts.map((part,index)=>`<th>${esc(part.label)}<span class="table-group">${index===0?'点前记录':'点后记录'}</span></th>`).join(''):`<th>${mode==='rank'?'原表名次':mode==='score'?'基础评分':'原始记录'}</th>`}<th>补充说明</th></tr></thead><tbody id="indicator-entity-body"></tbody></table></div><div id="indicator-entity-empty"></div><p class="table-hint">${parts.length?'“未单列”不代表零。日本部分 .1 等特殊点后记录仍待作者确认。':'“—”表示未记录，与零不同。'}点击数值查看原单元格与公式。</p></div><aside class="side-note"><h3>${mode==='score'?'评分怎样理解':parts.length?'保留点后记录的含义':'接下来可以怎样读'}</h3>${mode==='score'?`<ol class="score-key">${scoreLabels.map(label=>`<li>${label}</li>`).join('')}</ol><p>小数评分按原表保留。补充实体中的标记不进入这套等级。</p>`:parts.length?'<p>点前、点后按已保存的位数分别显示。整数记录的第二项未单列；Excel 可能丢失的尾零不能自行恢复。</p>':`<p>${esc(meaning)}</p><p>点实体名称看整体结构；点数字看记录依据。需要横向追问时，可以选择几个实体比较。</p>`}<a class="button text" href="${routeURL('compare',{metric:indicator.id})}">比较这个字段 →</a></aside></div>`;
  function update(){
    const q=state.q.trim().toLowerCase();
    let list=indicatorCells(indicator).filter(r=>(!q||(r.entity.name+' '+r.entity.englishName).toLowerCase().includes(q))&&(!state.only||r.cell?.value!=null||r.cell?.error));
    if(state.order!=='source')list.sort((a,b)=>sortValues(a.cell?.value,b.cell?.value,state.order));
    $('#indicator-entity-count').textContent=`${list.length} 个实体`;
    $('#indicator-entity-body').innerHTML=list.map(({entity,cell})=>`<tr><td class="freeze">${entityLink(entity)}</td>${parts.length?parts.map(part=>`<td>${inspectCell(cell,cellId(entity.id,indicator.id),'',part.id)}</td>`).join(''):`<td>${inspectCell(cell,cellId(entity.id,indicator.id))}</td>`}<td class="muted">${cell?.error?'原表错误':cell?.value==null?'未记录':['rank','score'].includes(mode)&&!entity.ranked?'补充记录':parts.length?(cell?.composite?.status==='unparsed'?'组合记录待核对':compositePart(cell,'secondary')?.digits==null?'第二项未单列':'点后按保存位数'):''}</td></tr>`).join('');
    $('#indicator-entity-empty').innerHTML=list.length?'':empty();
  }
  $('#indicator-entity-search').addEventListener('input',e=>{state.q=e.target.value;update();});$('#indicator-order')?.addEventListener('change',e=>{state.order=e.target.value;update();});$('#indicator-only').addEventListener('change',e=>{state.only=e.target.checked;update();});update();
}
function renderMethodology() {
  const m=db.methodology||{},items=values=>`<ul>${(values||[]).map(value=>`<li>${esc(textValue(value))}</li>`).join('')}</ul>`;
  app.innerHTML=breadcrumb(['数据与方法','#/library'],['来源与方法'])+mainHeading('理解研究结果','来源与方法','这项研究把统计记录、计算与作者判断放在同一框架中。理解结果，需要区分它们各自能够说明什么。')+`<div class="prose-layout"><article class="prose"><h2>研究的是长期行动的条件</h2><p>国家的长期能力既取决于生产、知识与军事基础，也取决于资源、运输和组织能否持续支撑它们。八个领域共同描述这些条件，帮助观察整体位置与能力结构。</p><p>这套框架不衡量生活质量、文化价值，也不能预测具体战争结果或精确的承压时长。读相邻名次时，宜先看领域结构与梯队，不把位置差距当作能力差距。</p><a class="button text" href="#/framework">八个领域各自回答什么 →</a><h2>从记录到综合判断</h2><ol class="method-steps"><li><strong>原始记录与派生字段</strong><p>工作簿包含统计数值、公式和人工填写内容。字段之间可能重复或派生，不能把字段总数当作独立研究指标数量。</p></li><li><strong>领域名次与基础评分</strong><p>政治、经济、军事以名次描述相对位置；交通、农业、能源、矿产、稳定主要以 1–5 等级描述基础条件。两种读数不可直接当作同一尺度。</p></li><li><strong>公式参考</strong><p>公式对领域结果进行变换与加权，并依据基础评分的最低值作调整。它可能超过 100，不是百分制总分。公式系数也不能解释为现实能力的组成比例。</p></li><li><strong>作者保存的综合名次</strong><p>网站以原表综合名次为准，包括小数名次。现有资料没有完整记录所有人工调整过程，因此不能由底层字段完整复现作者判断，也不能逐国补写未经记录的排名理由。</p></li></ol><h2>基础评分怎样读</h2><ol class="score-key">${scoreLabels.map(label=>`<li>${label}</li>`).join('')}</ol><p>这是原研究对基础条件的分级，不能理解为能力倍数。小数评分保留原值；补充实体中的 10、100 等标记不进入正常等级。欧盟单列为评价实体，其总量也不等于可以完全统一调度的资源。</p>
  <details class="research-note"><summary>展开公式、权重与特殊修正</summary><div class="entity-domain-guide">${m.formula?`<div class="formula">${esc(m.formula)}</div>`:''}${m.formulaVariants?.map(v=>`<p><strong>${esc(v.entity)}</strong>（${esc(v.origin)}）：<code>${esc(v.formula)}</code></p>`).join('')||''}<div class="table-wrap"><table><thead><tr><th>领域</th><th>原表权重 / 参数</th></tr></thead><tbody>${m.weights?.map(w=>`<tr><td>${esc(w.name)}</td><td>${esc(format(w.weight))}</td></tr>`).join('')||''}</tbody></table></div>${items(m.notes)}</div></details>
  <h2>数值与解释分别来自哪里</h2><p>当前 Excel 是网站唯一权威数值来源。报告《综合国力2.0》用于解释方法和字段，相关说明标明实际 PDF 页码；旧报告数值不覆盖工作簿。</p><p>只在有明确记录时显示字段的单位、年份和来源。没有记录的元信息留空，不补猜；文件保存日期不充当观测年份。背景报告中的来源清单不能证明每个字段的具体出处。</p><details class="research-note"><summary>展开背景来源与报告解释索引</summary><div class="entity-domain-guide">${(m.sources||[]).map(s=>`<div class="source-item"><strong>${s.url&&/^https?:\/\//.test(s.url)?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`:esc(s.label)}</strong>${s.note?`<p>${esc(s.note)}</p>`:''}</div>`).join('')}${readerNotesDirectory()}</div></details>
  <h2>哪些问题仍需保留</h2><p>空白与零不同；原表错误也不会被改成零。已知除零错误、名次与参考值不完全一致、部分年份和来源不全等，保留在本版本记录中。</p><p>军事中的五组点号记录分别展示两项，按当前保存位数读取。第二项未单列时不补零，可能丢失的尾零不恢复；日本部分 .1 等记录的确切含义仍待作者确认。</p><details class="research-note"><summary>展开完整限制说明</summary><div class="entity-domain-guide">${items(m.limitations)}<p>自动检查确认转换与显示是否忠实，不代表每条原始统计与研究判断都已独立核实。</p></div></details><details class="qa-details"><summary>本版本数据检查记录 · ${esc(db.quality?.issues?.length||0)} 项</summary><p>已检查 ${esc(db.quality?.summary?.formulasChecked??'—')} 个公式缓存；保留 ${esc(db.quality?.summary?.excelErrors??'—')} 个 Excel 原生错误。当前 ${esc(db.quality?.summary?.errors??0)} 项阻断问题。</p>${(db.quality?.issues||[]).map(issue=>`<div class="qa-item"><span class="pill">${esc(({error:'阻断问题',warning:'提示',info:'信息'})[issue.severity]||issue.severity)}</span> <code>${esc(issue.code)}</code><p>${esc(issue.message)}</p>${issue.locations?.length?`<small>${esc(issue.locations.map(textValue).join(' · '))}</small>`:''}</div>`).join('')}</details></article><aside class="side-note"><h3>带着问题查依据</h3><p>要理解领域关系，先读八领域框架。</p><a class="button text" href="#/framework">研究框架 →</a><p>要核对一个数字，进入字段或原表，点击数值即可查看原单元格与公式。</p><a class="button text" href="#/indicators">查找字段 →</a><a class="button text" href="#/downloads">下载本版本数据 →</a></aside></div>`;
}
function renderDownloads() {
  const downloads=db.downloads||[];
  const firstCsv=downloads.find(d=>String(d.format).toLowerCase()==='csv');
  const primary=downloads.filter(d=>['xlsx','json','zip'].includes(String(d.format).toLowerCase())||d===firstCsv);
  const others=downloads.filter(d=>!primary.includes(d));
  const safeHref=href=>typeof href==='string' && /^(?:\.\/)?(?:downloads|data)\/[a-z0-9._/-]+$/i.test(href.trim()) && !href.trim().split('/').includes('..')?href.trim():'#/downloads';
  app.innerHTML=mainHeading('OPEN DATA','下载与复用','下载工作簿、标准化数据和分表 CSV。Excel 是本项目唯一权威数值来源；CSV 与 JSON 由同一版本自动生成。')+`<a class="button" href="./offline.html" download>下载单文件离线版 HTML ↓</a><div class="download-grid" style="margin-top:24px">${primary.map(d=>`<article class="download-card"><div class="file-icon">${esc(d.format.toUpperCase())}</div><h3>${esc(d.label)}</h3><p>${esc(d.description||'')}</p><a class="button primary" href="${esc(safeHref(d.href))}" download>下载 ${esc(d.format.toUpperCase())} <span aria-hidden="true">↓</span></a></article>`).join('')}</div>${others.length?`<section class="section"><div class="section-heading"><div><h2>分表与补充文件</h2><p class="section-note">CSV 保留工作表中的原始信息；如需公式与样式，请下载 Excel。</p></div></div>${others.map(d=>`<div class="download-item"><div><h3>${esc(d.label)}</h3><p>${esc(d.description||'')}</p></div><a class="button small" href="${esc(safeHref(d.href))}" download>${esc(d.format.toUpperCase())} ↓</a></div>`).join('')}</section>`:''}<div class="notice" style="margin-top:30px"><p>研究版本：${esc(db.meta.researchVersion || db.meta.version)}${db.meta.dataVersion?' · 数据版本：'+esc(db.meta.dataVersion):''} · 工作簿保存日期：${esc(shortDate(db.meta.workbookModifiedAt))} · 网站构建日期：${esc(shortDate(db.meta.builtAt))}</p><p>下载的工作簿保留单元格、公式、已缓存结果和样式；公开副本仅清理文档作者、最后编辑者及打印机元数据。使用资料时，请注明项目名称及版本，并一并保留来源与口径限制。</p></div><p class="section-note" style="overflow-wrap:anywhere">源文件 SHA-256：${esc(db.meta.sourceSha256||'未注明')}</p><div class="button-group" style="margin-top:22px"><a class="button text" href="https://github.com/Lawrence35952563/National-Power" target="_blank" rel="noopener noreferrer">查看源码与更新记录 ↗</a><a class="button text" href="#/methodology">来源与方法 →</a></div>`;
}
function openCell(button) {
  let cell,indicator,entity;
  if(button.dataset.entity){entity=byId.get(button.dataset.entity);indicator=byIndicator.get(button.dataset.metric);cell=entity?.metrics?.[button.dataset.metric];}
  else{const sheet=bySheet.get(button.dataset.sheet),row=sheet?.rows.find(r=>String(r.row)===button.dataset.row);cell=row?.cells?.[button.dataset.columnRef];indicator=db.indicators.find(i=>i.sheetId===sheet?.id&&i.column===button.dataset.columnRef);entity=byId.get(row?.entityId);}
  const parts=compositeDefinitions(indicator),isComposite=parts.length>0||cell?.kind==='composite';
  const shown=isComposite?displayCellValue(cell):cell?.error || (cell?.raw ?? cell?.value);
  const meta=[['实体',entity?.name||'辅助 / 未映射行'],...(isComposite?[['组合写法',shown]]:[['显示完整值',cell?.error || (cell?.value==null?'—':String(cell.value))]]),['工作表',cell?.sheet||indicator?.sheetName||'未注明'],['单元格',cell?.address||'未记录'],...knownMetadata(indicator).filter(([label])=>label!=='工作表'),...(indicator?.estimate!=null?[['是否估算',indicator.estimate?'是':'否']]:[])];
  const advanced=[['原始 XML 值',cell?.raw==null?'空白':String(cell.raw)],['单元格类型',({number:'数值',text:'文本',composite:'复合编码',boolean:'布尔值',error:'错误',blank:'空白'})[cell?.kind]||'空白'],['Excel 数字格式',cell?.numberFormat||'未记录']];
  $('#cell-content').innerHTML=`<h2 id="cell-title">${esc(indicator?.name||'工作簿单元格')}</h2><p class="muted" style="font-size:12px">${esc(entity?.name||'原始工作表记录')}</p>${parts.length?`<div class="composite-readout">${parts.map((part,index)=>`<div class="${button.dataset.component===part.id?'active':''}"><span>${esc(part.label)}<small>${index===0?'点前记录':'点后记录'}</small></span><strong>${esc(displayCellValue(cell,part.id))}</strong></div>`).join('')}</div>`:`<p class="cell-value-large">${esc(shown==null?'—':String(shown))}</p>`}${cell?.error?`<div class="notice ochre">这是原工作簿中的错误值，网站未修改或填补。</div>`:isComposite?`<div class="notice"><p>${cell?.composite?.status==='unparsed'?'该组合记录尚未可靠拆分，各分项显示“待核对”。可展开高级溯源查看原始存储记录。':'点前、点后分别记录不同数量；“未单列”不代表零。第二项按当前保存的位数展示，不能据此确认输入时是否另有尾零。'}</p>${cell?.composite?.note?`<p>${esc(cell.composite.note)}</p>`:''}</div>`:''}${readerExplanation(indicator?.explanation,{compact:true})}<table class="cell-meta-table"><tbody>${meta.map(([key,value])=>`<tr><th>${esc(key)}</th><td>${esc(value)}</td></tr>`).join('')}${indicator?.note?`<tr><th>字段说明</th><td>${esc(indicator.note)}</td></tr>`:''}</tbody></table><details class="raw-provenance"><summary>高级溯源：原始存储与公式</summary>${isComposite?'<p>下面保留 Excel 的底层存储字符串，其中可能存在浮点尾差；不将该字符串直接解释为第二项数量。</p>':''}<table class="cell-meta-table"><tbody>${advanced.map(([key,value])=>`<tr><th>${esc(key)}</th><td><code>${esc(value)}</code></td></tr>`).join('')}${cell?.formula?`<tr><th>原始公式</th><td><code>${esc(cell.formula)}</code></td></tr>`:''}${cell?.composite?.normalization?`<tr><th>显示规范化记录</th><td><code>${esc(textValue(cell.composite.normalization))}</code></td></tr>`:''}</tbody></table></details><div class="dialog-actions">${indicator?`<a class="button small" href="${indicatorURL(indicator)}" data-close-dialog>查看该字段全部实体 ↗</a>`:''}<button class="button small" data-close-dialog type="button">关闭</button></div>`;
  $('#cell-dialog').showModal();
}
document.addEventListener('click',event=>{if(event.target.closest('.skip-link')){event.preventDefault();app.focus();app.scrollIntoView();return;}const inspect=event.target.closest('.inspect');if(inspect)openCell(inspect);if(event.target.closest('[data-close-dialog]'))$('#cell-dialog').close();});
$('#cell-dialog').addEventListener('click',event=>{if(event.target===$('#cell-dialog')){const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)event.target.close();}});
$('.menu-toggle').addEventListener('click',()=>{const open=$('#navigation').classList.toggle('open');$('.menu-toggle').setAttribute('aria-expanded',String(open));});
window.addEventListener('hashchange',()=>{if(db)route();});
async function start(){
  try {
    if(window.NATIONAL_POWER_DATA)db=window.NATIONAL_POWER_DATA;
    else{const response=await fetch('./data/dataset.json',{cache:'no-cache'});if(!response.ok)throw new Error(`数据请求失败（${response.status}）`);db=await response.json();}
    if(!Array.isArray(db.entities)||!Array.isArray(db.indicators)||!Array.isArray(db.sheets))throw new Error('数据格式不完整');
    byId=new Map(db.entities.map(e=>[e.id,e]));byIndicator=new Map(db.indicators.map(i=>[i.id,i]));bySheet=new Map(db.sheets.map(s=>[s.id,s]));
    $('#footer-version').textContent=`研究版本 ${db.meta.researchVersion||db.meta.version||'—'} · ${db.meta.dataVersion?'数据版本 '+db.meta.dataVersion:'工作簿保存于 '+shortDate(db.meta.workbookModifiedAt)}`;
    route();
  }catch(error){console.error('Data load failed',error);app.innerHTML=`<div class="error-panel"><h1>研究数据尚未载入</h1><p>请检查网络后刷新页面，或通过 GitHub 下载工作簿。如果正在本地查看网站，请使用项目提供的本地预览入口。</p><code>${esc(error.message)}</code><p><a class="button" href="https://github.com/Lawrence35952563/National-Power" target="_blank" rel="noopener noreferrer">打开 GitHub 项目 ↗</a></p></div>`;}
}
start();
