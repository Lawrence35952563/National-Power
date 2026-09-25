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
const mainHeading = (eyebrow,title,description,action='') => `<div class="page-heading"><div><h1>${esc(title)}</h1>${description ? `<p class="lead">${description}</p>` : ''}</div>${action}</div>`;
const breadcrumb = (...items) => `<div class="breadcrumb"><a href="#/">首页</a>${items.map(([name,href])=>`<span aria-hidden="true">/</span>${href?`<a href="${href}">${esc(name)}</a>`:`<span>${esc(name)}</span>`}`).join('')}</div>`;
const metadata = indicator => `<div class="metadata-grid">${knownMetadata(indicator).map(([label,value])=>`<div class="metadata-item"><div class="metadata-label">${esc(label)}</div><div class="metadata-value">${esc(value)}</div></div>`).join('')}</div>`;
const summaryNotice = () => `<p class="reading-note">按原表名次排列，可按分类筛选。<a href="#/methodology">排名说明 →</a></p>`;
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


// URL state contains only selections; research records remain in the dataset.
function normalizeSelection(value,allowed,limit=Infinity) {
  const values=Array.isArray(value)?value:String(value??'').split(',');
  const valid=new Set(allowed);
  return [...new Set(values.filter(id=>valid.has(id)))].slice(0,limit);
}
function existingThemeGroups(sheetId) {
  return (guideFor(sheetId)?.facets||[]).map((facet,index)=>({...facet,key:String(index),fields:facet.fields.filter(id=>byIndicator.has(id))}));
}
function resolveColumns(value,fields,identityId) {
  const selected=value==null?fields.filter(f=>f.role!=='auxiliary').map(f=>f.id):String(value).split(',');
  return fields.filter(f=>f.id===identityId||selected.includes(f.id)||selected.includes(f.column)).map(f=>f.id);
}
function columnThemeIds(sheetId,key,fields,identityId) {
  if(key==='all')return fields.map(f=>f.id);
  if(key==='named')return resolveColumns(null,fields,identityId);
  const theme=existingThemeGroups(sheetId).find(t=>t.key===key);
  return resolveColumns(theme?theme.fields.join(','):null,fields,identityId);
}
function serializeViewState(path,values) {
  return routeURL(path,Object.fromEntries(Object.entries(values).filter(([,v])=>v!=null).map(([key,value])=>[key,Array.isArray(value)?value.join(','):String(value)])));
}
function parseRouteLocation(hash) {
  const raw=String(hash||'').replace(/^#\/?/,'');const at=raw.indexOf('?');
  return {path:at<0?raw:raw.slice(0,at),params:new URLSearchParams(at<0?'':raw.slice(at+1))};
}
function createViewHistory(limit=40) {
  const entries=new Map();
  return {save(id,snapshot){entries.delete(id);entries.set(id,snapshot);while(entries.size>limit)entries.delete(entries.keys().next().value);},read(id){return entries.get(id);},entries(){return [...entries];}};
}

function homeSearchURL(value) {
  const query=String(value??'').trim();
  return routeURL('rankings',query?{q:query,scope:'all'}:{});
}
function navigationKey(path) {
  return path.startsWith('entity/')?'rankings':path.startsWith('domain/')||path==='methodology'?'framework':['indicators','downloads','library'].includes(path)||path.startsWith('indicator/')?'data':path;
}
function navActive(path) {
  const key=navigationKey(path);
  $$('#navigation a').forEach(a=>a.getAttribute('href') === '#/'+key ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'));
  $('#navigation').classList.remove('open'); $('.menu-toggle').setAttribute('aria-expanded','false');
}

const viewHistory=createViewHistory();
try { for(const [id,snapshot] of JSON.parse(sessionStorage.getItem('np-view-history')||'[]'))viewHistory.save(id,snapshot); } catch {}
let activeEntryId=null,renderedURL='',restoringView=false,scrollSaveTimer;
if('scrollRestoration' in history)history.scrollRestoration='manual';
const newEntryId=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
const detailKey=(el,index)=>el.dataset.detailKey||el.id||'detail-'+index;
const regionKey=(el,index)=>el.id||el.querySelector('table')?.id||'region-'+index;
function saveViewState() {
  if(!activeEntryId||restoringView)return;
  viewHistory.save(activeEntryId,{url:renderedURL,x:window.scrollX,y:window.scrollY,
    details:$$('#main details').map((el,i)=>el.open?detailKey(el,i):null).filter(Boolean),
    regions:$$('#main .table-wrap').map((el,i)=>({key:regionKey(el,i),x:el.scrollLeft,y:el.scrollTop})),
    focus:document.activeElement?.id||null,focusLink:document.activeElement?.closest('a[href]')?.getAttribute('href')||null});
  try{sessionStorage.setItem('np-view-history',JSON.stringify(viewHistory.entries()));}catch{}
}
function updateRouteState(values) {
  const href=serializeViewState(currentRoute,values);
  history.replaceState({...history.state,npEntry:activeEntryId},'',href);
  renderedURL=location.href;
}
function getCompareSelection() {
  try{return normalizeSelection(JSON.parse(sessionStorage.getItem('np-compare-selection')||'[]'),db.entities.map(e=>e.id),5);}catch{return [];}
}
function setCompareSelection(ids) {
  try{sessionStorage.setItem('np-compare-selection',JSON.stringify(normalizeSelection(ids,db.entities.map(e=>e.id),5)));}catch{}
}
function navigateTo(href) {
  saveViewState();
  history.pushState({npEntry:newEntryId(),npFrom:activeEntryId},'',href);
  route();
}
function restoreView(snapshot,params) {
  restoringView=true;
  if(snapshot){
    const opened=new Set(snapshot.details||[]);
    $$('#main details').forEach((el,i)=>{el.open=opened.has(detailKey(el,i));});
  }
  const entry=activeEntryId;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(entry!==activeEntryId)return;
    if(snapshot){
      $$('#main .table-wrap').forEach((el,i)=>{const pos=snapshot.regions?.find(v=>v.key===regionKey(el,i));if(pos){el.scrollLeft=pos.x;el.scrollTop=pos.y;}});
      if(snapshot.focus)document.getElementById(snapshot.focus)?.focus({preventScroll:true});
      else if(snapshot.focusLink)$$('#main a[href]').find(a=>a.getAttribute('href')===snapshot.focusLink&&a.getClientRects().length)?.focus({preventScroll:true});
      window.scrollTo({left:snapshot.x||0,top:snapshot.y||0,behavior:'instant'});
    }else{
      const target=currentRoute.startsWith('entity/')&&params.get('domain')?document.getElementById('entity-domain-'+params.get('domain')):null;
      if(target)target.scrollIntoView({block:'start',behavior:'instant'});
      else{window.scrollTo({top:0,behavior:'instant'});const title=$('#main h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
    }
    restoringView=false;
  }));
}
function route() {
  saveViewState();
  const {path,params}=parseRouteLocation(location.hash);
  let entry=history.state?.npEntry;
  if(!entry||(entry===activeEntryId&&renderedURL!==location.href)){
    entry=newEntryId();history.replaceState({npEntry:entry,npFrom:activeEntryId},'',location.href);
  }
  activeEntryId=entry;renderedURL=location.href;
  const snapshot=viewHistory.read(entry);
  navActive(path);currentRoute=path;
  try {
    if (!path) renderHome(params);
    else if(path==='framework') renderFramework();
    else if(path.startsWith('domain/')) renderDomain(decodeURIComponent(path.slice(7)));
    else if(path==='library') renderLibrary();
    else if(path==='rankings') renderRankings(params);
    else if(path==='data') renderData(params);
    else if(path.startsWith('entity/')) renderEntity(decodeURIComponent(path.slice(7)),params);
    else if(path==='compare') renderCompare(params);
    else if(path==='indicators') renderIndicators(params);
    else if(path.startsWith('indicator/')) renderIndicator(decodeURIComponent(path.slice(10)),params);
    else if(path==='methodology') renderMethodology();
    else if(path==='downloads') renderDownloads();
    else app.innerHTML=breadcrumb(['页面未找到'])+empty('这个页面不存在','请通过上方导航继续浏览。');
  }catch(error){console.error('Page render failed',error);app.innerHTML=`<div class="error-panel"><h1>这个页面暂时无法显示</h1><code>${esc(error.message)}</code><p><a class="button" href="#/">返回首页</a></p></div>`;}
  if(history.state?.npFrom&&viewHistory.read(history.state.npFrom))app.insertAdjacentHTML('afterbegin','<div class="return-bar"><button type="button" class="button small" data-history-back>← 返回上一页</button><small>保留筛选和浏览位置</small></div>');
  if($('#main h1'))document.title=$('#main h1').textContent+(path?' · 国家长期能力综合排名':'');
  restoreView(snapshot,params);
}
function locationChanged(){if(db&&(renderedURL!==location.href||activeEntryId!==history.state?.npEntry)){if($('#cell-dialog').open)$('#cell-dialog').close();route();}}
window.addEventListener('popstate',locationChanged);
window.addEventListener('hashchange',locationChanged);
window.addEventListener('pagehide',saveViewState);
document.addEventListener('scroll',()=>{clearTimeout(scrollSaveTimer);scrollSaveTimer=setTimeout(saveViewState,120);},true);
document.addEventListener('toggle',event=>{if(event.target.tagName==='DETAILS')requestAnimationFrame(saveViewState);},true);
document.addEventListener('click',event=>{
  if(event.target.closest('[data-history-back]')){event.preventDefault();history.back();return;}
  const link=event.target.closest('a[href^="#/"]');
  if(link&&!event.defaultPrevented&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigateTo(link.getAttribute('href'));}
});
function renderHome(params=new URLSearchParams()) {
  const counts=db.meta.counts,preview=rankedEntities().slice(0,8);
  const rankedDomains=db.domains.filter(domain=>domain.kind==='rank').length;
  const scoredDomains=db.domains.filter(domain=>domain.kind==='score').length;
  app.innerHTML=`<section class="home-intro"><p class="home-version">研究版本 ${esc(db.meta.researchVersion||db.meta.version)} · 数据文件保存日期 ${esc(shortDate(db.meta.workbookModifiedAt))}</p><h1>${esc(db.meta.title||'国家长期能力综合排名')}</h1><p class="lead">从政治、经济、军事和五项基础条件，看各国如何组织资源、维持生产和长期行动。</p><form class="home-search" id="home-search-form" role="search"><label for="home-country-search">查找国家或实体</label><div><input class="input" id="home-country-search" name="q" type="search" value="${esc(params.get('q')||'')}" placeholder="输入中文或英文名称" autocomplete="off"><button class="button primary" type="submit">查找</button></div></form><div class="home-quick-links button-group"><a class="button primary" href="#/rankings">综合排名 →</a><a class="button" href="#/compare">实体比较</a><a class="button" href="#/data">完整数据</a></div></section>
  <div class="home-stats"><div class="stat"><p class="stat-label">正式排名实体</p><p class="stat-value">${esc(counts.rankedEntities)}</p><p class="stat-sub">${counts.supplementaryEntities?'另有 '+esc(counts.supplementaryEntities)+' 个补充实体':'全部实体均有既定名次'}</p></div><div class="stat"><p class="stat-label">研究领域</p><p class="stat-value">${esc(counts.domains)}</p><p class="stat-sub">${rankedDomains} 项领域名次 · ${scoredDomains} 项基础评分</p></div><div class="stat"><p class="stat-label">领域数据字段</p><p class="stat-value">${esc(counts.fields)}</p><p class="stat-sub">点击数值可查看原表记录</p></div></div>
  <div class="home-overview"><section><div class="section-heading"><h2>综合排名</h2><a class="button text" href="#/rankings">查看全部 →</a></div><div class="table-wrap" tabindex="0" role="region" aria-label="综合排名预览"><table><thead><tr><th>国家 / 实体</th><th>综合名次</th><th>原表分类</th></tr></thead><tbody>${preview.map(entity=>`<tr><td>${entityLink(entity)}</td><td class="rank-cell">${esc(format(entity.rank))}</td><td>${esc(entity.category||'—')}</td></tr>`).join('')}</tbody></table></div></section><section><div class="section-heading"><h2>八个领域</h2><a class="button text" href="#/framework">研究说明 →</a></div><div class="home-domain-links">${db.domains.map(domain=>`<a href="${domainURL(domain.id)}"><span><strong>${esc(domain.name)}</strong><small>${domain.kind==='rank'?'领域名次':'基础评分'}</small></span><p>${esc(guideFor(domain.id)?.question||domain.description||'')}</p></a>`).join('')}</div></section></div>
  <p class="home-reading-note">先看排名，点开国家看各领域，再选择几个实体进行比较。<a href="#/methodology">来源与方法 →</a> <a href="#/downloads">下载数据 →</a></p>`;
  $('#home-country-search').addEventListener('input',event=>updateRouteState({q:event.target.value||undefined}));
  $('#home-search-form').addEventListener('submit',event=>{event.preventDefault();navigateTo(homeSearchURL($('#home-country-search').value));});
}
function renderFramework() {
  app.innerHTML=breadcrumb(['八个领域'])+mainHeading('','研究说明','三项排名、五项评分，点击领域查看说明和结果。')+`<div class="button-group"><a class="button" href="#/methodology">来源与方法</a><a class="button" href="#/indicators">字段目录</a><a class="button" href="#/downloads">下载文件</a></div>`;
  app.innerHTML+=READING_GUIDE.groups.map(group=>`<section class="framework-group"><div class="section-heading"><div><h2>${esc(group.title)}</h2><p class="section-note">${esc(group.intro)}</p></div></div><div class="guide-grid">${group.domains.map(id=>{const d=db.domains.find(d=>d.id===id),g=guideFor(id);return `<a class="guide-card" href="${domainURL(id)}"><h3>${esc(d.name)}</h3><p>${esc(g.question)}</p><span>查看说明与结果 →</span></a>`;}).join('')}</div></section>`).join('');
  app.innerHTML+=`<div class="button-group section"><a class="button primary" href="#/rankings">综合排名 →</a><a class="button" href="#/methodology">来源与方法</a></div>`;
}
function renderDomain(id) {
  const domain=db.domains.find(d=>d.id===id),g=guideFor(id);
  if(!domain||!g){app.innerHTML=empty('未找到该领域');return;}
  const metric=byIndicator.get(domain.metricId);
  app.innerHTML=breadcrumb(['八个领域','#/framework'],[domain.name])+mainHeading('',domain.name,esc(g.intro))+`<div class="domain-story"><article>${g.facets.map(f=>`<section class="facet"><h2>${esc(f.title)}</h2><p>${esc(f.text)}</p><div class="field-links">${f.fields.map(id=>byIndicator.get(id)).filter(Boolean).map(i=>`<a href="${indicatorURL(i)}">${esc(i.name)} →</a>`).join('')}</div></section>`).join('')}<section class="facet"><h2>与其他领域的联系</h2><p>${esc(g.connections)}</p><a class="button text" href="#/framework">全部领域说明 →</a></section><details class="research-note"><summary>背景报告解释与页码</summary>${readerExplanation(domain.explanation,{title:false})}</details></article><aside class="side-note"><h3>结果口径</h3><p>${domain.kind==='rank'?'名次越小，排名越靠前。':'主要采用 1–5 级评分，各级含义见下方。小数评分按原表显示。'}</p>${domain.kind==='score'?`<ol class="score-key">${scoreLabels.map(label=>`<li>${label}</li>`).join('')}</ol>`:''}<a class="button text" href="${indicatorURL(metric)}">本领域全部结果 →</a><a class="button text" href="${routeURL('data',{sheet:id})}">本领域数据表 →</a></aside></div><div class="button-group section"><a class="button primary" href="${routeURL('compare',{metric:domain.metricId})}">比较本领域</a><a class="button" href="${routeURL('data',{sheet:id})}">完整数据表</a></div>`;
}
function renderLibrary() {
  app.innerHTML=breadcrumb(['数据与方法'])+mainHeading('','数据与方法','查阅字段定义、原始记录、研究方法与下载文件。')+`<div class="library-grid">${[
    ['methodology','来源与方法','排名、评分、公式和数据来源。','研究说明'],
    ['indicators','字段目录','按工作表或名称查找字段定义与全部实体记录。','指标与解释'],
    ['data','完整数据','按工作表浏览、筛选和排序，查看原值与已有公式。','工作簿'],
    ['downloads','下载文件','Excel 工作簿、分表 CSV 与单文件离线版。','数据下载']
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
  const sorts=['name','rank','category','reference',...db.domains.map(d=>d.id)];
  const state={search:params.get('q')||'',category:params.get('category')||'',scope:['all','supplementary'].includes(params.get('scope'))?params.get('scope'):'ranked',sort:sorts.includes(params.get('sort'))?params.get('sort'):'rank',direction:params.get('dir')==='desc'?'desc':'asc',view:params.get('view')==='domains'?'domains':'simple',reference:params.get('ref')==='1'};
  if(db.domains.some(d=>d.id===state.sort))state.view='domains';
  if(state.sort==='reference')state.reference=true;
  let basket=params.has('compare')?normalizeSelection(params.get('compare'),db.entities.map(e=>e.id),5):getCompareSelection();
  const categories=[...new Set(db.entities.map(e=>e.category).filter(Boolean))];
  app.innerHTML=mainHeading('','综合排名','搜索实体、查看领域结果，或选择多个实体比较。')+summaryNotice()+`<div class="ranking-controls"><div class="view-switch" role="group" aria-label="排名显示方式"><button class="button" type="button" data-rank-view="simple">简单榜单</button><button class="button" type="button" data-rank-view="domains">领域总览</button></div><label class="checkbox-label"><input type="checkbox" id="ranking-reference" ${state.reference?'checked':''}>显示公式参考值</label><a class="button primary" id="ranking-compare-link" href="#/compare">比较已选实体</a></div><div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索实体</span><input class="input" id="ranking-search" placeholder="搜索中文或英文实体名称…" value="${esc(state.search)}"></label><select class="select" id="ranking-category" aria-label="实体分类"><option value="">全部分类</option>${categories.map(c=>`<option ${state.category===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select><select class="select" id="ranking-scope" aria-label="排名范围"><option value="ranked" ${state.scope==='ranked'?'selected':''}>正式排名实体</option><option value="all" ${state.scope==='all'?'selected':''}>全部实体</option><option value="supplementary" ${state.scope==='supplementary'?'selected':''}>补充实体</option></select><span class="toolbar-end" id="ranking-count" aria-live="polite"></span></div><p class="section-note" id="ranking-reading-note"></p><p class="horizontal-hint">表格可左右滚动；实体列保持固定。列标题可排序。</p><div class="table-wrap" tabindex="0" role="region" aria-label="综合排名数据表"><table id="ranking-table"></table></div><p id="ranking-scope-note" class="section-note"></p><div id="ranking-empty"></div><p class="table-hint"><span>点击名称打开实体详情，点击数字查看原值与来源。</span><a href="#/data">完整数据 →</a></p>`;
  const heading=(key,label,sub='',attrs='')=>`<th ${attrs} data-rank-key="${key}"><button type="button" data-ranking-sort="${key}">${esc(label)} <span class="sort-arrow">↕</span></button>${sub?`<span class="table-group">${esc(sub)}</span>`:''}</th>`;
  function sync(){updateRouteState({q:state.search||undefined,category:state.category||undefined,scope:state.scope==='ranked'?undefined:state.scope,sort:state.sort==='rank'?undefined:state.sort,dir:state.direction==='asc'?undefined:state.direction,view:state.view==='simple'?undefined:state.view,ref:state.reference?'1':undefined,compare:basket.length?basket:undefined});setCompareSelection(basket);}
  function update(){
    const search=state.search.trim().toLowerCase();
    const list=db.entities.filter(e=>(state.scope==='all'||state.scope==='ranked'&&e.ranked||state.scope==='supplementary'&&!e.ranked)&&(!state.category||e.category===state.category)&&(!search||(e.name+' '+e.englishName).toLowerCase().includes(search)));
    const value=e=>state.sort==='reference'?e.referenceValue:db.domains.some(d=>d.id===state.sort)?e.domains?.[state.sort]:e[state.sort];
    list.sort((a,b)=>sortValues(value(a),value(b),state.direction));
    const expanded=state.view==='domains',span=expanded?'rowspan="2"':'';
    $('#ranking-table').className=expanded?'grouped-table':'';
    $('#ranking-table').innerHTML=`<thead><tr class="${expanded?'group-header':''}">${heading('name','实体','',`${span} class="freeze header"`)}${heading('rank','综合名次','',span)}${heading('category','分类','',span)}${expanded?'<th colspan="3" scope="colgroup">三项领域名次 · 数值越小越靠前</th><th colspan="5" scope="colgroup">五项基础评分 · 各自尺度</th>':''}${state.reference?heading('reference','公式参考值','非百分制',span):''}<th ${span}>参与比较</th></tr>${expanded?`<tr class="column-head">${db.domains.map(d=>heading(d.id,d.name,domainKind(d))).join('')}</tr>`:''}</thead><tbody id="ranking-body">${list.map(e=>`<tr><td class="freeze">${entityLink(e)}</td><td class="rank-cell">${e.ranked?esc(format(e.rank)):'<span class="empty-value">未排名</span>'}</td><td>${esc(e.category||'—')}</td>${expanded?db.domains.map(d=>`<td>${inspectCell(e.metrics?.[d.metricId]||{value:e.domains?.[d.id]},cellId(e.id,d.metricId))}</td>`).join(''):''}${state.reference?`<td class="reference-cell">${referenceCell(e)}</td>`:''}<td><button type="button" class="button small" data-rank-compare="${esc(e.id)}" aria-label="${basket.includes(e.id)?'移除比较':'加入比较'}：${esc(e.name)}" aria-pressed="${basket.includes(e.id)}" ${!basket.includes(e.id)&&basket.length>=5?'disabled':''}>${basket.includes(e.id)?'已选 · 移除':'加入比较'}</button></td></tr>`).join('')}</tbody>`;
    $('#ranking-count').textContent=`${list.length} 个实体`;
    $('#ranking-scope-note').textContent=state.scope==='ranked'?'':'补充实体没有综合名次，其领域标记不解释为正式名次或基础评分。';
    $('#ranking-empty').innerHTML=list.length?'':empty();
    $('#ranking-reading-note').textContent=expanded?'政治、经济、军事看名次，其余五个领域看评分。':'切换“领域总览”可显示八个领域。';
    const link=$('#ranking-compare-link');link.textContent=`比较已选（${basket.length} / 5） →`;link.href=routeURL('compare',{entities:basket.join(',')});
    $$('[data-rank-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rankView===state.view)));
    $$('[data-rank-key]').forEach(th=>{const active=th.dataset.rankKey===state.sort;th.setAttribute('aria-sort',active?state.direction==='asc'?'ascending':'descending':'none');$('.sort-arrow',th).textContent=active?state.direction==='asc'?'↑':'↓':'↕';});
    $$('[data-ranking-sort]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.rankingSort;state.direction=state.sort===key&&state.direction==='asc'?'desc':'asc';state.sort=key;update();$(`[data-ranking-sort="${key}"]`)?.focus({preventScroll:true});}));
    $$('[data-rank-compare]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.rankCompare;if(basket.includes(id))basket=basket.filter(x=>x!==id);else if(basket.length<5)basket.push(id);update();$(`[data-rank-compare="${id}"]`)?.focus({preventScroll:true});}));
    sync();
  }
  $('#ranking-search').addEventListener('input',e=>{state.search=e.target.value;update();});
  $('#ranking-category').addEventListener('change',e=>{state.category=e.target.value;update();});
  $('#ranking-scope').addEventListener('change',e=>{state.scope=e.target.value;update();});
  $('#ranking-reference').addEventListener('change',e=>{state.reference=e.target.checked;if(!state.reference&&state.sort==='reference')state.sort='rank';update();});
  $$('[data-rank-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.rankView;if(state.view==='simple'&&db.domains.some(d=>d.id===state.sort))state.sort='rank';update();}));
  update();
}

function renderData(params) {
  const sheet=bySheet.get(params.get('sheet')) || db.sheets[0];
  const fields=sheet.columns.map(c=>byIndicator.get(c.indicatorId || c.id) || {...c,sheetId:sheet.id,sheetName:sheet.name});
  const identity=fields.find(f=>f.role==='identity' && (f.name==='国家'||f.name==='实体'||f.type!=='englishName')) || fields.find(f=>f.role==='identity') || fields[0];
  const initialSelected=fields.filter(f=>f.role!=='auxiliary').map(f=>f.id);
  const themes=existingThemeGroups(sheet.id);
  const theme=params.has('cols')?'custom':['all','named','custom',...themes.map(t=>t.key)].includes(params.get('theme'))?params.get('theme'):'named';
  const validSort=fields.find(f=>f.column===params.get('sort')&&f.type!=='composite');
  const state={search:params.get('q')||'',sort:validSort?.column||null,direction:params.get('dir')==='desc'?'desc':'asc',showRaw:params.get('raw')==='1',theme,columnQuery:params.get('columnsq')||'',compact:params.get('compact')!=='0',selected:new Set(params.has('cols')?resolveColumns(params.get('cols'),fields,identity.id):columnThemeIds(sheet.id,theme,fields,identity.id))};
  state.selected.add(identity.id);
  const primary=fields.filter(f=>f.role!=='auxiliary'&&f.id!==identity.id),aux=fields.filter(f=>f.role==='auxiliary'&&f.id!==identity.id);
  const hasComposite=fields.some(f=>compositeDefinitions(f).length);
  const explained=fields.filter(f=>f.explanation?.text);
  const fieldOption=f=>`<label class="checkbox-label" data-field-option="${esc(f.id)}"><input type="checkbox" data-column="${esc(f.id)}" ${state.selected.has(f.id)?'checked':''}><span>${esc(f.name)}${compositeDefinitions(f).length?` <small>（${compositeDefinitions(f).length} 个分项）</small>`:fields.filter(x=>x.name===f.name).length>1?` <small>(${esc(f.column)})</small>`:''}</span></label>`;
  app.innerHTML=mainHeading('','完整数据','按工作表浏览，选择主题或列，点击数值查看原值与公式。',`<a class="button" href="#/downloads">下载 Excel</a>`)+`<div class="sheet-tabs" aria-label="选择工作表">${db.sheets.map(s=>`<a class="${sheet.id===s.id?'active':''}" ${sheet.id===s.id?'aria-current="page"':''} href="${routeURL('data',{sheet:s.id})}">${esc(s.name)}</a>`).join('')}</div><p class="sheet-meta">${esc(sheet.name)} · ${esc(sheet.role==='summary'?'综合结果表':'数据与计算表')} · ${fields.length} 个原工作簿字段（含身份及辅助字段）。匿名计算行可一并查看；“—”表示空白，不代表零。</p>${sheet.explanation?`<details class="research-note"><summary>工作表说明</summary>${readerExplanation(sheet.explanation,{compact:true})}</details>`:''}${hasComposite?`<div class="notice">含点号的组合字段已分列展示点前、点后记录。“点后记录”仅按当前保存的位数展示；整数记录的第二项显示“未单列”，不补成零。${explained.length?'各项含义见下方口径说明。':''}</div>`:''}${explained.length?`<details class="field-explanations"><summary>指标含义与口径 · ${explained.length} 项说明</summary><div class="explanation-list">${explained.map(f=>readerExplanation(f.explanation,{compact:true})).join('')}</div></details>`:''}<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索工作表</span><input class="input" id="sheet-search" placeholder="搜索实体名称或单元格内容…" value="${esc(state.search)}"></label><label class="checkbox-label"><input id="sheet-raw-rows" type="checkbox" ${state.showRaw?'checked':''}>包含辅助行</label><span class="toolbar-end" id="sheet-count" aria-live="polite"></span></div><div class="theme-controls"><label class="select-label">按主题显示列<select class="select" id="sheet-theme"><option value="named">具名字段</option><option value="all">完整原表（全部字段）</option>${themes.map(t=>`<option value="${t.key}">${esc(t.title)}</option>`).join('')}<option value="custom">自定义列</option></select></label><label class="checkbox-label"><input type="checkbox" id="sheet-compact" ${state.compact?'checked':''}>紧凑行距</label><span class="section-note">可在下方继续增减显示列。</span></div><details class="column-picker" id="sheet-column-picker"><summary>选择显示字段 <span id="column-count"></span></summary><div class="column-picker-body"><label class="search-wrap column-search"><span class="sr-only">搜索显示字段</span><input class="input" id="column-search" placeholder="搜索列名或列字母…" value="${esc(state.columnQuery)}"></label><p id="column-search-count" class="section-note" aria-live="polite"></p><div class="column-actions"><button class="button small" id="columns-main" type="button">仅具名字段</button><button class="button small" id="columns-all" type="button">恢复完整原表</button><button class="button small" id="columns-clear" type="button">仅保留实体</button></div><div class="column-group-label">具名字段${hasComposite?'（组合字段按组选择）':''} <button class="group-toggle" data-column-group="primary" type="button">全选 / 取消</button></div><div class="column-grid">${primary.map(fieldOption).join('')}</div>${aux.length?`<details style="margin-top:15px"><summary style="padding:0;font-size:11px;color:var(--muted)">未命名辅助字段 · ${aux.length} 列（原样保留）</summary><div class="column-group-label"><button class="group-toggle" data-column-group="aux" type="button">全选 / 取消</button></div><div class="column-grid">${aux.map(fieldOption).join('')}</div></details>`:''}</div></details><p class="horizontal-hint">表格可横向滚动，实体列与表头固定。列标题可排序。</p><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(sheet.name)}完整数据表"><table id="sheet-table" class="${state.compact?'compact-table':''}"></table></div><div id="sheet-empty"></div><p class="table-hint"><span>${hasComposite?'拆分数量按保存记录的位数显示；点击分项可查看组合写法和来源。':'表格默认精简小数显示；点击单元格可查看完整精度与来源。'}</span><span id="sheet-sort-note">${hasComposite?'组合记录及拆分项不参与数值排序。':'点击列标题排序。'}</span></p>`;
  function sync(){updateRouteState({sheet:sheet.id,q:state.search||undefined,sort:state.sort||undefined,dir:state.direction==='desc'?'desc':undefined,raw:state.showRaw?'1':undefined,theme:state.theme==='named'?undefined:state.theme,cols:state.theme==='custom'?fields.filter(f=>state.selected.has(f.id)&&f.id!==identity.id).map(f=>f.column).join(','):undefined,columnsq:state.columnQuery||undefined,compact:state.compact?undefined:'0'});}
  function filterColumns(){const q=state.columnQuery.trim().toLowerCase();let count=0;$$('[data-field-option]').forEach(label=>{const f=fields.find(f=>f.id===label.dataset.fieldOption);label.hidden=!!q&&!`${f.name} ${f.column}`.toLowerCase().includes(q);if(!label.hidden)count++;});$('#column-search-count').textContent=`${count} 个可选字段匹配 · 搜索不改变已选列`;sync();}
  function update() {
    $('#sheet-theme').value=state.theme;
    $('#sheet-table').classList.toggle('compact-table',state.compact);
    $('#sheet-raw-rows').checked=state.showRaw;
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
    $$('[data-sheet-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sheetSort;state.direction=state.sort===key&&state.direction==='asc'?'desc':'asc';state.sort=key;update();$('[data-sheet-sort="'+key+'"]')?.focus({preventScroll:true});}));
    $$('[data-column]').forEach(input=>{input.checked=state.selected.has(input.dataset.column);});
    sync();
  }
  $('#sheet-search').addEventListener('input',e=>{state.search=e.target.value;update();});
  $('#sheet-raw-rows').addEventListener('change',e=>{state.showRaw=e.target.checked;update();});
  $$('[data-column]').forEach(input=>input.addEventListener('change',()=>{input.checked?state.selected.add(input.dataset.column):state.selected.delete(input.dataset.column);state.theme='custom';update();}));
  $('#columns-main').addEventListener('click',()=>{state.selected=new Set(initialSelected);state.selected.add(identity.id);state.theme='named';update();});
  $('#columns-all').addEventListener('click',()=>{state.selected=new Set(fields.map(f=>f.id));state.theme='all';state.showRaw=true;update();});
  $('#columns-clear').addEventListener('click',()=>{state.selected=new Set([identity.id]);state.theme='custom';update();});
  $$('[data-column-group]').forEach(button=>button.addEventListener('click',()=>{const group=button.dataset.columnGroup==='aux'?aux:primary;const all=group.every(f=>state.selected.has(f.id));group.forEach(f=>all?state.selected.delete(f.id):state.selected.add(f.id));state.theme='custom';update();}));
  $('#sheet-theme').addEventListener('change',e=>{state.theme=e.target.value;if(state.theme!=='custom')state.selected=new Set(columnThemeIds(sheet.id,state.theme,fields,identity.id));if(state.theme==='all')state.showRaw=true;update();});
  $('#sheet-compact').addEventListener('change',e=>{state.compact=e.target.checked;update();});
  $('#column-search').addEventListener('input',e=>{state.columnQuery=e.target.value;filterColumns();});
  if(state.columnQuery)$('#sheet-column-picker').open=true;
  update();filterColumns();
}
function renderEntity(id,params=new URLSearchParams()) {
  const entity=byId.get(id);
  if(!entity){app.innerHTML=breadcrumb(['实体档案'])+empty('未找到该实体');return;}
  const orderedIds=[...new Set([...READING_GUIDE.groups.flatMap(group=>group.domains),...db.domains.map(domain=>domain.id)])];
  const domains=orderedIds.map(domainId=>db.domains.find(domain=>domain.id===domainId)).filter(Boolean);
  const initialDomain=domains.some(domain=>domain.id===params.get('domain'))?params.get('domain'):'';
  let activeDomain=initialDomain;

  // Each existing detail field is rendered once. Facets retain their original
  // order; duplicate references belong to their first listed facet. Auxiliary
  // and unrecorded fields remain together, regardless of facet membership.
  const domainRecords=new Map(domains.map(domain=>{
    const fields=namedFields(domain.id,true);
    const populated=fields.filter(field=>field.role!=='auxiliary'&&(entity.metrics?.[field.id]?.value!=null||entity.metrics?.[field.id]?.error));
    const populatedById=new Map(populated.map(field=>[field.id,field]));
    const claimed=new Set();
    const themes=existingThemeGroups(domain.id).map(theme=>({...theme,records:theme.fields.flatMap(fieldId=>{
      const field=populatedById.get(fieldId);
      if(!field||claimed.has(fieldId))return [];
      claimed.add(fieldId);
      return [field];
    })}));
    const remaining=populated.filter(field=>!claimed.has(field.id));
    const other=fields.filter(field=>!populatedById.has(field.id));
    const nameCounts=new Map();
    fields.forEach(field=>nameCounts.set(field.name,(nameCounts.get(field.name)||0)+1));
    return [domain.id,{fields,populated,themes,remaining,other,nameCounts}];
  }));

  const fieldsHTML=fields=>`<div class="entity-record-list">${fields.map(field=>{
    const cell=entity.metrics?.[field.id];
    const duplicate=domainRecords.get(field.sheetId)?.nameCounts.get(field.name)>1;
    return `<div class="entity-record-row ${compositeDefinitions(field).length?'entity-record-composite':''}" data-entity-field="${esc(field.id)}">
      <div class="entity-record-label"><a href="${indicatorURL(field)}">${esc(field.name)}${duplicate?' ('+esc(field.column)+')':''} ↗</a>${field.unit||field.year?`<p class="detail-field-meta">${[field.unit,field.year].filter(value=>value!=null&&value!=='').map(esc).join(' · ')}</p>`:''}</div>
      <div class="entity-record-value">${compositeDefinitions(field).length?compositeValues(cell,field,cellId(entity.id,field.id)):inspectCell(cell,cellId(entity.id,field.id))}</div>
      ${field.explanation?.text?`<details class="inline-explanation" id="entity-explanation-${esc(field.id)}" data-detail-key="entity:${esc(entity.id)}:field:${esc(field.id)}"><summary>含义与口径</summary>${readerExplanation(field.explanation,{compact:true})}</details>`:''}
    </div>`;
  }).join('')}</div>`;

  const structureHTML=kind=>`<section class="entity-structure-section" aria-labelledby="entity-${kind}-heading">
    <div class="entity-structure-heading"><h2 id="entity-${kind}-heading">${kind==='rank'?'三项领域名次':'五项基础评分'}</h2><p class="section-note">${kind==='rank'?'名次越小，排名越靠前。':'按 1–5 级查看各领域的基础条件。'}</p></div>
    <div class="entity-structure-grid ${kind==='score'?'entity-structure-scores':''}">${db.domains.filter(domain=>domain.kind===kind).map(domain=>`<button type="button" class="entity-structure-item" data-open-domain="${esc(domain.id)}" aria-controls="entity-domain-${esc(domain.id)}" aria-expanded="${domain.id===initialDomain?'true':'false'}" title="${esc(guideFor(domain.id).question)}">
      <span class="entity-structure-label"><b>${esc(domain.name)}</b><small>${kind==='rank'?'名次':'评分'}</small></span>
      ${kind==='score'?scoreReading(entity.domains?.[domain.id],entity.ranked&&entity.domainChartable?.[domain.id]!==false):`<span class="entity-structure-rank">${esc(format(entity.domains?.[domain.id]))}</span>${!entity.ranked?'<small class="entity-structure-record">补充记录</small>':''}`}
      <span class="entity-structure-action">查看本领域记录 ↓</span>
    </button>`).join('')}</div>
  </section>`;

  const domainHTML=domain=>{
    const guide=guideFor(domain.id),records=domainRecords.get(domain.id);
    return `<details class="detail-section entity-domain-records" id="entity-domain-${esc(domain.id)}" data-detail-key="entity:${esc(entity.id)}:domain:${esc(domain.id)}" ${domain.id===initialDomain?'open':''}>
      <summary><span class="entity-domain-summary"><span class="entity-domain-title">${esc(domain.name)}<small>${records.populated.length} 项已记录字段</small></span><span class="entity-domain-question">${esc(guide.question)}</span></span></summary>
      <div class="entity-domain-guide"><p>${esc(guide.intro)}</p>${domain.id==='military'?'<p class="section-note">组合字段分为点前、点后记录。点后未单列时不补零；日本部分 .1 等记录仍待作者确认，不当作已核实的装备数量。</p>':''}<div class="field-links"><a href="${domainURL(domain.id)}">${esc(domain.name)}领域说明 →</a><a href="${routeURL('compare',{entities:entity.id,metric:domain.metricId})}">比较这个领域 →</a><a href="${routeURL('data',{sheet:domain.id,q:entity.name})}">定位原表 →</a></div></div>
      <div class="entity-domain-content">
        ${records.populated.length?'':'<p class="entity-domain-empty">本实体没有已填写的具名明细记录。</p>'}
        ${records.themes.map(theme=>`<details class="entity-record-theme" id="entity-theme-${esc(domain.id)}-${esc(theme.key)}" data-detail-key="entity:${esc(entity.id)}:theme:${esc(domain.id)}:${esc(theme.key)}" open><summary><span>${esc(theme.title)}</span><small>${theme.records.length} 项已记录字段</small></summary><p class="entity-theme-intro">${esc(theme.text)}</p>${theme.records.length?fieldsHTML(theme.records):'<p class="entity-theme-empty">本主题没有已填写的具名明细记录。</p>'}</details>`).join('')}
        ${records.remaining.length?`<details class="entity-record-theme entity-other-theme" id="entity-other-${esc(domain.id)}" data-detail-key="entity:${esc(entity.id)}:other:${esc(domain.id)}" open><summary><span>其他记录</span><small>${records.remaining.length} 项已记录字段</small></summary>${fieldsHTML(records.remaining)}</details>`:''}
        ${records.other.length?`<details class="other-records entity-unrecorded" id="entity-unrecorded-${esc(domain.id)}" data-detail-key="entity:${esc(entity.id)}:unrecorded:${esc(domain.id)}"><summary>未记录项与辅助字段 · ${records.other.length} 项</summary>${fieldsHTML(records.other)}</details>`:''}
      </div>
      <div class="entity-domain-footer"><button type="button" class="button text small" data-entity-top>返回概览 ↑</button><a class="button text small" href="${routeURL('data',{sheet:domain.id,q:entity.name})}">定位原表 →</a></div>
    </details>`;
  };

  app.innerHTML=`<div class="entity-page">${breadcrumb(['综合排名','#/rankings'],[entity.name])}
    <header class="entity-hero entity-hero-compact"><div><div class="entity-heading-line"><h1>${esc(entity.name)}</h1><span class="pill">${esc(entity.category||(entity.ranked?'正式排名实体':'补充实体'))}</span></div><p class="entity-en">${esc(entity.englishName||'')}</p></div><div class="entity-overall-rank"><p class="stat-label">综合名次</p><strong>${entity.ranked?esc(format(entity.rank)):'未排名'}</strong><p class="stat-sub">${entity.ranked?'原工作簿既定名次':'未列入正式排名'}</p></div></header>
    <div class="entity-primary-action"><a class="button small" href="${routeURL('compare',{entities:entity.id})}">与其他实体比较 →</a></div>
    ${scopeNote(entity)}
    <section id="entity-structure" class="entity-structure" tabindex="-1" aria-label="${esc(entity.name)}的领域结构">${['rank','score'].map(structureHTML).join('')}</section>
    <div class="entity-jumpbar" aria-label="领域快速定位"><label for="entity-domain-select">领域定位</label><select class="select" id="entity-domain-select"><option value="">选择领域…</option>${domains.map(domain=>`<option value="${esc(domain.id)}" ${domain.id===initialDomain?'selected':''}>${esc(domain.name)} · ${domainRecords.get(domain.id).populated.length} 项已记录字段</option>`).join('')}</select><button type="button" class="button small" data-entity-top>返回概览 ↑</button></div>
    <section class="entity-evidence"><div class="entity-evidence-heading"><h2>领域明细</h2><p class="section-note">按主题列出已填写字段；空项与辅助字段保留在各领域末尾。</p></div>${domains.map(domainHTML).join('')}</section>
    <details class="research-note entity-reference" id="entity-reference" data-detail-key="entity:${esc(entity.id)}:reference"><summary>公式参考值与综合名次</summary><div class="entity-domain-guide"><p>本实体公式参考值：${referenceCell(entity)}。该值不是百分制总分，也不用于重新排列综合名次。</p><a class="button text" href="#/methodology">来源与方法 →</a></div></details>
  </div>`;

  const syncControls=()=>{
    $('#entity-domain-select').value=activeDomain;
    $$('[data-open-domain]',app).forEach(button=>{
      button.classList.toggle('is-current',button.dataset.openDomain===activeDomain);
      button.setAttribute('aria-expanded',String($('#entity-domain-'+button.dataset.openDomain).open));
    });
  };
  const openDomain=domainId=>{
    const target=$('#entity-domain-'+domainId);
    if(!target)return;
    activeDomain=domainId;
    target.open=true;
    updateRouteState({domain:domainId});
    syncControls();
    $('summary',target).focus({preventScroll:true});
    target.scrollIntoView({behavior:'smooth',block:'start'});
  };
  $$('[data-open-domain]',app).forEach(button=>button.addEventListener('click',()=>openDomain(button.dataset.openDomain)));
  $('#entity-domain-select').addEventListener('change',event=>{if(event.target.value)openDomain(event.target.value);});
  $$('[data-entity-top]',app).forEach(button=>button.addEventListener('click',()=>{
    activeDomain='';
    updateRouteState({domain:null});
    syncControls();
    const target=$('#entity-structure');
    target.focus({preventScroll:true});
    target.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  domains.forEach(domain=>{
    const target=$('#entity-domain-'+domain.id);
    $('summary',target).addEventListener('click',()=>{
      if(!target.open){activeDomain=domain.id;updateRouteState({domain:domain.id});}
      else if(activeDomain===domain.id){activeDomain='';updateRouteState({domain:null});}
      syncControls();
    });
    target.addEventListener('toggle',syncControls);
  });
  syncControls();
}

function renderCompare(params) {
  const maxEntities=5,maxFields=8;
  const availableFields=db.indicators.filter(i=>!['identity','classification','auxiliary'].includes(i.role));
  const fieldIds=new Set(availableFields.map(i=>i.id));
  const validEntities=ids=>[...new Set(ids.filter(id=>byId.has(id)))].slice(0,maxEntities);
  const basket=validEntities(getCompareSelection());
  const startingIds=params.has('entities')?validEntities((params.get('entities')||'').split(',')):(basket.length?basket:rankedEntities().slice(0,3).map(e=>e.id));
  let selected=startingIds.map(id=>byId.get(id));
  let metrics=[...new Set((params.has('metrics')?params.get('metrics')||'':params.get('metric')||'').split(',').filter(id=>fieldIds.has(id)))].slice(0,maxFields);
  const state={entityq:params.get('entityq')||'',candidate:params.get('candidate')||'',fieldq:params.get('fieldq')||'',sheet:params.get('sheet')||'',theme:params.get('theme')||'',details:params.get('details')==='open',reference:params.get('reference')==='open',fieldnotes:params.get('fieldnotes')==='open'};
  if(!db.sheets.some(s=>s.id===state.sheet))state.sheet='';
  if(!existingThemeGroups(state.sheet).some(group=>group.key===state.theme))state.theme='';
  const summarySheet=db.sheets.find(s=>s.role==='summary');
  const rankField=db.indicators.find(i=>i.sheetId===summarySheet?.id&&i.role==='rank');
  const fieldLabel=indicator=>indicator.name+(availableFields.some(other=>other.id!==indicator.id&&other.sheetId===indicator.sheetId&&other.name===indicator.name)?'（'+indicator.column+' 列）':'');
  const modeLabel=indicator=>({rank:'原表名次',score:'基础评分',reference:'计算参考 · 非百分制',composite:'组合记录'})[readingMode(indicator)]||indicator.unit||'';
  const fieldRowLabel=(indicator,part=null,index=0)=>`<a href="${indicatorURL(indicator)}">${esc(part?.label||fieldLabel(indicator))} ↗</a><small>${esc(indicator.sheetName)}${part?' · '+esc(fieldLabel(indicator))+' · '+(index===0?'点前记录':'点后记录'):modeLabel(indicator)?' · '+esc(modeLabel(indicator)):''}</small>`;

  app.innerHTML=mainHeading('','实体比较','选择 2–5 个实体，可另选最多 8 个字段并排查看。')+`
  <section class="compare-selector" aria-label="选择比较实体"><div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索待添加实体</span><input class="input" id="compare-search" type="search" value="${esc(state.entityq)}" placeholder="搜索要添加的实体…"></label><select class="select" id="compare-select" aria-label="选择待比较实体"></select><button class="button primary" id="compare-add" type="button">添加实体 +</button></div><div class="chosen-entities" id="chosen-entities"></div><div class="compare-control-foot"><p class="section-note" id="compare-limit" aria-live="polite"></p><button type="button" class="button text small" id="compare-copy-link">复制分享链接</button></div><p class="section-note" id="compare-share-status" role="status">选择会保存在地址栏链接中。</p></section>
  <div id="compare-overview"></div>
  <section class="section compare-fields-panel" aria-labelledby="compare-fields-title"><div class="section-heading"><div><h2 id="compare-fields-title">添加比较字段</h2><p class="section-note">按工作表、主题或名称查找。最多 ${maxFields} 个原字段，切换筛选保留已选项。</p></div><span class="pill" id="compare-field-count" aria-live="polite"></span></div><div class="compare-field-filters"><label class="compare-filter-search">搜索字段<input class="input" id="compare-field-search" type="search" value="${esc(state.fieldq)}" placeholder="字段名称、领域或解释关键词…"></label><label>工作表<select class="select" id="compare-field-sheet"><option value="">全部工作表</option>${db.sheets.filter(s=>availableFields.some(i=>i.sheetId===s.id)).map(s=>`<option value="${esc(s.id)}" ${state.sheet===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>解释主题<select class="select" id="compare-field-theme"></select></label></div><p class="section-note compare-theme-description" id="compare-theme-description" hidden></p><div class="compare-field-results"><p class="section-note" id="compare-field-results-count" aria-live="polite"></p><div class="compare-field-options" id="compare-field-options"></div></div><div class="compare-picked-fields"><div class="compare-picked-heading"><h3>已选字段</h3><button type="button" class="button text small" id="compare-fields-clear">清空字段选择</button></div><div class="compare-field-chips" id="compare-field-chips"></div><p class="section-note" id="compare-field-limit" aria-live="polite"></p></div><div id="compare-field-table"></div><div id="compare-field-notes"></div></section>
  <div id="compare-domain-details"></div>`;

  function syncState() {
    const values={entities:selected.map(e=>e.id).join(','),metrics:metrics.join(',')};
    for(const [key,value] of Object.entries({entityq:state.entityq,candidate:state.candidate,fieldq:state.fieldq,sheet:state.sheet,theme:state.theme,details:state.details?'open':'',reference:state.reference?'open':'',fieldnotes:state.fieldnotes?'open':''}))if(value!=='')values[key]=value;
    updateRouteState(values);
  }
  function bindDisclosure(id,key) {
    const disclosure=$(id);
    if(!disclosure)return;
    disclosure.addEventListener('toggle',()=>{if(disclosure.isConnected&&state[key]!==disclosure.open){state[key]=disclosure.open;syncState();}});
  }
  function entityColumns() {
    return selected.map(e=>`<th scope="col"><a href="${entityURL(e)}">${esc(e.name)}</a>${!e.ranked?'<small>补充实体</small>':''}</th>`).join('');
  }
  function valueCell(entity,indicator,partId=null) {
    const cell=entity.metrics?.[indicator.id],mode=readingMode(indicator);
    const domain=db.domains.find(d=>d.metricId===indicator.id);
    const eligible=entity.ranked&&(!domain||entity.domainChartable?.[domain.id]!==false);
    const record=inspectCell(cell,cellId(entity.id,indicator.id),'',partId);
    if(partId||cell?.error||cell?.value==null||cell?.value==='')return record;
    if(['rank','score'].includes(mode)&&!eligible)return record+`<small class="compare-record-note">${entity.ranked?'原始记录':'补充记录'}</small>`;
    if(mode==='score')return record+(numeric(cell.value)&&cell.value>=1&&cell.value<=5?'':'<small class="compare-record-note">原始记录</small>');
    return record;
  }
  function rowsFor(metricId) {
    const indicator=byIndicator.get(metricId),domain=db.domains.find(d=>d.metricId===metricId);
    return selected.map(e=>({entity:e,value:e.metrics?.[metricId]?.value,cell:e.metrics?.[metricId],metricId,chartable:!['rank','score'].includes(readingMode(indicator))||(e.ranked&&(!domain||e.domainChartable?.[domain.id]!==false))}));
  }
  function renderEntityOptions() {
    const query=state.entityq.trim().toLowerCase();
    const candidates=db.entities.filter(e=>!selected.some(chosen=>chosen.id===e.id)&&(!query||(e.name+' '+e.englishName).toLowerCase().includes(query)));
    if(!candidates.some(e=>e.id===state.candidate))state.candidate=candidates[0]?.id||'';
    $('#compare-select').innerHTML=candidates.length?candidates.map(e=>`<option value="${esc(e.id)}" ${state.candidate===e.id?'selected':''}>${esc(e.name)}${e.ranked?' · '+format(e.rank):' · 补充'}</option>`).join(''):'<option value="">没有匹配实体</option>';
    $('#compare-select').disabled=!candidates.length||selected.length>=maxEntities;
    $('#compare-add').disabled=selected.length>=maxEntities||!candidates.length;
  }
  function renderEntities() {
    $('#chosen-entities').innerHTML=selected.map((e,index)=>`<span class="entity-chip" style="--color:${palette[index]}"><i aria-hidden="true"></i><a href="${entityURL(e)}">${esc(e.name)}</a><button data-remove-entity="${esc(e.id)}" type="button" aria-label="移除比较实体${esc(e.name)}">×</button></span>`).join('');
    $('#compare-limit').textContent=`已选 ${selected.length} / ${maxEntities} 个实体${selected.length<2?' · 再添加实体即可比较':selected.length===maxEntities?' · 移除一个后可添加其他实体':''}`;
    $$('[data-remove-entity]').forEach(button=>button.addEventListener('click',()=>{selected=selected.filter(e=>e.id!==button.dataset.removeEntity);updateEntities();$('#compare-search').focus({preventScroll:true});}));
    renderEntityOptions();
  }
  function renderOverview() {
    if(selected.length<2){$('#compare-overview').innerHTML=empty('选择至少两个实体','从上方搜索并添加实体；已选字段会保留。');return;}
    const rankCells=selected.map(e=>`<td>${e.ranked?(rankField?valueCell(e,rankField):esc(format(e.rank))):'<span class="empty-value">未排名</span>'}</td>`).join('');
    const sections=['rank','score'].map(kind=>`<tbody><tr class="compare-row-group"><th colspan="${selected.length+1}" scope="rowgroup">${kind==='rank'?'领域名次 · 数值越小，位置越靠前':'基础条件 · 1–5 级评分'}</th></tr>${db.domains.filter(d=>d.kind===kind).map(d=>`<tr><th class="freeze" scope="row"><a href="${domainURL(d.id)}">${esc(d.name)} ↗</a></th>${selected.map(e=>`<td>${valueCell(e,byIndicator.get(d.metricId))}</td>`).join('')}</tr>`).join('')}</tbody>`).join('');
    $('#compare-overview').innerHTML=`<section class="section compare-overview-section" aria-labelledby="compare-overview-title"><div class="section-heading"><div><h2 id="compare-overview-title">综合与领域结果</h2><p class="section-note">同一行比较：政治、经济、军事看名次，其余五个领域看评分。</p></div><button type="button" class="button text small" id="compare-open-domain-details">查看领域解释 ↓</button></div><div class="table-wrap compare-matrix-wrap" tabindex="0" role="region" aria-label="实体综合与领域结果"><table class="compare-matrix compare-overview-matrix"><thead><tr><th class="freeze header" scope="col">综合位置与领域</th>${entityColumns()}</tr></thead><tbody><tr class="compare-overall-row"><th class="freeze" scope="row">综合名次</th>${rankCells}</tr></tbody>${sections}</table></div>${selected.filter(e=>!e.ranked||e.id==='european-union').map(scopeNote).join('')}<details class="research-note compare-reference-note" id="compare-reference-details" ${state.reference?'open':''}><summary>公式参考值 · 单独查看</summary><div class="entity-domain-guide"><p>公式参考值不是百分制，也不用于重新排列综合名次。</p><div class="table-wrap"><table class="compare-matrix"><thead><tr><th scope="col" class="freeze header">计算参考</th>${entityColumns()}</tr></thead><tbody><tr><th class="freeze" scope="row">公式参考值</th>${selected.map(e=>`<td>${referenceCell(e)}</td>`).join('')}</tr></tbody></table></div><a class="button text small" href="#/methodology">查看计算与研究方法 →</a></div></details></section>`;
    bindDisclosure('#compare-reference-details','reference');
    $('#compare-open-domain-details').addEventListener('click',event=>{event.preventDefault();state.details=true;const details=$('#compare-domain-disclosure');if(details)details.open=true;syncState();$('#compare-domain-details').scrollIntoView({block:'start',behavior:'smooth'});});
  }
  function renderThemeOptions() {
    const groups=existingThemeGroups(state.sheet);
    if(!groups.some(group=>group.key===state.theme))state.theme='';
    $('#compare-field-theme').innerHTML='<option value="">全部解释主题</option>'+groups.map(group=>`<option value="${esc(group.key)}" ${state.theme===group.key?'selected':''}>${esc(group.title)}</option>`).join('');
    $('#compare-field-theme').disabled=!groups.length;
    const description=groups.find(group=>group.key===state.theme)?.text||'';
    $('#compare-theme-description').textContent=description;
    $('#compare-theme-description').hidden=!description;
  }
  function renderFieldOptions() {
    const query=state.fieldq.trim().toLowerCase();
    const theme=existingThemeGroups(state.sheet).find(group=>group.key===state.theme);
    const list=availableFields.filter(indicator=>(!state.sheet||indicator.sheetId===state.sheet)&&(!theme||theme.fields.includes(indicator.id))&&(!query||(indicator.name+' '+indicator.sheetName+' '+(indicator.unit||'')+' '+(indicator.explanation?.text||'')).toLowerCase().includes(query)));
    $('#compare-field-results-count').textContent=`找到 ${list.length} 个字段`;
    $('#compare-field-options').innerHTML=list.length?list.map(indicator=>`<label class="compare-field-option"><input type="checkbox" data-compare-field="${esc(indicator.id)}" aria-label="选择${esc(indicator.sheetName)}的${esc(fieldLabel(indicator))}"><span><b>${esc(fieldLabel(indicator))}</b><small>${esc(indicator.sheetName)}${modeLabel(indicator)?' · '+esc(modeLabel(indicator)):''}</small></span></label>`).join(''):empty('没有匹配字段','试着调整关键词、工作表或主题；已选字段仍保留在下方。');
    $$('[data-compare-field]').forEach(input=>input.addEventListener('change',()=>{const id=input.dataset.compareField;if(input.checked&&!metrics.includes(id)&&metrics.length<maxFields)metrics.push(id);else if(!input.checked)metrics=metrics.filter(metric=>metric!==id);updateMetrics();}));
    refreshFieldAvailability();
  }
  function refreshFieldAvailability() {
    $$('[data-compare-field]').forEach(input=>{input.checked=metrics.includes(input.dataset.compareField);input.disabled=!input.checked&&metrics.length>=maxFields;input.closest('label').classList.toggle('selected',input.checked);});
    $('#compare-field-count').textContent=`${metrics.length} / ${maxFields} 个字段`;
    $('#compare-field-limit').textContent=metrics.length===maxFields?'已达到 8 个字段；移除一项即可添加其他字段。':metrics.length?'字段按选择顺序并排比较；组合字段展开为两行，不增加原字段数。':'尚未选择字段。勾选上方字段即可保留到比较表。';
    $('#compare-fields-clear').disabled=!metrics.length;
  }
  function renderFieldChips() {
    $('#compare-field-chips').innerHTML=metrics.map(id=>{const indicator=byIndicator.get(id);return `<span class="compare-field-chip"><a href="${indicatorURL(indicator)}">${esc(indicator.sheetName)} · ${esc(fieldLabel(indicator))}</a><button type="button" data-remove-compare-field="${esc(id)}" aria-label="移除比较字段${esc(indicator.sheetName)}的${esc(fieldLabel(indicator))}">×</button></span>`;}).join('');
    $$('[data-remove-compare-field]').forEach(button=>button.addEventListener('click',()=>{metrics=metrics.filter(id=>id!==button.dataset.removeCompareField);updateMetrics();$('#compare-field-search').focus({preventScroll:true});}));
  }
  function renderFieldTable() {
    if(!metrics.length){$('#compare-field-table').innerHTML='';$('#compare-field-notes').innerHTML='';return;}
    if(selected.length<2){$('#compare-field-table').innerHTML=empty('字段已保留','选择至少两个实体后，这里会显示并排记录。');$('#compare-field-notes').innerHTML='';return;}
    const indicators=metrics.map(id=>byIndicator.get(id));
    const rows=indicators.map(indicator=>{const parts=compositeDefinitions(indicator);return parts.length?parts.map((part,index)=>`<tr class="${index===0?'compare-field-start':'compare-field-continuation'}"><th class="freeze" scope="row">${fieldRowLabel(indicator,part,index)}</th>${selected.map(e=>`<td>${valueCell(e,indicator,part.id)}</td>`).join('')}</tr>`).join(''):`<tr class="compare-field-start"><th class="freeze" scope="row">${fieldRowLabel(indicator)}</th>${selected.map(e=>`<td>${valueCell(e,indicator)}</td>`).join('')}</tr>`;}).join('');
    const rowCount=indicators.reduce((total,i)=>total+(compositeDefinitions(i).length||1),0);
    $('#compare-field-table').innerHTML=`<p class="section-note compare-field-table-caption">${metrics.length} 个原字段 · ${rowCount} 个显示行。点击数值查看记录，点击字段名称查看全部实体。</p><div class="table-wrap compare-matrix-wrap" tabindex="0" role="region" aria-label="已选字段的实体并排比较"><table class="compare-matrix compare-selected-matrix"><thead><tr><th class="freeze header" scope="col">字段</th>${entityColumns()}</tr></thead><tbody>${rows}</tbody></table></div>${indicators.some(i=>compositeDefinitions(i).length)?'<p class="table-hint">点后按保存位数显示，“未单列”不代表零。日本部分 .1 等特殊点后记录含义仍待作者确认。</p>':''}`;
    $('#compare-field-notes').innerHTML=`<details class="research-note" id="compare-field-notes-disclosure" ${state.fieldnotes?'open':''}><summary>查看已选字段的含义与口径</summary><div class="compare-field-note-list">${indicators.map(indicator=>`<article><h3><a href="${indicatorURL(indicator)}">${esc(indicator.sheetName)} · ${esc(fieldLabel(indicator))} ↗</a></h3>${readerExplanation(indicator.explanation,{compact:true,title:false})}${metadata(indicator)}${indicator.note?`<p class="section-note">${esc(indicator.note)}</p>`:''}</article>`).join('')}</div></details>`;
    bindDisclosure('#compare-field-notes-disclosure','fieldnotes');
  }
  function renderDomainDetails() {
    if(selected.length<2){$('#compare-domain-details').innerHTML='';return;}
    $('#compare-domain-details').innerHTML=`<details class="research-note compare-domain-disclosure" id="compare-domain-disclosure" ${state.details?'open':''}><summary>领域解释与评分等级</summary><div class="compare-domain-detail-body">${['rank','score'].map(kind=>`<section><h2>${kind==='rank'?'三项领域名次':'五项基础评分'}</h2><p class="section-note">${kind==='rank'?'名次越小，原表位置越靠前；名次不表示能力差距。':'评分采用固定 1–5 等级，不随比较对象变化。小数评分保留原值。'}</p><div class="comparison-grid">${db.domains.filter(domain=>domain.kind===kind).map(domain=>{const indicator=byIndicator.get(domain.metricId);return `<article class="comparison-card"><div class="comparison-card-heading"><h3>${esc(domain.name)}</h3><small>${kind==='rank'?'原表名次':'固定 1–5 等级'}</small></div>${comparisonReading(kind,rowsFor(domain.metricId),indicator)}<p class="comparison-question">${esc(guideFor(domain.id).question)}</p>${readerExplanation(domain.explanation||indicator?.explanation,{compact:true,title:false})}<a class="button text small" href="${domainURL(domain.id)}">领域说明 →</a></article>`;}).join('')}</div></section>`).join('')}</div></details>`;
    bindDisclosure('#compare-domain-disclosure','details');
  }
  function updateMetrics() {
    renderFieldChips();refreshFieldAvailability();renderFieldTable();syncState();
  }
  function updateEntities() {
    setCompareSelection(selected.map(e=>e.id));renderEntities();renderOverview();renderFieldTable();renderDomainDetails();syncState();
  }
  $('#compare-search').addEventListener('input',event=>{state.entityq=event.target.value;renderEntityOptions();syncState();});
  $('#compare-select').addEventListener('change',event=>{state.candidate=event.target.value;syncState();});
  $('#compare-add').addEventListener('click',()=>{const entity=byId.get(state.candidate);if(entity&&selected.length<maxEntities&&!selected.some(e=>e.id===entity.id)){selected.push(entity);state.entityq='';state.candidate='';$('#compare-search').value='';updateEntities();$('#compare-search').focus({preventScroll:true});}});
  $('#compare-field-search').addEventListener('input',event=>{state.fieldq=event.target.value;renderFieldOptions();syncState();});
  $('#compare-field-sheet').addEventListener('change',event=>{state.sheet=event.target.value;state.theme='';renderThemeOptions();renderFieldOptions();syncState();});
  $('#compare-field-theme').addEventListener('change',event=>{state.theme=event.target.value;renderThemeOptions();renderFieldOptions();syncState();});
  $('#compare-fields-clear').addEventListener('click',()=>{metrics=[];updateMetrics();$('#compare-field-search').focus({preventScroll:true});});
  $('#compare-copy-link').addEventListener('click',async()=>{syncState();try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(location.href);$('#compare-share-status').textContent='分享链接已复制，包含当前实体、字段与筛选。';}catch{$('#compare-share-status').textContent='请复制地址栏链接，其中已包含当前实体、字段与筛选。';}});
  renderThemeOptions();renderFieldOptions();renderFieldChips();updateEntities();
}
function renderIndicators(params) {
  const state={sheet:params.get('sheet')||'',q:params.get('q')||'',aux:params.get('aux')==='1'};
  const fields=db.indicators.filter(i=>i.role!=='identity'&&i.role!=='classification');
  app.innerHTML=breadcrumb(['数据与方法','#/library'],['字段目录'])+mainHeading('','字段目录','查找字段定义、单位、年份和各实体记录。',`<a class="button" href="#/data">完整数据表 →</a>`)+`<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索指标字段</span><input class="input" id="indicator-search" placeholder="搜索指标、领域或工作表…" value="${esc(state.q)}"></label><label class="checkbox-label"><input type="checkbox" id="indicator-aux" ${state.aux?'checked':''}>包含未命名辅助字段</label><span class="toolbar-end" id="indicator-count" aria-live="polite"></span></div><div class="indicator-layout"><aside class="indicator-sidebar" aria-label="按工作表筛选"><button type="button" data-indicator-sheet="" class="${state.sheet?'':'active'}">全部工作表<span>${fields.filter(i=>i.role!=='auxiliary').length}</span></button>${db.sheets.map(s=>`<button type="button" data-indicator-sheet="${esc(s.id)}" class="${state.sheet===s.id?'active':''}">${esc(s.name)}<span>${fields.filter(i=>i.sheetId===s.id&&i.role!=='auxiliary').length}</span></button>`).join('')}</aside><div id="indicator-list"></div></div>`;
  function update(){const q=state.q.trim().toLowerCase();const list=fields.filter(i=>(!state.sheet||i.sheetId===state.sheet)&&(state.aux||i.role!=='auxiliary')&&(!q||(i.name+' '+i.sheetName+' '+(i.unit||'')+' '+(i.explanation?.text||'')).toLowerCase().includes(q)));$('#indicator-count').textContent=`${list.length} 个字段`;$('#indicator-list').innerHTML=(list.length?`<div class="indicator-cards">${list.map(i=>{const count=indicatorCells(i).filter(r=>r.cell?.value!=null||r.cell?.error).length;return `<a class="indicator-card" href="${indicatorURL(i)}"><p class="eyebrow">${esc(i.sheetName)} · ${esc(i.column)} 列</p><h3>${esc(i.name)}${i.type==='composite'?' <span class="pill ochre">两项记录</span>':''}</h3>${i.explanation?.text?`<p class="indicator-excerpt">${esc(i.explanation.text)}</p>`:''}<div class="indicator-card-meta">${knownMetadata(i).filter(([label])=>label!=='工作表').map(([label,value])=>`<span>${esc(label)}：${esc(value)}</span>`).join('')}</div><div class="indicator-card-count"><span>${count} 个实体有记录${i.role==='auxiliary'?' · 辅助字段':''}</span><span aria-hidden="true">↗</span></div></a>`;}).join('')}</div>`:empty());$$('[data-indicator-sheet]').forEach(b=>b.classList.toggle('active',b.dataset.indicatorSheet===state.sheet));updateRouteState({sheet:state.sheet||undefined,q:state.q||undefined,aux:state.aux?'1':undefined});}
  $('#indicator-search').addEventListener('input',e=>{state.q=e.target.value;update();});$('#indicator-aux').addEventListener('change',e=>{state.aux=e.target.checked;update();});$$('[data-indicator-sheet]').forEach(b=>b.addEventListener('click',()=>{state.sheet=b.dataset.indicatorSheet;update();}));update();
}
function renderIndicator(id,params) {
  const indicator=byIndicator.get(id);if(!indicator){app.innerHTML=empty('未找到该指标');return;}
  const parts=compositeDefinitions(indicator),mode=readingMode(indicator),domain=db.domains.find(d=>d.id===indicator.sheetId||d.metricId===id);
  const canOrder=indicator.rankingAllowed!==false&&indicator.type!=='composite';
  const state={q:params.get('q')||'',order:canOrder?(['asc','desc','source'].includes(params.get('order'))?params.get('order'):mode==='rank'?'asc':'source'):'source',only:params.get('only')==='1'};
  const meaning=mode==='rank'?'按原表名次排列，数字越小越靠前。':mode==='score'?'这是该领域的基础评分，主要采用固定 1–5 等级。':mode==='reference'?'这是公式计算的参考值，可能超过 100；它不是百分制总分，也不决定综合名次。':parts.length?'两项记录分别阅读，点号不是普通小数点。':'查看各实体在这个字段的记录，可搜索名称或调整显示顺序。';
  app.innerHTML=breadcrumb(['数据与方法','#/library'],['字段目录','#/indicators'],[indicator.name])+mainHeading('从领域到依据',indicator.name,esc(meaning),`<a class="button" href="${routeURL('data',{sheet:indicator.sheetId})}">原工作表 →</a>`)+readerExplanation(indicator.explanation)+`${domain?`<p class="field-context"><a href="${domainURL(domain.id)}">${esc(domain.name)}领域说明 →</a></p>`:''}`+metadata(indicator)+`${indicator.note?`<details class="research-note" ${parts.length?'open':''}><summary>字段口径补充</summary><p class="entity-domain-guide">${esc(indicator.note)}</p></details>`:''}<div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索实体</span><input class="input" id="indicator-entity-search" value="${esc(state.q)}" placeholder="搜索实体名称…"></label>${canOrder?`<select class="select" id="indicator-order" aria-label="数值排序"><option value="source" ${state.order==='source'?'selected':''}>原表实体顺序</option><option value="asc" ${state.order==='asc'?'selected':''}>${mode==='rank'?'名次靠前优先':'数值从小到大'}</option><option value="desc" ${state.order==='desc'?'selected':''}>${mode==='rank'?'名次靠后优先':'数值从大到小'}</option></select>`:''}<label class="checkbox-label"><input type="checkbox" id="indicator-only" ${state.only?'checked':''}>仅显示有记录项</label><span class="toolbar-end" id="indicator-entity-count" aria-live="polite"></span></div><div class="indicator-results ${parts.length?'composite-results':''}"><div><div class="table-wrap" tabindex="0" role="region" aria-label="指标实体数据"><table><thead><tr><th class="freeze header">实体</th>${parts.length?parts.map((part,index)=>`<th>${esc(part.label)}<span class="table-group">${index===0?'点前记录':'点后记录'}</span></th>`).join(''):`<th>${mode==='rank'?'原表名次':mode==='score'?'基础评分':'原始记录'}</th>`}<th>补充说明</th></tr></thead><tbody id="indicator-entity-body"></tbody></table></div><div id="indicator-entity-empty"></div><p class="table-hint">${parts.length?'“未单列”不代表零。日本部分 .1 等特殊点后记录仍待作者确认。':'“—”表示未记录，与零不同。'}点击数值查看原单元格与公式。</p></div><aside class="side-note"><h3>${mode==='score'?'评分怎样理解':parts.length?'保留点后记录的含义':'查看记录'}</h3>${mode==='score'?`<ol class="score-key">${scoreLabels.map(label=>`<li>${label}</li>`).join('')}</ol><p>小数评分按原表保留。补充实体中的标记不进入这套等级。</p>`:parts.length?'<p>点前、点后按已保存的位数分别显示。整数记录的第二项未单列；Excel 可能丢失的尾零不能自行恢复。</p>':`<p>点击实体名称打开详情，点击数字查看原值与已有公式。</p>`}<a class="button text" href="${routeURL('compare',{metric:indicator.id})}">比较这个字段 →</a></aside></div>`;
  function update(){
    const q=state.q.trim().toLowerCase();
    let list=indicatorCells(indicator).filter(r=>(!q||(r.entity.name+' '+r.entity.englishName).toLowerCase().includes(q))&&(!state.only||r.cell?.value!=null||r.cell?.error));
    if(state.order!=='source')list.sort((a,b)=>sortValues(a.cell?.value,b.cell?.value,state.order));
    $('#indicator-entity-count').textContent=`${list.length} 个实体`;
    $('#indicator-entity-body').innerHTML=list.map(({entity,cell})=>`<tr><td class="freeze">${entityLink(entity)}</td>${parts.length?parts.map(part=>`<td>${inspectCell(cell,cellId(entity.id,indicator.id),'',part.id)}</td>`).join(''):`<td>${inspectCell(cell,cellId(entity.id,indicator.id))}</td>`}<td class="muted">${cell?.error?'原表错误':cell?.value==null?'未记录':['rank','score'].includes(mode)&&!entity.ranked?'补充记录':parts.length?(cell?.composite?.status==='unparsed'?'组合记录待核对':compositePart(cell,'secondary')?.digits==null?'第二项未单列':'点后按保存位数'):''}</td></tr>`).join('');
    $('#indicator-entity-empty').innerHTML=list.length?'':empty();
    updateRouteState({q:state.q||undefined,order:state.order,only:state.only?'1':undefined});
  }
  $('#indicator-entity-search').addEventListener('input',e=>{state.q=e.target.value;update();});$('#indicator-order')?.addEventListener('change',e=>{state.order=e.target.value;update();});$('#indicator-only').addEventListener('change',e=>{state.only=e.target.checked;update();});update();
}
function renderMethodology() {
  const m=db.methodology||{},items=values=>`<ul>${(values||[]).map(value=>`<li>${esc(textValue(value))}</li>`).join('')}</ul>`;
  app.innerHTML=breadcrumb(['研究说明','#/framework'],['来源与方法'])+mainHeading('','来源与方法','了解排名、评分和数据来源。')+`<div class="prose-layout"><article class="prose"><h2>研究问题</h2><p>本项目比较国家及其他评价实体调动经济、军事、人口和资源，并在长期压力下持续行动的能力。研究以分层为主、名次为辅，关注能力基础及其约束；社会民生、生活质量和历史文化不在本次评价范围内。</p><p>研究结合统计记录、计算和作者判断。综合名次给出整体位置，领域结果说明不同侧面；这些结果不用于预测一场具体战争的胜负或精确的承压时长。</p><h2>结果怎么读</h2><ol class="method-steps"><li><strong>综合名次与原表分类</strong><p>保留工作簿中的既定结果，包括小数名次。分类用于观察梯队；相邻名次不代表固定能力差距。</p></li><li><strong>三项领域名次</strong><p>政治、经济、军事：数值越小，原表位置越靠前。名次之比不能当作能力之比。</p></li><li><strong>五项基础评分</strong><p>交通、农业、能源、矿产、稳定：主要使用 1–5 级，描述各自的基础条件，保留原表小数评分。评分与名次使用不同尺度。</p></li><li><strong>公式参考值</strong><p>这是原表保存的计算结果，可能超过 100，并非百分制总分。它与综合名次分别展示，不据此重新排列作者的既定排名。</p></li></ol><p>欧盟作为独立评价实体保留原结果和单独修正，其总量不意味着成员资源能够完全统一调度。补充实体没有既定综合名次，其中的特殊标记不自动解释为正式名次或 1–5 级评分。</p>
  <h2>资料来源</h2><p><strong>当前 Excel 提供数值、排名和公式。</strong>网站与下载文件中的研究数值均取自该工作簿，单元格可查看原值、位置和已有公式。</p><p><strong>《综合国力2.0》PDF 提供研究背景和字段解释。</strong>相关说明标注实际 PDF 页码，旧报告数字不覆盖当前 Excel。报告中的“发展”对应当前工作簿的“政治”，“政治”对应当前的“稳定”；网站使用当前工作簿名称。</p><p>各字段的单位、年份、来源只按已记录的信息展示。文件保存日期用于识别数据版本，不是各项数据的观测年份。报告列出的机构清单也不能证明每个具体字段的出处。</p><details class="research-note"><summary>背景报告列出的来源</summary><div class="entity-domain-guide">${(m.sources||[]).map(source=>`<div class="source-item"><strong>${source.url&&/^https?:\/\//.test(source.url)?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`:esc(source.label)}</strong>${source.note?`<p>${esc(source.note)}</p>`:''}</div>`).join('')}</div></details>
  <h2>阅读数据时</h2><details class="research-note"><summary>数据年份、估算与特殊记录说明</summary><div class="entity-domain-guide"><ul><li>不同字段可能使用不同年份，多数逐项来源、单位及估算标记不完整，横向比较需要结合具体口径。</li><li>若干领域结论和分项名次是已录入的结果。现有材料没有保留底层指标的全部权重、初排及人工调整过程，不能从底层字段完整复现全部研究判断。</li><li>有效国土、军事能力及部分资源分级包含估算或判断，但工作簿没有统一的逐格标记。</li><li>空白、零和 Excel 错误分别保留；同名字段不擅自合并。数据字段包含派生、重复与辅助记录，其数量不等于独立研究指标数。</li><li>军事点号记录按两部分展示。第二项未单列时不补零，可能丢失的尾零不自行恢复；日本部分 .1 等记录的具体含义仍待核对。</li></ul></div></details><details class="research-note"><summary>本版本完整限制说明</summary><div class="entity-domain-guide">${items(m.limitations)}</div></details>
  <h2>详细规则与解释</h2><details class="research-note"><summary>基础评分的五个等级</summary><div class="entity-domain-guide"><ol class="score-key">${scoreLabels.map(label=>`<li>${label}</li>`).join('')}</ol><p>等级描述基础条件，不表示能力倍数。小数评分保留原值；补充记录不自动纳入这套等级。</p></div></details><details class="research-note"><summary>公式、权重与特殊修正</summary><div class="entity-domain-guide"><p>公式对领域结果进行变换与加权，并依据最低基础评分作修正。系数是本公式的参数，不是现实能力的组成比例；不同实体按各自保存的公式展示。</p>${m.formula?`<div class="formula">${esc(m.formula)}</div>`:''}${m.formulaVariants?.map(variant=>`<p><strong>${esc(variant.entity)}</strong>（${esc(variant.origin)}）：<code>${esc(variant.formula)}</code></p>`).join('')||''}<div class="table-wrap"><table><thead><tr><th>领域</th><th>原表权重 / 参数</th></tr></thead><tbody>${m.weights?.map(weight=>`<tr><td>${esc(weight.name)}</td><td>${esc(format(weight.weight))}</td></tr>`).join('')||''}</tbody></table></div>${items(m.notes)}</div></details><details class="research-note"><summary>领域与字段解释索引 · 附 PDF 页码</summary><div class="entity-domain-guide">${readerNotesDirectory()}</div></details>
  <details class="qa-details"><summary>数据核对记录 · 技术资料</summary><p>自动检查核对数据转换和公式缓存，不代表每项原始统计或研究判断都已独立验证。已检查 ${esc(db.quality?.summary?.formulasChecked??'—')} 个公式缓存，保留 ${esc(db.quality?.summary?.excelErrors??'—')} 个 Excel 原生错误；当前 ${esc(db.quality?.summary?.errors??0)} 项阻断问题。</p>${(db.quality?.issues||[]).map(issue=>`<div class="qa-item"><span class="pill">${esc(({error:'阻断问题',warning:'提示',info:'信息'})[issue.severity]||issue.severity)}</span> <code>${esc(issue.code)}</code><p>${esc(issue.message)}</p>${issue.locations?.length?`<small>${esc(issue.locations.map(textValue).join(' · '))}</small>`:''}</div>`).join('')}</details></article><aside class="side-note"><h3>查阅资料</h3><a class="button text" href="#/framework">领域说明 →</a><a class="button text" href="#/indicators">字段目录 →</a><a class="button text" href="#/data">完整数据 →</a><a class="button text" href="#/downloads">下载文件 →</a></aside></div>`;
}
function renderDownloads() {
  const downloads=db.downloads||[];
  const workbook=downloads.find(file=>String(file.format).toLowerCase()==='xlsx');
  const csvs=downloads.filter(file=>String(file.format).toLowerCase()==='csv');
  const combined=csvs[0],sheets=csvs.slice(1);
  const technical=downloads.filter(file=>file!==workbook&&!csvs.includes(file));
  const safeHref=href=>typeof href==='string' && /^(?:\.\/)?(?:downloads|data)\/[a-z0-9._/-]+$/i.test(href.trim()) && !href.trim().split('/').includes('..')?href.trim():'#/downloads';
  const fileCard=(file,title,description)=>`<article class="download-card"><div class="file-icon">${esc(file.format.toUpperCase())}</div><h2>${esc(title)}</h2><p>${esc(description)}</p><a class="button primary" href="${esc(safeHref(file.href))}" download>下载 ${esc(file.format.toUpperCase())} ↓</a></article>`;
  app.innerHTML=breadcrumb(['下载文件'])+mainHeading('','下载文件','Excel 保留原工作簿；CSV 用于数据分析；离线版可直接在浏览器打开。')+`<div class="download-grid">${workbook?fileCard(workbook,'Excel 工作簿','保留全部工作表、记录、公式和格式，是本项目的权威数值来源。'):''}${combined?fileCard(combined,'全部数据 CSV','将全部实体和领域字段整理在一张表中，方便筛选与分析。'):''}<article class="download-card"><div class="file-icon">HTML</div><h2>单文件离线版</h2><p>下载后在浏览器打开，无需联网即可浏览排名、实体、比较和完整数据。</p><a class="button primary" href="./offline.html" download>下载离线版 ↓</a></article></div>${sheets.length?`<section class="section"><div class="section-heading"><div><h2>分表与分项 CSV</h2><p class="section-note">只需某一领域时，下载对应文件。CSV 不保留 Excel 样式；查看公式请用工作簿。</p></div></div>${sheets.map(file=>`<div class="download-item"><div><h3>${esc(file.label)}</h3>${file.label.includes('分项')?`<p>${esc(file.description||'')}</p>`:''}</div><a class="button small" href="${esc(safeHref(file.href))}" download>下载 CSV ↓</a></div>`).join('')}</section>`:''}<div class="download-version"><p>研究版本 ${esc(db.meta.researchVersion||db.meta.version)} · 数据文件保存日期 ${esc(shortDate(db.meta.workbookModifiedAt))}</p><p>引用时请注明项目名称和版本。</p><a class="button text" href="#/methodology">来源与方法 →</a></div><details class="research-note technical-downloads"><summary>技术文件与版本核对</summary><div class="entity-domain-guide">${technical.map(file=>`<div class="download-item"><div><h3>${esc(file.label)}</h3><p>${esc(file.description||'')}</p></div><a class="button small" href="${esc(safeHref(file.href))}" download>下载 ${esc(file.format.toUpperCase())} ↓</a></div>`).join('')}<p class="section-note">数据版本：${esc(db.meta.dataVersion||'未注明')} · 网站构建日期：${esc(shortDate(db.meta.builtAt))}</p><p class="section-note" style="overflow-wrap:anywhere">源文件 SHA-256：${esc(db.meta.sourceSha256||'未注明')}</p><p class="section-note">公开工作簿保留单元格、公式、缓存结果和样式，仅清理文档作者、最后编辑者及打印机元数据。</p><a class="button text" href="https://github.com/Lawrence35952563/National-Power" target="_blank" rel="noopener noreferrer">源码与更新记录 ↗</a></div></details>`;
}
function openCell(button) {
  let cell,indicator,entity;
  if(button.dataset.entity){entity=byId.get(button.dataset.entity);indicator=byIndicator.get(button.dataset.metric);cell=entity?.metrics?.[button.dataset.metric];}
  else{const sheet=bySheet.get(button.dataset.sheet),row=sheet?.rows.find(r=>String(r.row)===button.dataset.row);cell=row?.cells?.[button.dataset.columnRef];indicator=db.indicators.find(i=>i.sheetId===sheet?.id&&i.column===button.dataset.columnRef);entity=byId.get(row?.entityId);}
  const parts=compositeDefinitions(indicator),isComposite=parts.length>0||cell?.kind==='composite';
  const shown=isComposite?displayCellValue(cell):cell?.error || (cell?.raw ?? cell?.value);
  const meta=[['实体',entity?.name||'辅助 / 未映射行'],...(isComposite?[['组合写法',shown]]:[['显示完整值',cell?.error || (cell?.value==null?'—':String(cell.value))]]),['工作表',cell?.sheet||indicator?.sheetName||'未注明'],['单元格',cell?.address||'未记录'],...knownMetadata(indicator).filter(([label])=>label!=='工作表'),...(indicator?.estimate!=null?[['是否估算',indicator.estimate?'是':'否']]:[])];
  const advanced=[['原始 XML 值',cell?.raw==null?'空白':String(cell.raw)],['单元格类型',({number:'数值',text:'文本',composite:'复合编码',boolean:'布尔值',error:'错误',blank:'空白'})[cell?.kind]||'空白'],['Excel 数字格式',cell?.numberFormat||'未记录']];
  $('#cell-content').innerHTML=`<h2 id="cell-title">${esc(indicator?.name||'工作簿单元格')}</h2><p class="muted" style="font-size:12px">${esc(entity?.name||'原始工作表记录')}</p>${parts.length?`<div class="composite-readout">${parts.map((part,index)=>`<div class="${button.dataset.component===part.id?'active':''}"><span>${esc(part.label)}<small>${index===0?'点前记录':'点后记录'}</small></span><strong>${esc(displayCellValue(cell,part.id))}</strong></div>`).join('')}</div>`:`<p class="cell-value-large">${esc(shown==null?'—':String(shown))}</p>`}${cell?.error?`<div class="notice ochre">这是原工作簿中的错误值，网站未修改或填补。</div>`:isComposite?`<div class="notice"><p>${cell?.composite?.status==='unparsed'?'该组合记录尚未可靠拆分，各分项显示“待核对”。可展开高级溯源查看原始存储记录。':'点前、点后按分项记录展示；“未单列”不代表零。第二项按当前保存的位数展示，不能据此确认输入时是否另有尾零。'}</p>${cell?.composite?.note?`<p>${esc(cell.composite.note)}</p>`:''}</div>`:''}${readerExplanation(indicator?.explanation,{compact:true})}<table class="cell-meta-table"><tbody>${meta.map(([key,value])=>`<tr><th>${esc(key)}</th><td>${esc(value)}</td></tr>`).join('')}${indicator?.note?`<tr><th>字段说明</th><td>${esc(indicator.note)}</td></tr>`:''}</tbody></table><details class="raw-provenance"><summary>高级溯源：原始存储与公式</summary>${isComposite?'<p>下面保留 Excel 的底层存储字符串，其中可能存在浮点尾差；不将该字符串直接解释为第二项数量。</p>':''}<table class="cell-meta-table"><tbody>${advanced.map(([key,value])=>`<tr><th>${esc(key)}</th><td><code>${esc(value)}</code></td></tr>`).join('')}${cell?.formula?`<tr><th>原始公式</th><td><code>${esc(cell.formula)}</code></td></tr>`:''}${cell?.composite?.normalization?`<tr><th>显示规范化记录</th><td><code>${esc(textValue(cell.composite.normalization))}</code></td></tr>`:''}</tbody></table></details><div class="dialog-actions">${indicator?`<a class="button small" href="${indicatorURL(indicator)}" data-close-dialog>查看该字段全部实体 ↗</a>`:''}<button class="button small" data-close-dialog type="button">关闭</button></div>`;
  $('#cell-dialog').showModal();
}
document.addEventListener('click',event=>{if(event.target.closest('.skip-link')){event.preventDefault();app.focus();app.scrollIntoView();return;}const inspect=event.target.closest('.inspect');if(inspect)openCell(inspect);if(event.target.closest('[data-close-dialog]'))$('#cell-dialog').close();});
$('#cell-dialog').addEventListener('click',event=>{if(event.target===$('#cell-dialog')){const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)event.target.close();}});
$('.menu-toggle').addEventListener('click',()=>{const open=$('#navigation').classList.toggle('open');$('.menu-toggle').setAttribute('aria-expanded',String(open));});

async function start(){
  try {
    if(window.NATIONAL_POWER_DATA)db=window.NATIONAL_POWER_DATA;
    else{const response=await fetch('./data/dataset.json',{cache:'no-cache'});if(!response.ok)throw new Error(`数据请求失败（${response.status}）`);db=await response.json();}
    if(!Array.isArray(db.entities)||!Array.isArray(db.indicators)||!Array.isArray(db.sheets))throw new Error('数据格式不完整');
    byId=new Map(db.entities.map(e=>[e.id,e]));byIndicator=new Map(db.indicators.map(i=>[i.id,i]));bySheet=new Map(db.sheets.map(s=>[s.id,s]));
    $('#footer-version').textContent=`研究版本 ${db.meta.researchVersion||db.meta.version||'—'} · 数据文件 ${shortDate(db.meta.workbookModifiedAt)}`;
    route();
  }catch(error){console.error('Data load failed',error);app.innerHTML=`<div class="error-panel"><h1>研究数据尚未载入</h1><p>请检查网络后刷新页面，或通过 GitHub 下载工作簿。如果正在本地查看网站，请使用项目提供的本地预览入口。</p><code>${esc(error.message)}</code><p><a class="button" href="https://github.com/Lawrence35952563/National-Power" target="_blank" rel="noopener noreferrer">打开 GitHub 项目 ↗</a></p></div>`;}
}
start();
