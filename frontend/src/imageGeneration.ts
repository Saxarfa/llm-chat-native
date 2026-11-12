export type ImageGenerationPreference={source:'default'|'local'|'aistudio';local_model:string;aspect_ratio:string;image_size:string;allow_auto_4k?:boolean};
export const imageAspectRatios=['auto','1:1','1:4','1:8','2:3','3:2','3:4','4:1','4:3','4:5','5:4','8:1','9:16','16:9','21:9'];
export const imageOutputSizes=['512','1K','2K','4K'];
export function imageGenerationPreference(value?:Partial<ImageGenerationPreference>|null):ImageGenerationPreference{
 return {source:value?.source||'default',local_model:value?.local_model||'',aspect_ratio:value?.aspect_ratio||'auto',image_size:value?.image_size||'1K',allow_auto_4k:value?.allow_auto_4k===true};
}
