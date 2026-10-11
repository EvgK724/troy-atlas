/* TROY: connected reading and recall, with no progress before a real rating. */
(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(id,value)=>$(id).textContent=value;
const topics=new Map(CONTENT.topics.map(t=>[t.id,t]));
const people=new Map(CONTENT.people.map(t=>[t.id,t]));
const kinds={fact:'Вспомнить факт',link:'Объяснить связь',case:'Разобрать пример'};
const ids=CONTENT.cards.map(c=>c.id), key='troy-learning-v1', engine=window.TroyLearning;
let mode='atlas',topic='place',phase='VI',person='achilles',story=1,bridge=CONTENT.connections[0].id,node='all';
let queue=[],position=0,revealed=false,rated=0,completed=false,state={},toastTimer;
window.atlasHasUnsavedProgress=false;
function toast(message){text('#toast',message);$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function readProgress(){try{return engine.clean(JSON.parse(localStorage.getItem(key)||'{}'),ids);}catch{return {};}}
state=readProgress();
function busy(){window.atlasHasActiveReview=queue.length>0||mode==='context'&&$('#bridge-recall').open;$('#return-to-study').hidden=!(queue.length&&mode!=='learn');}
function save(){try{localStorage.setItem(key,JSON.stringify(state));window.atlasHasUnsavedProgress=false;$('#save-notice').hidden=true;}catch{window.atlasHasUnsavedProgress=true;$('#save-notice').hidden=false;text('#save-notice','Не удалось сохранить повторение в браузере. Оно осталось в памяти этой страницы. Следующая отметка повторит попытку сохранения; пока не закрывайте приложение.');toast('Повторение пока не сохранено. Не закрывайте страницу.');}}
function pressed(selector,test){$$(selector).forEach(b=>{const yes=test(b);b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});}
function source(button,sourceIds){$(button).dataset.source=sourceIds.join(',');}
function topicButtons(list,attribute='topic'){return list.map(id=>`<button type="button" data-${attribute}="${esc(id)}">${esc(topics.get(id).label)} ↗</button>`).join('');}
function setTopic(id){if(!topics.has(id))return;topic=id;const t=topics.get(id);pressed('#topic-list button',b=>b.dataset.topic===id);text('#topic-kicker',t.kicker);text('#topic-status',t.status);text('#topic-title',t.title);text('#topic-summary',t.summary);$('#topic-body').innerHTML=t.body.map(p=>`<p>${esc(p)}</p>`).join('');text('#topic-anchor',t.anchor);$('#topic-neighbours').innerHTML=topicButtons(t.links);source('#topic-source',t.sources);}
function setPhase(id){const p=CONTENT.phases.find(p=>p.id===id);if(!p)return;phase=id;pressed('#phase-options button',b=>b.dataset.phaseOption===id);text('#phase-date',p.date);text('#phase-title',p.title);text('#phase-text',p.text);text('#phase-anchor',p.anchor);source('#phase-source',p.sources);$$('svg [data-phase]').forEach(g=>g.classList.toggle('active',p.svgPhases.includes(g.dataset.phase)));}
function setStory(index){if(!CONTENT.story[index])return;story=index;const s=CONTENT.story[index];pressed('#story-steps button',b=>Number(b.dataset.story)===index);text('#story-number',`${index+1} / ${index===0?'ДО ПОЭМЫ':index===5?'ЗА РАМКАМИ «ИЛИАДЫ»':'ВНУТРИ «ИЛИАДЫ»'}`);text('#story-title',s.title);text('#story-text',s.text);text('#story-anchor',s.anchor);source('#story-source',s.sources);}
function setPerson(id){const p=people.get(id);if(!p)return;person=id;pressed('#people-picker button',b=>b.dataset.person===id);text('#person-monogram',p.name[0]);text('#person-side',p.side);text('#person-name',p.name);text('#person-role',p.role);text('#person-text',p.text);$('#person-links').innerHTML=p.links.map(l=>`<button type="button" data-person="${esc(l.id)}"><strong>${esc(people.get(l.id).name)} ↗</strong><span>${esc(l.label)}</span></button>`).join('');source('#person-source',p.sources);}
function visibleBridges(){return CONTENT.connections.filter(b=>node==='all'||b.from===node||b.to===node);}
function renderBridges(){const list=visibleBridges();if(!list.some(b=>b.id===bridge))bridge=list[0].id;$('#bridge-list').innerHTML=list.map(b=>`<button type="button" data-bridge="${esc(b.id)}"><span>${esc(topics.get(b.from).label)} → ${esc(topics.get(b.to).label)}</span>${esc(b.title)}</button>`).join('');setBridge(bridge);}
function setBridge(id){const b=CONTENT.connections.find(b=>b.id===id);if(!b)return;bridge=id;pressed('#bridge-list button',x=>x.dataset.bridge===id);$('#bridge-endpoints').innerHTML=topicButtons([b.from])+'<span>↔</span>'+topicButtons([b.to]);text('#bridge-title',b.title);text('#bridge-explanation',b.explanation);$('#bridge-explanation').hidden=true;text('#bridge-prompt',b.prompt);text('#bridge-answer',b.answer);$('#bridge-answer').hidden=true;$('#reveal-bridge').hidden=false;$('#reveal-bridge').setAttribute('aria-expanded','false');$('#bridge-recall').open=true;source('#bridge-source',b.sources);$$('[data-node]').forEach(e=>{e.classList.toggle('active',e.dataset.node===node);e.classList.toggle('related',[b.from,b.to].includes(e.dataset.node));e.setAttribute('aria-pressed',String(e.dataset.node===node));});requestAnimationFrame(drawGraph);busy();}
function drawGraph(){const rect=$('#context-graph').getBoundingClientRect();if(!rect.width||!rect.height)return;const current=CONTENT.connections.find(b=>b.id===bridge);const points={};$$('[data-node]').forEach(el=>{const r=el.getBoundingClientRect();points[el.dataset.node]={x:r.left-rect.left+r.width/2,y:r.top-rect.top+r.height/2};});$('#context-lines').setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);$('#context-lines').innerHTML=CONTENT.connections.map(b=>{const a=points[b.from],z=points[b.to],active=b===current;return `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" stroke="${active?'#e6bb7e':'#4e756e'}" stroke-width="${active?3:1.3}" opacity="${active?1:.5}" ${active?'':'stroke-dasharray="5 6"'}/>`;}).join('');}
function renderMode(){['atlas','context','learn'].forEach(m=>$('#'+m+'-view').hidden=m!==mode);$$('.main-nav [data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);if(b.dataset.mode===mode)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(mode==='learn')renderLearn();if(mode==='context')requestAnimationFrame(drawGraph);busy();}
function urlState(hash,replace=false){const u=new URL(location.href);u.searchParams.set('mode',mode);u.searchParams.set('topic',topic);u.searchParams.set('phase',phase);u.searchParams.set('person',person);u.searchParams.set('bridge',bridge);u.searchParams.set('node',node);u.searchParams.set('story',String(story));u.hash=hash||'';try{history[replace?'replaceState':'pushState'](null,'',u);}catch{}}
function goMode(next,scroll=true){mode=next;renderMode();urlState();if(scroll)window.scrollTo({top:0,behavior:'instant'});}
function goTopic(id){if(!topics.has(id))return;setTopic(id);mode='atlas';renderMode();urlState('explore');$('#explore').scrollIntoView({block:'start',behavior:'instant'});}
function restoreRoute(){const p=new URLSearchParams(location.search);mode=['atlas','context','learn'].includes(p.get('mode'))?p.get('mode'):'atlas';setTopic(p.get('topic')||'place');setPhase(p.get('phase')||'VI');setPerson(p.get('person')||'achilles');setStory(p.has('story')?Number(p.get('story')):1);node=topics.has(p.get('node'))?p.get('node'):'all';bridge=CONTENT.connections.some(b=>b.id===p.get('bridge'))?p.get('bridge'):CONTENT.connections[0].id;renderBridges();renderMode();}
function showSources(sourceIds){$('#sources-list').innerHTML=[...new Set(sourceIds)].filter(id=>SOURCES[id]).map(id=>{const s=SOURCES[id];return `<article class="source-item"><span class="eyebrow">${esc(s.type)}</span><h3><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></h3><p>${esc(s.supports)}</p>${s.note?`<p class="caption">${esc(s.note)}</p>`:''}</article>`;}).join('');$('#sources-dialog').showModal();}
function filters(){return {topic:$('#study-topic').value,kind:$('#study-kind').value};}
function stats(){const f=filters(),all=engine.select(CONTENT.cards,state,{...f,all:true}),ready=engine.select(CONTENT.cards,state,f);text('#due-count',ready.filter(c=>state[c.id]).length);text('#seen-count',all.filter(c=>state[c.id]).length);text('#total-count',all.length);const fresh=ready.filter(c=>!state[c.id]).length;text('#review-ready-note',ready.length?`Сейчас доступны: ${ready.length}. Новых карточек: ${fresh}. Можно остановиться в любой момент.`:'В этой подборке сейчас нет новых или ожидающих повторения карточек. Можно открыть её целиком.');$('#start-review').disabled=!ready.length;$('#practice-all').disabled=!all.length;}
function renderLearn(){stats();$('#learn-overview').hidden=!!queue.length||completed;$('#review-session').hidden=!queue.length;$('#review-complete').hidden=!completed;}
function renderCard(){const c=queue[position];if(!c)return;text('#session-position',`${position+1} / ${queue.length}`);text('#card-kind',kinds[c.kind]);text('#card-topic',topics.get(c.topic).label);text('#card-question',c.q);text('#card-answer',c.a);text('#card-detail',c.detail);text('#card-anchor',c.anchor);$('#card-context').innerHTML=topicButtons([...new Set([c.topic,...c.related])]);source('#answer-source',c.sources);$('#card-back').hidden=!revealed;$('#rating-buttons').hidden=!revealed;$('#reveal-answer').hidden=revealed;$('#reveal-answer').setAttribute('aria-expanded',String(revealed));const days=engine.nextDays(state[c.id]);text('#good-interval',`через ${days} ${days===1?'день':days===3?'дня':'дней'}`);busy();}
function begin(all=false){if(queue.length){goMode('learn');toast('Продолжаем открытую карточку. Чтобы сменить подборку, завершите текущее повторение.');return;}state=engine.merge(state,readProgress(),ids);queue=engine.select(CONTENT.cards,state,{...filters(),all});if(!queue.length){stats();toast('В этой подборке сейчас нет карточек для повторения.');return;}position=0;rated=0;revealed=false;completed=false;renderCard();goMode('learn');$('#card-question').tabIndex=-1;$('#card-question').focus({preventScroll:true});}
function finish(manual=false){queue=[];revealed=false;completed=!manual;renderLearn();busy();if(!manual)text('#review-summary',window.atlasHasUnsavedProgress?`Вы отметили ${rated} карточек. Сохранение в браузере пока недоступно — не закрывайте страницу.`:`Вы отметили ${rated} карточек. Следующие повторы появятся в своё время. Можно вернуться к атласу или выбрать другую тему.`);window.scrollTo({top:0,behavior:'instant'});}
function rate(grade){if(!queue.length||!revealed)return;const c=queue[position];revealed=false;state=engine.merge(state,readProgress(),ids);try{state[c.id]=engine.rate(state[c.id],grade);}catch{revealed=true;toast('Не удалось записать отметку. Проверьте дату и время устройства.');return;}save();rated++;position++;if(position>=queue.length)finish();else{renderCard();$('#card-question').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}}
$('#topic-list').innerHTML=CONTENT.topics.map((t,i)=>`<button type="button" data-topic="${esc(t.id)}"><span class="topic-index">0${i+1}</span>${esc(t.label)}</button>`).join('');
$('#phase-options').innerHTML=CONTENT.phases.map(p=>`<button type="button" data-phase-option="${esc(p.id)}">${esc(p.label)}</button>`).join('');
$('#story-steps').innerHTML=CONTENT.story.map((s,i)=>`<button type="button" data-story="${i}"><span>0${i+1}</span><b>${esc(i===3?'Ахилл в бою':s.title)}</b></button>`).join('');
$('#people-picker').innerHTML=CONTENT.people.map(p=>`<button type="button" data-person="${esc(p.id)}">${esc(p.name)}</button>`).join('');
$('#context-nodes').innerHTML=CONTENT.topics.map((t,i)=>`<button type="button" class="context-node" data-node="${esc(t.id)}"><span>0${i+1}</span>${esc(t.label)}</button>`).join('');
$('#study-topic').innerHTML+=[...topics.values()].map(t=>`<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
// A save failure remains visible while the user reads or trains.
$('#main-content').prepend($('#save-notice'));
document.addEventListener('click',event=>{const b=event.target.closest('button,a');if(!b)return;
if(b.dataset.mode){event.preventDefault();goMode(b.dataset.mode);}
else if(b.dataset.topic){event.preventDefault();goTopic(b.dataset.topic);}
else if(b.dataset.phaseOption){setPhase(b.dataset.phaseOption);urlState('time');}
else if(b.dataset.person){setPerson(b.dataset.person);urlState('people');}
else if(b.dataset.story){setStory(Number(b.dataset.story));urlState('story');}
else if(b.dataset.node){node=b.dataset.node;renderBridges();urlState();}
else if(b.dataset.bridge){setBridge(b.dataset.bridge);urlState();$('#bridge-panel').scrollIntoView({behavior:'instant',block:'start'});}
else if(b.dataset.source)showSources(b.dataset.source.split(','));
else if(b.dataset.grade)rate(b.dataset.grade);
else if(b.classList.contains('close-dialog'))b.closest('dialog').close();
});
$('#all-connections').onclick=()=>{node='all';renderBridges();urlState();};
$('#reveal-bridge').onclick=()=>{$('#bridge-answer').hidden=false;$('#bridge-explanation').hidden=false;$('#reveal-bridge').hidden=true;$('#reveal-bridge').setAttribute('aria-expanded','true');};
$('#bridge-recall').addEventListener('toggle',busy);
$('#all-sources').onclick=()=>showSources(Object.keys(SOURCES));
$('#about-button').onclick=()=>$('#about-dialog').showModal();
$('.qr-trigger').onclick=()=>$('#qr-dialog').showModal();
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText('https://evgk724.github.io/troy-atlas/');toast('Ссылка скопирована.');}catch{toast('Нажмите и удерживайте ссылку над кнопкой, чтобы скопировать.');}};
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#text-size').value=document.documentElement.dataset.textSize;
$('#text-size').onchange=()=>{document.documentElement.dataset.textSize=$('#text-size').value;try{localStorage.setItem('troy-text-size',$('#text-size').value);}catch{toast('Размер изменён для этой страницы. Браузер не разрешает сохранить настройку.');}requestAnimationFrame(drawGraph);};
$('#study-topic').onchange=stats;$('#study-kind').onchange=stats;
$('#start-review').onclick=()=>begin();$('#practice-all').onclick=()=>begin(true);
$('#train-topic').onclick=()=>{$('#study-topic').value=topic;$('#study-kind').value='all';begin(true);};
$('#train-links').onclick=()=>{$('#study-topic').value=node;$('#study-kind').value='link';begin(true);};
$('#resume-review').onclick=()=>goMode('learn');$('#end-review').onclick=()=>finish(true);$('#return-overview').onclick=()=>{completed=false;renderLearn();};
$('#reveal-answer').onclick=()=>{if(!queue.length)return;revealed=true;renderCard();$('#card-answer').tabIndex=-1;$('#card-answer').focus({preventScroll:true});};
addEventListener('storage',e=>{if(e.key===key){state=engine.merge(state,readProgress(),ids);stats();}});
addEventListener('popstate',restoreRoute);
new ResizeObserver(drawGraph).observe($('#context-nodes'));
// Vector viewer: zoom around the centre and pan within the artwork bounds.
const viewport=$('#diagram-viewport'),art=$('#diagram-art'),viewer=$('#troy-viewer'),viewerDialog=$('#viewer-dialog');
let zoom=1,panX=0,panY=0,drag=null,view='city',placeholder=null;
const notes={city:'Схема укреплённой цитадели: наклонные стены, вход и внутренние здания. План и пропорции условны; это не реконструкция конкретного слоя.',layers:'I–IX — крупные фазы заселения. Выделенный слой можно выбрать в разделе «Хронология». Толщина полос условна.',place:'Схема связей Эгейского моря, Дарданелл и Мраморного моря. Не в масштабе; древняя береговая линия не реконструирована.'};
function transform(){const maxX=viewport.clientWidth*(zoom-1)/2,maxY=viewport.clientHeight*(zoom-1)/2;panX=Math.max(-maxX,Math.min(maxX,panX));panY=Math.max(-maxY,Math.min(maxY,panY));art.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;viewport.classList.toggle('zoomed',zoom>1);$('#diagram-zoom').value=String(zoom*100);text('#zoom-label',`${Number(zoom.toFixed(2))}×`);$('#zoom-out').disabled=zoom<=1;$('#zoom-in').disabled=zoom>=3;}
function changeZoom(value){zoom=Math.max(1,Math.min(3,value));transform();}
$$('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;pressed('[data-view]',e=>e===b);$$('[data-diagram]').forEach(d=>d.hidden=d.dataset.diagram!==view);text('#viewer-note',notes[view]);changeZoom(1);});
$('#diagram-zoom').oninput=()=>changeZoom(Number($('#diagram-zoom').value)/100);$('#zoom-in').onclick=()=>changeZoom(zoom+.25);$('#zoom-out').onclick=()=>changeZoom(zoom-.25);$('#reset-viewer').onclick=()=>changeZoom(1);
viewport.addEventListener('pointerdown',e=>{if(zoom<=1||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,panX,panY};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;panX=drag.panX+e.clientX-drag.x;panY=drag.panY+e.clientY-drag.y;transform();});
const stopDrag=()=>{drag=null;viewport.classList.remove('dragging');};viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);viewport.addEventListener('lostpointercapture',stopDrag);
viewport.addEventListener('keydown',e=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')changeZoom(zoom+.25);if(e.key==='-')changeZoom(zoom-.25);if(e.key==='0')changeZoom(1);if(e.key==='ArrowLeft')panX-=35;if(e.key==='ArrowRight')panX+=35;if(e.key==='ArrowUp')panY-=35;if(e.key==='ArrowDown')panY+=35;transform();}});
$('#viewer-context').onclick=()=>goTopic(view==='place'?'place':'layers');
$('#expand-viewer').onclick=()=>{if(viewerDialog.open){viewerDialog.close();return;}placeholder=document.createComment('viewer position');viewer.before(placeholder);viewerDialog.append(viewer);$('#expand-viewer').setAttribute('aria-label','Свернуть схему');$('#expand-viewer').setAttribute('aria-expanded','true');viewerDialog.showModal();transform();};
viewerDialog.addEventListener('close',()=>{if(placeholder){placeholder.replaceWith(viewer);placeholder=null;}$('#expand-viewer').setAttribute('aria-label','Развернуть схему');$('#expand-viewer').setAttribute('aria-expanded','false');transform();requestAnimationFrame(()=>$('#expand-viewer').focus({preventScroll:true}));});
new ResizeObserver(transform).observe(viewport);
restoreRoute();transform();
})();
