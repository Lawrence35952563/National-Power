/* Presentation-only localization. Workbook values, IDs, input values and URLs
 * never pass through the translation layer. No external translation service. */
const NP_I18N_CORE = (() => {
  const cjk = /[\u3400-\u9fff]/;
  const escapeRE = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function selectLanguage(search, preference) {
    const explicit = new URLSearchParams(search).get('lang');
    return ['en','zh'].includes(explicit) ? explicit : preference === 'en' ? 'en' : 'zh';
  }
  function languageURL(href, language) {
    const url = new URL(href);
    url.searchParams.set('lang', language === 'en' ? 'en' : 'zh');
    return url.href;
  }
  function createTranslator(entries) {
    const dictionary = Object.fromEntries(Object.entries(entries).map(([key,value])=>[key.trim(),value.trim()]));
    // Longest whole phrase wins. Atomic mineral/unit labels can also precede
    // a column suffix or link arrow, but never match inside a Chinese word.
    const phrases = Object.keys(dictionary).filter(key=>cjk.test(key)&&key.length>1).sort((a,b)=>b.length-a.length);
    const pattern = phrases.length ? new RegExp(phrases.map(escapeRE).join('|'),'g') : null;
    const atoms=Object.keys(dictionary).filter(key=>cjk.test(key)&&key.length===1&&!['是','否'].includes(key));
    const atomicPattern=atoms.length?new RegExp('(?<![\\u3400-\\u9fff])('+atoms.map(escapeRE).join('|')+')(?![\\u3400-\\u9fff])','g'):null;
    const cache = new Map();
    function translate(value) {
      const raw = String(value ?? '');
      if(!cjk.test(raw))return raw;
      if(cache.has(raw))return cache.get(raw);
      const key=raw.trim(),prefix=raw.slice(0,raw.indexOf(key)),suffix=raw.slice(raw.indexOf(key)+key.length);
      let result=dictionary[key];
      if(result==null) {
        result=key
          .replace(/背景报告《([^》]+)》( PDF 第([\d、, ]+)页)?；解释口径，数值以当前 Excel 为准。/g,(_,title,_pagePart,pages)=>`Research report: ${translate(title)}${pages?', PDF pp. '+pages.replace(/、/g,', '):''}. Definitions and context; values come from the current workbook.`)
          .replace(/^找到 (\d+) 个字段$/, 'Found $1 fields')
          .replace(/^已选 (\d+) \/ (\d+) 个实体$/, '$1 / $2 entities selected')
          .replace(/^比较已选（(\d+) \/ (\d+)） →$/, 'Compare selected ($1 / $2) →')
          .replace(/^（(\d+) \/ (\d+) 个原字段）$/, '($1 / $2 workbook fields)')
          .replace(/^(\d+) 行 · (\d+) 个显示列$/, '$1 rows · $2 displayed columns')
          .replace(/PDF 第([\d、, ]+)页/g, (_,pages)=>'PDF pp. '+pages.replace(/、/g,', '))
          .replace(/^(.+)：指标含义$/,(_,name)=>translate(name)+': field meaning')
          .replace(/^查看(.+)的定义$/, (_,name)=>'Definition: '+translate(name))
          .replace(/^选择(.+)的(.+)$/,(_,sheet,field)=>'Select '+translate(sheet)+' — '+translate(field))
          .replace(/^移除比较字段(.+)的(.+)$/,(_,sheet,field)=>'Remove comparison field: '+translate(sheet)+' — '+translate(field))
          .replace(/^(.+)的领域结构$/, (_,name)=>translate(name)+' — domain profile');
        result=result.replace(/^(.+)完整数据表$/,(_,sheet)=>translate(sheet)+' — full data table')
          .replace(/^(.+)领域说明( →)?$/,(_,domain,arrow)=>translate(domain)+': domain guide'+(arrow||''))
          .replace(/^移除比较实体(.+)$/,(_,entity)=>'Remove entity from comparison: '+translate(entity));
        if(pattern)result=result.replace(pattern, match=>dictionary[match]);
        if(atomicPattern)result=result.replace(atomicPattern, match=>dictionary[match]);
        result=result.replace(/([A-Z]+) 列/g,'column $1').replace(/(\d+) 项(?=$|[）·])/g,'$1 items');
        result=result.replace(/，/g,', ').replace(/。/g,'. ').replace(/；/g,'; ').replace(/：/g,': ').replace(/（/g,' (').replace(/）/g,')').replace(/、/g,', ').replace(/《/g,'“').replace(/》/g,'”').trim();
        result=result.replace(/\b1 entities\b/g,'1 entity').replace(/\b1 fields\b/g,'1 field').replace(/\b1 items\b/g,'1 item').replace(/\b1 rows\b/g,'1 row').replace(/\b1 columns\b/g,'1 column').replace(/\b1 original fields\b/g,'1 original field');
      }
      result=prefix+result+suffix;
      cache.set(raw,result);
      return result;
    }
    return translate;
  }
  function searchText(value,translate) {
    const source=String(value??'');
    return (source+' '+translate(source)).toLocaleLowerCase();
  }
  return {selectLanguage,languageURL,createTranslator,searchText};
})();

if(typeof window!=='undefined'&&typeof document!=='undefined') {
  (()=>{
    let preference;
    try{preference=localStorage.getItem('np-language');}catch{}
    const language=NP_I18N_CORE.selectLanguage(location.search,preference);
    const translate=NP_I18N_CORE.createTranslator(window.NP_EN||{});
    const activeText=value=>language==='en'?translate(value):String(value??'');
    window.NP_I18N={language,translate:activeText,searchText:value=>NP_I18N_CORE.searchText(value,translate)};
    document.documentElement.lang=language==='en'?'en':'zh-CN';
    try{localStorage.setItem('np-language',language);}catch{}
    // Make English links explicit, including links copied from the address bar.
    if(language==='en'&&!new URLSearchParams(location.search).has('lang'))history.replaceState(history.state,'',NP_I18N_CORE.languageURL(location.href,'en'));
    const switcher=document.getElementById('language-switch');
    if(switcher){
      const target=language==='en'?'zh':'en';
      switcher.textContent=language==='en'?'中文':'English';
      switcher.lang=target==='en'?'en':'zh-CN';switcher.hreflang=switcher.lang;
      switcher.setAttribute('aria-label',language==='en'?'Switch to Chinese':'Switch to English');
      switcher.href=NP_I18N_CORE.languageURL(location.href,target);
      switcher.addEventListener('click',event=>{
        if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        event.preventDefault();
        window.dispatchEvent(new Event('np-language-change'));
        try{localStorage.setItem('np-language',target);}catch{}
        // Same history entry: filters, expanded sections and scroll restore on reload.
        history.replaceState(history.state,'',NP_I18N_CORE.languageURL(location.href,target));
        location.reload();
      });
      const refreshHref=()=>{switcher.href=NP_I18N_CORE.languageURL(location.href,target);};
      window.addEventListener('hashchange',refreshHref);
      window.addEventListener('popstate',refreshHref);
      window.addEventListener('np-route-change',refreshHref);
    }
    if(language!=='en')return;
    const attributes=['aria-label','title','placeholder','alt'];
    const excluded='script,style,code,textarea,noscript,[data-original],#language-switch';
    function localizeNode(node) {
      if(node.nodeType===3){
        if(node.parentElement&&!node.parentElement.closest(excluded)){
          const value=activeText(node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value;
        }
        return;
      }
      if(node.nodeType!==1&&node.nodeType!==9)return;
      if(node.nodeType===1){
        if(node.matches(excluded))return;
        for(const name of attributes)if(node.hasAttribute(name)){
          const source=node.getAttribute(name),value=activeText(source);if(value!==source)node.setAttribute(name,value);
        }
      }
      for(const child of [...node.childNodes])localizeNode(child);
    }
    const observer=new MutationObserver(records=>{
      observer.disconnect();
      for(const record of records){
        if(record.type==='childList')for(const node of record.addedNodes)localizeNode(node);
        else if(record.type==='characterData')localizeNode(record.target);
        else if(record.type==='attributes')localizeNode(record.target);
      }
      observe();
    });
    function observe(){observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:attributes});}
    localizeNode(document.documentElement);
    const description=document.querySelector('meta[name="description"]');
    if(description)description.content='Explore national long-term capacity rankings across eight domains. Compare entities, inspect workbook records and read the research method.';
    const brand=document.querySelector('.brand-title');
    if(brand){brand.firstChild.nodeValue='National Power';brand.querySelector('span').textContent='Long-term Capacity Rankings';}
    observe();
  })();
}
