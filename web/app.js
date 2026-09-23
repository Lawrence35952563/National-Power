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
const metadata = indicator => `<div class="metadata-grid">${[['单位',indicator.unit],['观测年份',indicator.year],['数据来源',indicator.source],['工作表',indicator.sheetName]].map(([label,value])=>`<div class="metadata-item"><div class="metadata-label">${esc(label)}</div><div class="metadata-value">${esc(textValue(value))}</div></div>`).join('')}</div>`;
const summaryNotice = () => `<div class="notice">综合名次保留工作簿的既定结果，包含小数名次。政治、经济、军事为名次（数值越小越靠前）；其余领域为评分。${esc(referenceLabel())}单独展示，不用于重新生成综合排名。</div>`;
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
function navActive(path) {
  const key = path.startsWith('entity/') ? 'rankings' : path.startsWith('indicator/') ? 'indicators' : path;
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
  const c=db.meta.counts, preview=rankedEntities().slice(0,6);
  app.innerHTML = `<section class="hero"><div><div class="hero-date"><span class="pill teal">独立数据研究</span><span>研究版本 ${esc(db.meta.researchVersion || db.meta.version || '2.0')}</span><span>${db.meta.dataVersion?'数据版本 '+esc(db.meta.dataVersion):'工作簿保存 '+esc(shortDate(db.meta.workbookModifiedAt))}</span></div><h1>国家长期能力<br>综合排名</h1><p class="hero-en">A longer view of national power.</p><p class="lead">通过人口、经济、资源与组织能力等多个领域，观察不同国家与实体的长期能力基础。浏览项目的既定排名，回到完整数据，也可以建立自己的比较。</p><div class="button-group"><a class="button primary" href="#/rankings">探索综合排名 <span aria-hidden="true">↗</span></a><a class="button" href="#/data">浏览完整数据 <span aria-hidden="true">→</span></a></div></div><div class="hero-graphic" aria-label="国家长期能力研究版本和领域"><div class="graphic-grid" aria-hidden="true"></div><div class="graphic-inner"><div class="graphic-top"><span class="graphic-title">National Power / Research Series</span><span class="graphic-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="graphic-version">${esc(String(db.meta.researchVersion || db.meta.version || '2.0').replace(/^[vV]/,''))}<small>RESEARCH EDITION</small></div><div class="graphic-rule"></div><div class="graphic-domains">${db.domains.map((d,i)=>`<div>${String(i+1).padStart(2,'0')}<b>${esc(d.name)}</b></div>`).join('')}</div><div class="graphic-foot"><span>A MULTIDIMENSIONAL PERSPECTIVE</span><span>${esc(c.domains)} DOMAINS</span></div></div></div></section>
  <div class="stats-grid"><div class="stat"><p class="stat-label">覆盖实体</p><p class="stat-value">${esc(c.entities)}</p><p class="stat-sub">${esc(c.rankedEntities)} 个正式排名 · ${esc(c.supplementaryEntities)} 个补充实体</p></div><div class="stat"><p class="stat-label">一级领域</p><p class="stat-value">${esc(c.domains)}</p><p class="stat-sub">从综合结果到领域细节</p></div><div class="stat"><p class="stat-label">具名明细字段</p><p class="stat-value">${esc(c.indicators)}</p><p class="stat-sub">按工作簿表头计数，含派生与重复字段</p></div><div class="stat"><p class="stat-label">原始工作表</p><p class="stat-value">${esc(c.sheets)}</p><p class="stat-sub">完整保留数据、辅助列与原始值</p></div></div>
  <div class="home-bottom"><section><div class="section-heading"><div><h2><span class="section-number">01</span>综合排名一览</h2><p class="section-note">沿用工作簿名次，不按参考值重新排序</p></div><a class="button text" href="#/rankings">完整排名 →</a></div><div class="table-wrap"><table><thead><tr><th>既定名次</th><th style="text-align:left">实体</th><th>分类</th><th>公式参考值<span class="table-group">非百分制 · 非综合名次</span></th></tr></thead><tbody>${preview.map(e=>`<tr><td class="rank-cell top">${esc(format(e.rank))}</td><td style="text-align:left">${entityLink(e)}</td><td>${esc(e.category||'—')}</td><td class="reference-cell">${referenceCell(e)}</td></tr>`).join('')}</tbody></table></div><p class="table-hint">小数名次按原表展示；公式参考值并非统一百分制得分。</p></section><aside class="home-aside"><h3>从排名到数据细节</h3><p>排名提供入口，原始数据提供细节。各领域采用不同口径，缺失值、估算说明与来源限制都应一起阅读。</p><a class="feature-link" href="#/compare">选择实体，逐项比较<span aria-hidden="true">↗</span></a><a class="feature-link" href="#/indicators">从一个指标看不同实体<span aria-hidden="true">↗</span></a><a class="feature-link" href="#/methodology">理解方法、来源与边界<span aria-hidden="true">↗</span></a></aside></div>
  <div class="notice" style="margin-top:32px">数值以本版本 Excel 为唯一依据。历史报告仅用于解释项目背景；单项来源、年份或单位未在工作簿中注明的，会明确显示“未注明”。具名明细字段数量不等同于相互独立的研究指标数量。</div>`;
}
function referenceCell(entity) {
  const metric=db.indicators.find(i=>i.role==='reference');
  return metric && entity.metrics?.[metric.id] ? inspectCell(entity.metrics[metric.id],cellId(entity.id,metric.id)) : esc(format(entity.referenceValue));
}
function summaryTableRows(entities) {
  return entities.map(e=>`<tr><td class="freeze">${entityLink(e)}</td><td class="rank-cell">${e.ranked?esc(format(e.rank)):'<span class="empty-value">未排名</span>'}</td><td>${esc(e.category||'—')}</td>${db.domains.map(d=>`<td>${inspectCell(e.metrics?.[d.metricId] || {value:e.domains?.[d.id]},cellId(e.id,d.metricId))}</td>`).join('')}<td class="reference-cell">${referenceCell(e)}</td></tr>`).join('');
}
function renderRankings(params) {
  const state={search:params.get('q')||'',category:params.get('category')||'',scope:params.get('scope')||'ranked',sort:params.get('sort')||'rank',direction:params.get('dir')||'asc'};
  const categories=[...new Set(db.entities.map(e=>e.category).filter(Boolean))];
  app.innerHTML=mainHeading('COMPOSITE RANKING','综合排名','从项目的既定综合名次出发，查看各领域的原始结果。点击实体名称进入完整档案。',`<a class="button" href="#/compare">建立实体比较 ↗</a>`)+summaryNotice()+`<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索实体</span><input class="input" id="ranking-search" placeholder="搜索中文或英文实体名称…" value="${esc(state.search)}"></label><select class="select" id="ranking-category" aria-label="实体分类"><option value="">全部分类</option>${categories.map(c=>`<option ${state.category===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select><select class="select" id="ranking-scope" aria-label="排名范围"><option value="ranked" ${state.scope==='ranked'?'selected':''}>正式排名实体</option><option value="all" ${state.scope==='all'?'selected':''}>全部实体</option><option value="supplementary" ${state.scope==='supplementary'?'selected':''}>补充实体</option></select><span class="toolbar-end" id="ranking-count" aria-live="polite"></span></div><p class="scroll-caption">左右滑动查看全部领域；点击列标题排序。</p><div class="table-wrap" tabindex="0" role="region" aria-label="综合排名数据表"><table id="ranking-table"><thead><tr>${[['name','实体',''],['rank','既定名次','原始综合排名'],['category','分类',''],...db.domains.map(d=>[d.id,d.name,domainKind(d)]),['reference','公式参考值','非百分制']].map(([key,label,sub],i)=>`<th class="${i===0?'freeze header':''}" data-rank-key="${key}"><button type="button" data-ranking-sort="${key}">${esc(label)} <span class="sort-arrow">↕</span></button>${sub?`<span class="table-group">${esc(sub)}</span>`:''}</th>`).join('')}</tr></thead><tbody id="ranking-body"></tbody></table></div><div id="ranking-empty"></div><p class="table-hint"><span>点击数字可查看完整原值、单元格位置及公式。</span><a href="#/data">转到工作簿完整数据 →</a></p>`;
  function update() {
    const search=state.search.trim().toLowerCase();
    const list=db.entities.filter(e=>(state.scope==='all'||state.scope==='ranked'&&e.ranked||state.scope==='supplementary'&&!e.ranked)&&(!state.category||e.category===state.category)&&(!search||(e.name+' '+e.englishName).toLowerCase().includes(search)));
    const value=e=>state.sort==='reference'?e.referenceValue:db.domains.some(d=>d.id===state.sort)?e.domains?.[state.sort]:e[state.sort];
    list.sort((a,b)=>sortValues(value(a),value(b),state.direction));
    $('#ranking-body').innerHTML=summaryTableRows(list);
    $('#ranking-count').textContent=`${list.length} 个实体`;
    $('#ranking-empty').innerHTML=list.length?'':empty();
    $$('[data-rank-key]').forEach(th=>{const active=th.dataset.rankKey===state.sort;th.setAttribute('aria-sort',active?state.direction==='asc'?'ascending':'descending':'none');$('.sort-arrow',th).textContent=active?state.direction==='asc'?'↑':'↓':'↕';});
  }
  $('#ranking-search').addEventListener('input',e=>{state.search=e.target.value;update();});
  $('#ranking-category').addEventListener('change',e=>{state.category=e.target.value;update();});
  $('#ranking-scope').addEventListener('change',e=>{state.scope=e.target.value;update();});
  $$('[data-ranking-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.rankingSort;state.direction=state.sort===key&&state.direction==='asc'?'desc':'asc';state.sort=key;update();}));
  update();
}
function renderData(params) {
  const sheet=bySheet.get(params.get('sheet')) || db.sheets[0];
  const fields=sheet.columns.map(c=>byIndicator.get(c.indicatorId || c.id) || {...c,sheetId:sheet.id,sheetName:sheet.name});
  const identity=fields.find(f=>f.role==='identity' && (f.name==='国家'||f.name==='实体'||f.type!=='englishName')) || fields.find(f=>f.role==='identity') || fields[0];
  const initialSelected=fields.filter(f=>f.role!=='auxiliary').map(f=>f.id);
  const state=sheetState.get(sheet.id)||{search:'',sort:null,direction:'asc',showRaw:true,selected:new Set(initialSelected)};
  state.selected.add(identity.id); sheetState.set(sheet.id,state);
  const primary=fields.filter(f=>f.role!=='auxiliary'&&f.id!==identity.id),aux=fields.filter(f=>f.role==='auxiliary'&&f.id!==identity.id);
  const hasComposite=fields.some(f=>compositeDefinitions(f).length);
  const explained=fields.filter(f=>f.explanation?.text);
  const fieldOption=f=>`<label class="checkbox-label"><input type="checkbox" data-column="${esc(f.id)}" ${state.selected.has(f.id)?'checked':''}><span>${esc(f.name)}${compositeDefinitions(f).length?` <small>（${compositeDefinitions(f).length} 个分项）</small>`:fields.filter(x=>x.name===f.name).length>1?` <small>(${esc(f.column)})</small>`:''}</span></label>`;
  app.innerHTML=mainHeading('THE WORKBOOK','完整数据','按原工作表查看数据与计算内容。首列固定实体名称；组合记录分为独立数量列，点击数值可查看解释与来源。',`<a class="button" href="#/downloads">下载工作簿 ↗</a>`)+`<div class="sheet-tabs" aria-label="选择工作表">${db.sheets.map(s=>`<a class="${sheet.id===s.id?'active':''}" ${sheet.id===s.id?'aria-current="page"':''} href="${routeURL('data',{sheet:s.id})}">${esc(s.name)}</a>`).join('')}</div><p class="sheet-meta">${esc(sheet.name)} · ${esc(sheet.role==='summary'?'综合结果表':'数据与计算表')} · ${fields.length} 个原工作簿字段（含身份及辅助字段）。匿名计算行可一并查看；“—”表示空白，不代表零。</p>${readerExplanation(sheet.explanation,{compact:true})}${hasComposite?`<div class="notice">点号前后分别记录不同数量，下表已拆成独立列。“点后记录”仅按当前保存的位数展示；整数记录的第二项显示“未单列”，不补成零。${explained.length?'各项含义见下方口径说明。':''}</div>`:''}${explained.length?`<details class="field-explanations"><summary>指标含义与口径 · ${explained.length} 项说明</summary><div class="explanation-list">${explained.map(f=>readerExplanation(f.explanation,{compact:true})).join('')}</div></details>`:''}<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索工作表</span><input class="input" id="sheet-search" placeholder="搜索实体名称或单元格内容…" value="${esc(state.search)}"></label><label class="checkbox-label"><input id="sheet-raw-rows" type="checkbox" ${state.showRaw?'checked':''}>包含辅助行</label><span class="toolbar-end" id="sheet-count" aria-live="polite"></span></div><details class="column-picker"><summary>选择显示字段 <span id="column-count"></span> · 展开 / 折叠</summary><div class="column-picker-body"><div class="column-actions"><button class="button small" id="columns-main" type="button">仅具名字段</button><button class="button small" id="columns-all" type="button">全部字段</button><button class="button small" id="columns-clear" type="button">仅保留实体</button></div><div class="column-group-label">具名字段${hasComposite?'（组合字段按组选择）':''} <button class="group-toggle" data-column-group="primary" type="button">全选 / 取消</button></div><div class="column-grid">${primary.map(fieldOption).join('')}</div>${aux.length?`<details style="margin-top:15px"><summary style="padding:0;font-size:11px;color:var(--muted)">未命名辅助字段 · ${aux.length} 列（原样保留）</summary><div class="column-group-label"><button class="group-toggle" data-column-group="aux" type="button">全选 / 取消</button></div><div class="column-grid">${aux.map(fieldOption).join('')}</div></details>`:''}</div></details><p class="scroll-caption">左右滑动查看更多列；实体列与表头保持固定。</p><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(sheet.name)}完整数据表"><table id="sheet-table"></table></div><div id="sheet-empty"></div><p class="table-hint"><span>${hasComposite?'拆分数量按保存记录的位数显示；点击分项可查看组合写法和来源。':'表格默认精简小数显示；点击单元格可查看完整精度与来源。'}</span><span id="sheet-sort-note">${hasComposite?'组合记录及拆分项不参与数值排序。':'点击列标题排序。'}</span></p>`;
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
  if(!entity){app.innerHTML=breadcrumb(['实体档案'])+empty('未找到该实体','请回到综合排名选择实体。');return;}
  const detailSheets=db.sheets.filter(s=>s.id!==db.indicators.find(i=>i.role==='reference')?.sheetId);
  app.innerHTML=breadcrumb(['综合排名','#/rankings'],[entity.name])+`<div class="entity-hero"><div><p class="eyebrow">ENTITY PROFILE</p><span class="pill ${entity.ranked?'teal':''}">${esc(entity.category|| (entity.ranked?'正式排名实体':'补充实体'))}</span><h1>${esc(entity.name)}</h1><p class="entity-en">${esc(entity.englishName||'')}</p><div class="button-group"><a class="button small" href="${routeURL('compare',{entities:entity.id})}">加入实体比较 ↗</a><a class="button text small" href="${routeURL('data',{sheet:db.sheets[0].id})}">查看原工作表 →</a></div></div><div class="entity-numbers"><div class="entity-number"><p class="stat-label">既定综合名次</p><p class="big">${entity.ranked?esc(format(entity.rank)):'—'}</p><p class="stat-sub">${entity.ranked?'保留工作簿原始名次':'补充实体，未赋综合名次'}</p></div><div class="entity-number"><p class="stat-label">公式参考值</p><p class="big reference">${referenceCell(entity)}</p><p class="stat-sub">非百分制 · 不据此重新排名</p></div></div></div><section><div class="section-heading"><div><h2>一级领域</h2><p class="section-note">名次与评分分别解读；各领域之间没有统一的数值尺度。</p></div></div><div class="domain-grid">${db.domains.map(d=>{const value=entity.domains?.[d.id];return `<a class="domain-card" href="${indicatorURL(byIndicator.get(d.metricId)||{id:d.metricId})}"><div class="domain-card-head"><span>${esc(d.name)}</span><small>${domainKind(d)}</small></div><p class="domain-value">${esc(format(value))}</p><small>${value==null?'原表未填写':!entity.ranked?'补充记录 · 标记含义未注明':d.kind==='rank'?'数值越小，名次越靠前':'保留原表评分'}</small>${d.explanation?.text?`<p class="domain-description">${esc(d.explanation.text)}</p><span class="domain-explanation-link">PDF 第${esc(d.explanation.pages?.join('、')||'—')}页 · 阅读完整解释 ↗</span>`:d.description?`<p class="domain-description">${esc(d.description)}</p>`:''}</a>`;}).join('')}</div></section><div class="notice">本页使用工作簿中的“${esc(entity.name)}”原名。领域汇总值与明细工作表中的得分、排名分别保留；缺失项显示“—”，不自动填补。</div><section class="section"><div class="section-heading"><div><h2>领域明细</h2><p class="section-note">展开领域查看全部已记录字段；点击数值查看原值，点击字段名称进入横向比较。</p></div></div>${detailSheets.map((sheet,index)=>{const fields=namedFields(sheet.id,true);const populated=fields.filter(f=>{const c=entity.metrics?.[f.id];return c?.value!=null||c?.error;});return `<details class="detail-section" ${index===0?'open':''}><summary><span>${esc(sheet.name)}<small>${populated.length} / ${fields.length} 项有记录</small></span></summary>${readerExplanation(sheet.explanation,{compact:true})}${fields.length?`<div class="detail-fields">${fields.map(f=>`<div class="detail-field"><div class="detail-field-name"><a href="${indicatorURL(f)}">${esc(f.name)} ${fields.filter(x=>x.name===f.name).length>1?`(${esc(f.column)})`:''} ↗</a></div><div class="detail-field-value">${compositeDefinitions(f).length?compositeValues(entity.metrics?.[f.id],f,cellId(entity.id,f.id)):inspectCell(entity.metrics?.[f.id],cellId(entity.id,f.id))}</div><p class="detail-field-meta">${f.type==='composite'?'两项独立数量 · 未单列不补零':f.unit?esc(f.unit):'单位未注明'}${f.year?' · '+esc(f.year):''}</p>${f.explanation?.text?`<details class="inline-explanation"><summary>含义与口径</summary>${readerExplanation(f.explanation,{compact:true})}</details>`:''}</div>`).join('')}</div>`:empty('暂无明细')}</details>`;}).join('')}</section>`;
}
function renderCompare(params) {
  const supplied=params.has('entities');
  const ids=[...new Set((params.get('entities')||'').split(',').filter(id=>byId.has(id)))].slice(0,5);
  if(!supplied)ids.push(...rankedEntities().slice(0,3).map(e=>e.id));
  let selected=ids.map(id=>byId.get(id));
  const detailIndicators=db.indicators.filter(i=>!['identity','classification','auxiliary'].includes(i.role));
  let chosenMetric=detailIndicators.some(i=>i.id===params.get('metric'))?params.get('metric'):detailIndicators.find(i=>i.role==='indicator')?.id;
  app.innerHTML=mainHeading('SIDE BY SIDE','实体比较','选择 2–5 个实体，逐领域查看原始数值。领域之间保持各自尺度，组合记录分别展示两项数量。')+`<div class="compare-selector"><div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索待添加实体</span><input class="input" id="compare-search" placeholder="搜索要添加的实体…"></label><select class="select" id="compare-select" aria-label="选择待比较实体"></select><button class="button primary" id="compare-add" type="button">添加实体 +</button></div><div class="chosen-entities" id="chosen-entities"></div><p class="section-note" id="compare-limit" aria-live="polite"></p></div><div class="notice">补充实体的领域数值按原值显示，其标记含义未注明，不纳入领域条形图。</div><div id="compare-content"></div>`;
  function syncHash(){history.replaceState(null,'',routeURL('compare',{entities:selected.map(e=>e.id).join(','),...(chosenMetric?{metric:chosenMetric}:{})}));}
  function options(){const q=$('#compare-search').value.trim().toLowerCase();const list=db.entities.filter(e=>!selected.some(s=>s.id===e.id)&&(!q||(e.name+' '+e.englishName).toLowerCase().includes(q)));$('#compare-select').innerHTML=list.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}${e.ranked?' · '+format(e.rank):' · 补充'}</option>`).join('');$('#compare-add').disabled=selected.length>=5||!list.length;}
  function chartCard(name,kind,rows,indicator=null,showExplanation=true){
    if(compositeDefinitions(indicator).length)return `<article class="comparison-card composite-comparison"><div class="comparison-card-heading"><h3>${esc(name)}</h3><small>两项独立数量</small></div>${rows.map(r=>`<div class="composite-compare-row"><a class="entity-name" href="${entityURL(r.entity)}">${esc(r.entity.name)}</a>${compositeValues(r.cell,indicator,cellId(r.entity.id,r.metricId))}</div>`).join('')}<p class="bar-note">点前、点后分别记录不同数量。“未单列”不代表零；点后仅按当前保存的位数展示。</p></article>`;
    const valid=rows.filter(r=>numeric(r.value)&&r.chartable!==false), max=Math.max(...valid.map(r=>Math.abs(r.value)),1);
    const chartable=(!indicator || indicator.chartable!==false) && valid.every(r=>r.value>=0);
    return `<article class="comparison-card"><div class="comparison-card-heading"><h3>${esc(name)}</h3><small>${kind==='rank'?'名次 ↓':kind==='score'?'评分 ↑':indicator?.unit?esc(indicator.unit):'原始值'}</small></div>${rows.map((r,i)=>`<div class="bar-row"><a class="bar-label" href="${entityURL(r.entity)}">${esc(r.entity.name)}</a>${chartable?`<div class="bar-track" aria-hidden="true">${numeric(r.value)&&r.chartable!==false?`<div class="bar-fill" style="width:${Math.max(0,Math.abs(r.value)/max*100)}%;--bar-color:${palette[i]}"></div>`:''}</div>`:'<span class="muted" style="font-size:10px">按原表呈现</span>'}<span class="bar-value">${r.cell?inspectCell(r.cell,cellId(r.entity.id,r.metricId)):esc(format(r.value))}</span></div>`).join('')}${showExplanation?readerExplanation(indicator?.explanation,{compact:true,title:false}):''}<p class="bar-note">${!chartable?'此字段不适合连续数值图表。点击数值可查看原值。':kind==='rank'?'条长表示原始名次；越短，名次越靠前。':kind==='score'?'条长表示原始评分；本卡片使用独立尺度，不表示统一满分。':'条长仅比较本字段的数值大小，不等同于优劣评价。'}</p></article>`;
  }
  function update(){
    $('#chosen-entities').innerHTML=selected.map((e,i)=>`<span class="entity-chip" style="--color:${palette[i]}"><i aria-hidden="true"></i><a href="${entityURL(e)}">${esc(e.name)}</a><button data-remove-entity="${esc(e.id)}" type="button" aria-label="移除${esc(e.name)}">×</button></span>`).join('');
    $('#compare-limit').textContent=`已选 ${selected.length} / 5 个实体${selected.length<2?' · 请再添加实体进行比较':''}`;
    options();syncHash();
    $$('[data-remove-entity]').forEach(b=>b.addEventListener('click',()=>{selected=selected.filter(e=>e.id!==b.dataset.removeEntity);update();}));
    if(selected.length<2){$('#compare-content').innerHTML=empty('选择至少两个实体','可以比较正式排名实体与补充实体；未记录的数据将保持空白。');return;}
    $('#compare-content').innerHTML=`${summaryNotice()}<div class="table-wrap"><table><thead><tr><th class="freeze header">综合结果</th>${selected.map(e=>`<th>${esc(e.name)}</th>`).join('')}</tr></thead><tbody><tr><td class="freeze">既定综合名次</td>${selected.map(e=>`<td>${e.ranked?esc(format(e.rank)):'—'}</td>`).join('')}</tr><tr><td class="freeze">公式参考值<span class="table-group">非百分制</span></td>${selected.map(e=>`<td class="reference-cell">${referenceCell(e)}</td>`).join('')}</tr></tbody></table></div><section class="section"><div class="section-heading"><h2>一级领域比较</h2></div><div class="comparison-grid">${db.domains.map(d=>chartCard(d.name,d.kind,selected.map(e=>({entity:e,value:e.domains?.[d.id],cell:e.metrics?.[d.metricId],metricId:d.metricId,chartable:e.ranked&&e.domainChartable?.[d.id]!==false})),byIndicator.get(d.metricId))).join('')}</div></section><section class="section"><div class="section-heading"><h2>具体字段比较</h2></div><label class="select-label">选择字段<select class="select" id="compare-metric" style="max-width:100%;width:440px">${db.sheets.map(s=>`<optgroup label="${esc(s.name)}">${detailIndicators.filter(i=>i.sheetId===s.id).map(i=>`<option value="${esc(i.id)}" ${i.id===chosenMetric?'selected':''}>${esc(i.name)}${detailIndicators.filter(x=>x.name===i.name&&x.sheetId===i.sheetId).length>1?'（'+esc(i.column)+' 列）':''}</option>`).join('')}</optgroup>`).join('')}</select></label><div id="compare-metric-content" style="margin-top:20px"></div></section>`;
    $('#compare-metric').addEventListener('change',e=>{chosenMetric=e.target.value;syncHash();updateMetric();});
    updateMetric();
  }
  function updateMetric(){const indicator=byIndicator.get(chosenMetric);if(!indicator)return;$('#compare-metric-content').innerHTML=`${metadata(indicator)}${readerExplanation(indicator.explanation)}${indicator.note?`<div class="notice">${esc(indicator.note)}</div>`:''}${chartCard(indicator.name,indicator.role==='rank'?'rank':indicator.role==='score'?'score':'value',selected.map(e=>({entity:e,value:e.metrics?.[indicator.id]?.value,cell:e.metrics?.[indicator.id],metricId:indicator.id,chartable:indicator.role!=='domain'||e.ranked})),indicator,false)}<a class="button text" href="${indicatorURL(indicator)}">查看所有实体的该字段 →</a>`;}
  $('#compare-search').addEventListener('input',options);
  $('#compare-add').addEventListener('click',()=>{const entity=byId.get($('#compare-select').value);if(entity&&selected.length<5&&!selected.includes(entity)){selected.push(entity);$('#compare-search').value='';update();}});
  update();
}
function renderIndicators(params) {
  const state={sheet:params.get('sheet')||'',q:params.get('q')||'',aux:false};
  const fields=db.indicators.filter(i=>i.role!=='identity'&&i.role!=='classification');
  app.innerHTML=mainHeading('INDICATOR EXPLORER','从指标看世界','选择一个字段，查看全部实体的记录、数值顺序及来源信息。保留重复表头与辅助列，避免把不同口径合并。')+`<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索指标字段</span><input class="input" id="indicator-search" placeholder="搜索指标、领域或工作表…" value="${esc(state.q)}"></label><label class="checkbox-label"><input type="checkbox" id="indicator-aux">包含未命名辅助字段</label><span class="toolbar-end" id="indicator-count" aria-live="polite"></span></div><div class="indicator-layout"><aside class="indicator-sidebar" aria-label="按工作表筛选"><button type="button" data-indicator-sheet="" class="${state.sheet?'':'active'}">全部工作表<span>${fields.filter(i=>i.role!=='auxiliary').length}</span></button>${db.sheets.map(s=>`<button type="button" data-indicator-sheet="${esc(s.id)}" class="${state.sheet===s.id?'active':''}">${esc(s.name)}<span>${fields.filter(i=>i.sheetId===s.id&&i.role!=='auxiliary').length}</span></button>`).join('')}</aside><div id="indicator-list"></div></div>`;
  function update(){const q=state.q.trim().toLowerCase();const list=fields.filter(i=>(!state.sheet||i.sheetId===state.sheet)&&(state.aux||i.role!=='auxiliary')&&(!q||(i.name+' '+i.sheetName+' '+(i.unit||'')).toLowerCase().includes(q)));$('#indicator-count').textContent=`${list.length} 个字段`;$('#indicator-list').innerHTML=list.length?`<div class="indicator-cards">${list.map(i=>{const count=indicatorCells(i).filter(r=>r.cell?.value!=null||r.cell?.error).length;return `<a class="indicator-card" href="${indicatorURL(i)}"><p class="eyebrow">${esc(i.sheetName)} · ${esc(i.column)} 列</p><h3>${esc(i.name)}${i.type==='composite'?' <span class="pill ochre">两项数量</span>':''}</h3>${i.explanation?.text?`<p class="indicator-excerpt">${esc(i.explanation.text)}</p>`:''}<div class="indicator-card-meta"><span>单位：${esc(textValue(i.unit))}</span><span>年份：${esc(textValue(i.year))}</span></div><div class="indicator-card-count"><span>${count} 个实体有记录${i.role==='auxiliary'?' · 辅助字段':''}</span><span aria-hidden="true">↗</span></div></a>`;}).join('')}</div>`:empty();$$('[data-indicator-sheet]').forEach(b=>b.classList.toggle('active',b.dataset.indicatorSheet===state.sheet));}
  $('#indicator-search').addEventListener('input',e=>{state.q=e.target.value;update();});$('#indicator-aux').addEventListener('change',e=>{state.aux=e.target.checked;update();});$$('[data-indicator-sheet]').forEach(b=>b.addEventListener('click',()=>{state.sheet=b.dataset.indicatorSheet;update();}));update();
}
function renderIndicator(id,params) {
  const indicator=byIndicator.get(id);if(!indicator){app.innerHTML=empty('未找到该指标');return;}
  const parts=compositeDefinitions(indicator);
  const canOrder=indicator.rankingAllowed!==false&&indicator.type!=='composite';
  const state={q:'',order:canOrder?(indicator.direction==='asc'?'asc':'desc'):'source',only:false};
  app.innerHTML=breadcrumb(['指标目录','#/indicators'],[indicator.sheetName,routeURL('indicators',{sheet:indicator.sheetId})],[indicator.name])+mainHeading('INDICATOR DETAIL',indicator.name,`保留工作表“${esc(indicator.sheetName)}”的原始字段。${parts.length?'点前、点后分别记录不同数量，下表按两列展示。':canOrder?'可按数值排序；序号仅表示当前列表位置，不新增研究排名。':'此字段按原表顺序呈现，不作数值排名或连续图表。'}`,`<a class="button" href="${routeURL('data',{sheet:indicator.sheetId})}">查看工作表 ↗</a>`)+readerExplanation(indicator.explanation)+metadata(indicator)+`${indicator.note?`<div class="notice ${indicator.type==='composite'?'ochre':''}">${esc(indicator.note)}</div>`:''}<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索实体</span><input class="input" id="indicator-entity-search" placeholder="搜索实体名称…"></label>${canOrder?`<select class="select" id="indicator-order" aria-label="数值排序"><option value="desc" ${state.order==='desc'?'selected':''}>数值从大到小</option><option value="asc" ${state.order==='asc'?'selected':''}>数值从小到大</option><option value="source">原表实体顺序</option></select>`:''}<label class="checkbox-label"><input type="checkbox" id="indicator-only">仅显示有记录项</label><span class="toolbar-end" id="indicator-entity-count" aria-live="polite"></span></div><div class="indicator-results ${parts.length?'composite-results':''}"><div><div class="table-wrap" tabindex="0" role="region" aria-label="指标实体数据"><table><thead><tr><th class="freeze header">实体</th>${parts.length?parts.map((part,index)=>`<th>${esc(part.label)}<span class="table-group">${index===0?'点前记录':'点后记录'}</span></th>`).join(''):'<th>原始数值</th>'}<th>记录状态</th></tr></thead><tbody id="indicator-entity-body"></tbody></table></div><div id="indicator-entity-empty"></div><p class="table-hint">${parts.length?'“未单列”不代表零。点击任一分项查看说明、组合写法和来源。':'“未记录”与零不同。点击数字查看完整原始值。'}</p></div><aside id="indicator-entity-chart"></aside></div>`;
  function update(){
    const q=state.q.trim().toLowerCase();
    let list=indicatorCells(indicator).filter(r=>(!q||(r.entity.name+' '+r.entity.englishName).toLowerCase().includes(q))&&(!state.only||r.cell?.value!=null||r.cell?.error));
    if(state.order!=='source')list.sort((a,b)=>sortValues(a.cell?.value,b.cell?.value,state.order));
    $('#indicator-entity-count').textContent=`${list.length} 个实体`;
    $('#indicator-entity-body').innerHTML=list.map(({entity,cell})=>`<tr><td class="freeze">${entityLink(entity)}</td>${parts.length?parts.map(part=>`<td>${inspectCell(cell,cellId(entity.id,indicator.id),'',part.id)}</td>`).join(''):`<td>${inspectCell(cell,cellId(entity.id,indicator.id))}</td>`}<td><span class="${cell?.error?'reference-cell':'muted'}">${cell?.error?'原表错误':cell?.value==null?'未记录':parts.length?cell?.composite?.status==='unparsed'?'组合记录待核对':compositePart(cell,'secondary')?.digits==null?'第二项未单列':'点后按保存位数':cell.formula?'公式缓存值':'已记录'}</span></td></tr>`).join('');
    $('#indicator-entity-empty').innerHTML=list.length?'':empty();
    const chart=list.filter(r=>numeric(r.cell?.value)&&(indicator.role!=='domain'||r.entity.ranked)).slice(0,12);
    const max=Math.max(...chart.map(r=>r.cell.value),1);
    const chartable=canOrder&&indicator.chartable!==false&&chart.length&&chart.every(r=>r.cell.value>=0);
    $('#indicator-entity-chart').innerHTML=chartable?`<div class="indicator-chart"><p class="eyebrow">CURRENT VIEW</p><h3>当前顺序前 ${chart.length} 项</h3><p class="section-note">条长表示本字段原始值</p>${chart.map(({entity,cell})=>`<div class="bar-row"><a class="bar-label" href="${entityURL(entity)}">${esc(entity.name)}</a><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${cell.value/max*100}%"></div></div><span class="bar-value">${esc(format(cell.value,2))}</span></div>`).join('')}<p class="bar-note">${indicator.direction==='asc'?'本字段数值越小的名次越靠前。':'数值大小不自动等同于优劣。'}来源和单位以本页标注为准。</p></div>`:`<div class="side-note"><h3>${parts.length?'两项数量，分别阅读':'保留数据本身的含义'}</h3><p>${parts.length?'点号分隔不同数量，并非小数点。两部分各按保存记录展示，不对整段组合码排序或画图。整数记录没有单独保存第二项，因此显示“未单列”。':'本字段未生成条形图。请直接查看表格中的原始记录。'}</p>${parts.length?'<p>点后位数可能受原工作簿的数值存储方式影响；目前的记录不能证明输入时是否另有尾零。</p>':''}<p>背景报告用于解释含义；来源、年份、单位缺失时，不自动补写为报告中的旧数值或旧口径。</p></div>`;
  }
  $('#indicator-entity-search').addEventListener('input',e=>{state.q=e.target.value;update();});
  $('#indicator-order')?.addEventListener('change',e=>{state.order=e.target.value;update();});
  $('#indicator-only').addEventListener('change',e=>{state.only=e.target.checked;update();});update();
}
function renderMethodology() {
  const m=db.methodology||{};
  const items=items=>`<ul>${(items||[]).map(item=>`<li>${esc(textValue(item))}</li>`).join('')}</ul>`;
  app.innerHTML=mainHeading('METHODS & PROVENANCE','来源与方法','这是一项独立的综合能力研究。这里说明工作簿如何被呈现、哪些数值可以比较，以及目前的资料限制。')+`<div class="prose-layout"><article class="prose"><h2>研究关注什么</h2><p>项目关注国家与其他实体的长期能力基础，综合观察人口与组织能力、经济规模、军事、基础设施及资源条件。页面沿用最新版工作簿的实体名称、分类、字段与结果。</p><p>“政治”领域包含人口质量、科研、工业以及外交金融等内容；“稳定”关注自我控制与组织承压等长期因素。这些字段是作者所采用的研究框架，不代表国际统一标准。</p>${readerNotesDirectory()}<h2>唯一数值来源：本版本 Excel</h2><p>网站中的所有数值均来自最新版工作簿。历史报告用于解释研究意图与字段含义；旧数字不覆盖工作簿。读取公式时保留 Excel 已保存的计算结果，并可在单元格溯源窗口查看公式和原始值。</p>${items(m.notes)}<h2>排名与评分结构</h2><p>综合排名、各领域结果和公式参考值分别展示。政治、经济、军事使用名次，其余领域使用评分；不把它们当作同一量纲。综合名次包括小数位置，并按原表保留，不根据公式参考值重新排名。</p>${m.formula?`<div class="formula">${esc(m.formula)}</div>`:''}${m.formulaVariants?.length?`<div class="notice">${m.formulaVariants.map(v=>`<p><strong>${esc(v.entity)}的原表公式变体</strong>（${esc(v.origin)}）</p><p><code>${esc(v.formula)}</code></p>`).join('')}</div>`:''}${m.weights?.length?`<div class="table-wrap" style="margin-top:18px"><table><thead><tr><th>领域</th><th>工作簿权重 / 参数</th></tr></thead><tbody>${m.weights.map(w=>`<tr><td>${esc(w.name)}</td><td>${esc(format(w.weight))}</td></tr>`).join('')}</tbody></table></div>`:''}<h2>字段、缺失与复合编码</h2><p>首页“具名明细字段”按各明细表的具名字段计数，排除身份、汇总名次或得分及未命名辅助字段。派生字段和重复名称均保留，因此该数量不等于相互独立的研究指标数量。</p><p>空白与零严格区分。工作簿中的错误值原样标注，不自动改成零。未命名列保留为辅助字段；同名列通过工作表和列标识区分。军事中部分带点号的记录把两项数量放在同一个单元格，网站分别展示点前和点后记录。点后未单列时不补成零，也不推测输入时可能存在的尾零。组合写法保留用于溯源，底层存储字符串放在高级溯源中；组合记录及拆分项不参与连续图表或数值排序。拆分只改变展示列，不增加原始研究字段数量。</p><h2>来源与观测年份</h2><p>来源、单位和年份只依据对应字段的明确证据。未注明的保持“未注明”；文件的修改日期不作为数据的观测年份。历史背景材料中的来源清单不能证明每个具体字段的出处。</p><div>${(m.sources||[]).map(s=>`<div class="source-item"><strong>${s.url&&/^https?:\/\//.test(s.url)?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`:esc(s.label)}</strong><p>${esc(s.note||'未提供逐字段对应关系。')}</p></div>`).join('')}</div><h2>已知限制</h2>${items(m.limitations)}<p>数据检查验证转换与呈现是否忠实，不代表对每项原始统计和研究判断都已独立验证。发现可疑数据时记录问题，保留原值。</p><details class="qa-details"><summary>查看本版本数据检查摘要 · ${esc(db.quality?.issues?.length||0)} 项记录</summary><p style="font-size:12px;margin-top:13px">检查 ${esc(db.quality?.summary?.formulasChecked??'—')} 个公式缓存，${esc(db.quality?.summary?.formulasMatched??'—')} 个通过一致性核对；${esc(db.quality?.summary?.excelErrors??'—')} 个 Excel 原生错误值已保留。数据检查共有 ${esc(db.quality?.summary?.errors??0)} 项阻断问题、${esc(db.quality?.summary?.warnings??0)} 项提示。</p>${(db.quality?.issues||[]).map(issue=>`<div class="qa-item"><span class="pill ${issue.severity==='error'?'ochre':''}">${esc(({error:'阻断问题',warning:'提示',info:'信息'})[issue.severity]||issue.severity)}</span> <code>${esc(issue.code)}</code><p>${esc(issue.message)}</p>${issue.locations?.length?`<small>位置：${esc(issue.locations.map(textValue).join(' · '))}</small>`:''}</div>`).join('')}</details></article><aside class="side-note"><h3>阅读数据之前</h3><p><strong>有名次，不等于有统一总分。</strong><br>公式参考值不是百分制，也不决定网站中的综合排名。</p><p><strong>有数值，不等于口径齐全。</strong><br>缺少观测年份或来源时，页面会明确保留这一限制。</p><p><strong>有比较，不等于价值判断。</strong><br>图表比较的是同一字段的数据，不自动把所有较大数值理解为优势。</p><p><a class="button text small" href="#/data">回到原始工作表 →</a></p></aside></div>`;
}
function renderDownloads() {
  const downloads=db.downloads||[];
  const firstCsv=downloads.find(d=>String(d.format).toLowerCase()==='csv');
  const primary=downloads.filter(d=>['xlsx','json','zip'].includes(String(d.format).toLowerCase())||d===firstCsv);
  const others=downloads.filter(d=>!primary.includes(d));
  const safeHref=href=>typeof href==='string' && /^(?:\.\/)?(?:downloads|data)\/[a-z0-9._/-]+$/i.test(href.trim()) && !href.trim().split('/').includes('..')?href.trim():'#/downloads';
  app.innerHTML=mainHeading('OPEN DATA','下载与复用','下载工作簿、标准化数据和分表 CSV。Excel 是本项目唯一权威数值来源；CSV 与 JSON 由同一版本自动生成。')+`<div class="download-grid">${primary.map(d=>`<article class="download-card"><div class="file-icon">${esc(d.format.toUpperCase())}</div><h3>${esc(d.label)}</h3><p>${esc(d.description||'')}</p><a class="button primary" href="${esc(safeHref(d.href))}" download>下载 ${esc(d.format.toUpperCase())} <span aria-hidden="true">↓</span></a></article>`).join('')}</div>${others.length?`<section class="section"><div class="section-heading"><div><h2>分表与补充文件</h2><p class="section-note">CSV 保留工作表中的原始信息；如需公式与样式，请下载 Excel。</p></div></div>${others.map(d=>`<div class="download-item"><div><h3>${esc(d.label)}</h3><p>${esc(d.description||'')}</p></div><a class="button small" href="${esc(safeHref(d.href))}" download>${esc(d.format.toUpperCase())} ↓</a></div>`).join('')}</section>`:''}<div class="notice" style="margin-top:30px"><p>研究版本：${esc(db.meta.researchVersion || db.meta.version)}${db.meta.dataVersion?' · 数据版本：'+esc(db.meta.dataVersion):''} · 工作簿保存日期：${esc(shortDate(db.meta.workbookModifiedAt))} · 网站构建日期：${esc(shortDate(db.meta.builtAt))}</p><p>下载的工作簿保留单元格、公式、已缓存结果和样式；公开副本仅清理文档作者、最后编辑者及打印机元数据。使用资料时，请注明项目名称及版本，并一并保留来源与口径限制。</p></div><p class="section-note" style="overflow-wrap:anywhere">源文件 SHA-256：${esc(db.meta.sourceSha256||'未注明')}</p><div class="button-group" style="margin-top:22px"><a class="button text" href="https://github.com/Lawrence35952563/National-Power" target="_blank" rel="noopener noreferrer">查看源码与更新记录 ↗</a><a class="button text" href="#/methodology">来源与方法 →</a></div>`;
}
function openCell(button) {
  let cell,indicator,entity;
  if(button.dataset.entity){entity=byId.get(button.dataset.entity);indicator=byIndicator.get(button.dataset.metric);cell=entity?.metrics?.[button.dataset.metric];}
  else{const sheet=bySheet.get(button.dataset.sheet),row=sheet?.rows.find(r=>String(r.row)===button.dataset.row);cell=row?.cells?.[button.dataset.columnRef];indicator=db.indicators.find(i=>i.sheetId===sheet?.id&&i.column===button.dataset.columnRef);entity=byId.get(row?.entityId);}
  const parts=compositeDefinitions(indicator),isComposite=parts.length>0||cell?.kind==='composite';
  const shown=isComposite?displayCellValue(cell):cell?.error || (cell?.raw ?? cell?.value);
  const meta=[['实体',entity?.name||'辅助 / 未映射行'],...(isComposite?[['组合写法',shown]]:[['显示完整值',cell?.error || (cell?.value==null?'—':String(cell.value))]]),['工作表',cell?.sheet||indicator?.sheetName||'未注明'],['单元格',cell?.address||'未记录'],['单位',textValue(indicator?.unit)],['观测年份',textValue(indicator?.year)],['数据来源',textValue(indicator?.source)],['是否估算',textValue(indicator?.estimate)]];
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
