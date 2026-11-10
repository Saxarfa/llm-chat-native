import type {Message,Metrics} from './types';
export function estimateTokens(text:string){
 const russian=(text.match(/[а-яё]/gi)||[]).length;
 return text?Math.max(1,Math.round(russian/1.7+(text.length-russian)/3.7)):0;
}
export function answerUsage(message:Pick<Message,'content'|'reasoning'|'metrics'>):Metrics{
 const metrics=message.metrics||{};
 if(metrics.statsVersion===2)return metrics;
 const emitted=message.content+(message.reasoning||'');
 const broken=metrics.tokens!=null&&metrics.tokens<Math.max(1,Math.floor(emitted.length/20));
 // Historical records cannot be reconstructed exactly from visible text.
 return {...metrics,responseTokens:estimateTokens(message.content),responseEstimated:true,
  reasoningTokens:estimateTokens(message.reasoning||''),reasoningEstimated:true,
  tokens:broken?Math.max(estimateTokens(emitted),metrics.previousToolTokens||0):(metrics.tokens==null?undefined:metrics.tokens+(metrics.previousToolTokens||0)),
  estimated:broken||metrics.estimated,speed:broken?undefined:metrics.speed};
}
