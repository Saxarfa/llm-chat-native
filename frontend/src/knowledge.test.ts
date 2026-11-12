import {describe,it,expect} from 'vitest';
import {knowledgeSelection} from './knowledge';
import {sourceCitations} from './citations';
import {presetOverrides,withoutPreset} from './workspacePreset';
import {toolActivity,toolLabel} from './toolActivity';

describe('knowledge integration',()=>{
 it('normalizes old presets and copies selection without sharing mutable arrays',()=>{
  expect(knowledgeSelection()).toEqual({enabled:false,collections:[],strict:false});
  const selection={enabled:true,collections:['a'],strict:true};
  const over=presetOverrides({id:'preset',name:'Lore',cover:'',model_id:'model',config:{},image_settings:{},knowledge:selection});
  selection.collections.push('b');expect(over.knowledge.collections).toEqual(['a']);
  expect(withoutPreset(over).knowledge).toBeUndefined();
 });
 it('links verified local chunk citations without enabling arbitrary relative URLs',()=>{
  const source={kind:'knowledge' as const,chunk_id:'12345678-1234-1234-1234-123456789abc',title:'Lore',url:'/api/knowledge/chunks/id'};
  const tree:any={tagName:'p',children:[{type:'text',value:'Ответ [1] [2]'}]};
  sourceCitations([source,{url:'/admin/delete',title:'Bad'}])()(tree);
  const link=tree.children.find((n:any)=>n.tagName==='a');
  expect(link.properties['data-source-index']).toBe(0);
  expect(tree.children.filter((n:any)=>n.tagName==='a')).toHaveLength(1);
 });
 it('labels search and read tools visibly',()=>{
  expect(toolLabel('search_knowledge')).toBe('Поиск в базе знаний');
  expect(toolActivity([{id:'1',name:'search_knowledge',status:'completed',result_count:3}]).kind).toBe('source');
  expect(toolActivity([{id:'1',name:'search_knowledge',status:'completed',result_count:3}]).label).toBe('Поиск в базе завершён');
 });
});
