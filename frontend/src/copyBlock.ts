const textLabels:Record<string,string>={
 '':'Текст',text:'Текст',txt:'Текст',plaintext:'Текст',
 prompt:'Промпт',positive_prompt:'Промпт','positive-prompt':'Промпт',
 negative_prompt:'Негативный промпт','negative-prompt':'Негативный промпт',
 system_prompt:'Системный промпт','system-prompt':'Системный промпт',
};
export function copyBlockLabel(language:string){return textLabels[language.toLowerCase()]}
