import {describe,it,expect} from 'vitest';
import {imageModelAlignment,imageModelName,imageModelEngine,isNoctQ,isAnima29B,isAnima38B} from './imageModels';
import {defaultImageLoras} from '../imageLoras';
describe('image model architectures',()=>{
 it('routes installed Illustrious and Pony checkpoints through SDXL',()=>{
  for(const model of ['waiIllustriousSDXL_v170.safetensors','prefectIllustriousXL_v8.safetensors','cyberrealisticPony_v180Coreshift.safetensors']){
   expect(imageModelEngine('folder/'+model)).toBe('sdxl');
   expect(defaultImageLoras(model)).toEqual([]);
   expect(imageModelName(model)).not.toContain('.safetensors');
  }
 });
 it('keeps MiaoMiao in its SDXL family with no legacy Anima adapters',()=>{
  const model='folder/miaomiaoRealskin_cknEPSVE10.safetensors';
  expect(imageModelEngine(model)).toBe('sdxl');
  expect(imageModelName(model)).toBe('MiaoMiao RealSkin · EPS VE1.0');
  expect(defaultImageLoras(model)).toEqual([]);
  expect(imageModelAlignment(model)).toBe(8);
 });
 it('keeps the bundled 3.8B architecture separate from legacy LoRAs',()=>{
  const model='folder\\Anima-3.8B-v1.1.safetensors';
  expect(isAnima38B(model)).toBe(true);
  expect(imageModelEngine(model)).toBe('anima-38b');
  expect(imageModelName(model)).toBe('Anima 3.8B · v1.1');
  expect(defaultImageLoras(model)).toEqual([]);
  expect(isAnima38B('anima_aestheticV11.safetensors')).toBe(false);
 });
 it('labels the additional Anima without changing existing choices',()=>{
  expect(isAnima29B('folder/Anima-2.9B-preview-v1.safetensors')).toBe(true);
  expect(imageModelName('Anima-2.9B-preview-v1.safetensors')).toBe('Anima 2.9B · Preview V1');
  expect(imageModelAlignment('Anima-2.9B-preview-v1.safetensors')).toBe(8);
  expect(imageModelName('anima_aestheticV11.safetensors')).toBe('anima_aestheticV11');
 });
 it('recognizes the installed Noct Q without treating unrelated weights as compatible',()=>{
  expect(isNoctQ('folder/NoctQA_V1_int8_convrot.safetensors')).toBe(true);
  expect(isNoctQ('qwen_image_2.1_bf16.safetensors')).toBe(false);
  expect(imageModelAlignment('NoctQA_V1_int8_convrot.safetensors')).toBe(32);
  expect(imageModelAlignment('anima_aestheticV11.safetensors')).toBe(8);
  expect(imageModelName('NoctQA_V1_int8_convrot.safetensors')).toBe('Noct Q Anime · INT8');
 });
});
