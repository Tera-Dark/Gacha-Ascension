/** Mainline is derived from real encounters. Reading or skipping never unlocks rewards. */
import {unlockedPack} from './modules.mjs';
import {GROWTH_TEXT,growth} from './progression.mjs';
export function storyChapter(s,c){
 const r=s.run,at=r.mapIndex*c.checkpointsPerMap+r.checkpoint+1;
 if(s.meta.reincarnations&&at===1&&!Object.values(r.draws).some(n=>n>0))return c.story.return;
 if(!s.meta.reincarnations&&at===1&&!Object.values(r.draws).some(n=>n>0))return c.story.chapters[0];
 if(at<c.features.unlockAtGlobalCheckpoint.pet&&r.cards.T003>0&&!r.pet&&unlockedPack(s,c,'pet')&&!r.draws.pet)return c.story.chapters.find(ch=>ch.when==='spirit');
 return c.story.chapters.filter(ch=>ch.at<=at&&(!ch.pack||unlockedPack(s,c,ch.pack))&&(
  !ch.when||ch.when==='draw'&&Object.values(r.draws).some(n=>n>0)||ch.when==='mob'&&r.mobKills>0||ch.when==='spirit'&&r.cards.T003>0&&!r.pet&&!r.draws.pet||ch.when==='cleared'&&r.bossCleared||ch.when==='foundation'&&r.realmIndex>=4
 )).at(-1);
}
export function storyUnlockHint(c,id){
 const chapter=c.story.chapters.find(ch=>ch.pack===id&&!ch.when),threshold=c.features.unlockAtGlobalCheckpoint[id];
 return id==='artifact'?'筑基 · 本命初成':(chapter?.title||'继续探索')+' · 第'+threshold+'关'+(id==='pet'?'，或先遇御灵功法':'');
}
export function nextStoryPack(s,c){
 const chapter=storyChapter(s,c),pack=chapter.pack;
 return pack&&unlockedPack(s,c,pack)&&!s.run.draws[pack]?pack:null;
}
export function storyHistory(s,c){
 const r=s.run,m=s.meta,furthest=Math.max(m.bestCheckpoint||1,r.mapIndex*c.checkpointsPerMap+r.checkpoint+1);
 const reached=c.story.chapters.filter(ch=>(ch.at<=furthest||ch.pack==='pet'&&unlockedPack(s,c,'pet'))&&(!ch.pack||unlockedPack(s,c,ch.pack))&&(
  !ch.when||ch.when==='draw'&&(Object.values(r.draws).some(n=>n>0)||m.dao.milestones.firstDraw)||ch.when==='mob'&&(r.mobKills>0||Object.keys(m.knowledge.enemies).some(key=>key.endsWith(':mob')))||ch.when==='spirit'&&(r.cards.T003>0||m.knowledge.cards.T003)||ch.when==='cleared'&&(r.bossCleared||m.reincarnations>0)||ch.when==='foundation'&&(r.realmIndex>=4||m.knowledge.realms>=4)
 ));
 return m.reincarnations>0?[c.story.return,...reached]:reached;
}
export function cardRevelation(card,beforeCopies=0){
 if(card.id==='D002')return '丹道命痕 · 解锁护脉叶采集与护体散配方';
 if(card.id==='D003')return '丹道命痕 · 解锁剑意花采集与剑意散配方';
 const descriptions=GROWTH_TEXT[card.id];
 if(descriptions){
  const next=growth(card.copies??beforeCopies+1),previous=growth(beforeCopies);
  return (next>previous?['','初识命痕','熟练命痕','精通命痕'][next]+' · ':'命痕相叠 · ')+descriptions[Math.max(0,next-1)];
 }
 return card.description||({attackPct:'杀伐命痕 · 提高攻击',hpPct:'养身命痕 · 提高气血',defPct:'护脉命痕 · 提高防御',allPct:'根骨命痕 · 增强攻防气血',equipment:'器物命痕 · 优先补入空装备槽',artifact:'本命法器 · 独立法器槽',insight:'悟道契机 · 用于境界突破',cave:'洞府命痕 · 改善修行经营',pet:'灵契命痕 · 参与下一场战斗',pill:'突破丹药 · 保留至突破时消耗',qiInstant:'丹道机缘 · 立即积累修为',stonePct:'聚财命痕 · 提高战斗灵石',speedPct:'身法命痕 · 缩短出手间隔',qiPct:'修行命痕 · 提高战斗修为'}[card.effect]||'新的命痕已记入见闻');
}
export function noteworthyDraw(items,copies,known){
 return items.some(card=>!['huang','xuan'].includes(card.rarity)||!known[card.id]||GROWTH_TEXT[card.id]&&growth(card.copies||1)>growth(copies[card.id]||0));
}
