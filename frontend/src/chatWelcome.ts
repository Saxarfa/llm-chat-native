export const welcomeStarters=[
 {id:'explain',label:'Объяснить тему',short:'Объяснить',text:'Объясни простыми словами: '},
 {id:'story',label:'Придумать историю',short:'История',text:'Придумай историю о '},
 {id:'art',label:'Создать арт',short:'Создать арт',text:'Сгенерируй изображение: '},
] as const;

export function welcomeTitle(preset?:{greeting?:string}){
 return preset?.greeting?.trim()||'Над чем подумаем вместе?';
}

/** Preserve a draft the user has already written, including its attachments. */
export function insertWelcomeStarter(draft:string,starter:string){
 return draft.trim()?`${draft.trimEnd()}\n${starter}`:starter;
}

/** Choose once per welcome screen; the caller keeps the result while typing.
 *  maxLength (phone) keeps only short titles so the greeting fits one line or two. */
export function personalWelcome(name:string,hour:number,variant:number,maxLength?:number){
 const nick=name.trim();
 const addressed=(text:string)=>nick?`${text}, ${nick}`:text;
 const daytime=hour<6?'Доброй ночи':hour<12?'Доброе утро':hour<18?'Добрый день':'Добрый вечер';
 const titles=[
  `${addressed('Привет')}!`,
  `${addressed(daytime)}!`,
  nick?`${nick}, что обсудим сегодня?`:'Что обсудим сегодня?',
  nick?`С чего начнём, ${nick}?`:'С чего начнём?',
  'Над чем подумаем вместе?',
  nick?`Какие идеи, ${nick}?`:'Какие идеи?',
  `${addressed('Что у тебя на уме')}?`,
  `${addressed('О чём поговорим')}?`,
  `${addressed('Что хочется узнать')}?`,
  `${addressed('Есть вопрос')}?`,
  `${addressed('Что придумаем')}?`,
  `${addressed('Поболтаем')}?`,
  `${addressed('Что тебя заинтересовало')}?`,
  `${addressed('Над чем работаешь')}?`,
  `${addressed('Что хочется попробовать')}?`,
  `${addressed('Какие планы')}?`,
  'Разберёмся вместе?',
  'Какую тему разберём?',
  'Давай начнём с главного',
  'Найдём нужные слова?',
  'Что сделаем проще?',
  'Какая мысль не даёт покоя?',
  'Разложим всё по полочкам?',
  'Есть идея? Давай обсудим',
  'Нужен свежий взгляд?',
  'Обсудим за чашкой кофе?',
  'Соберём идею воедино?',
  'Что хочется понять?',
  'С чего начнётся история?',
  'Набросаем план?',
  'Можно начать с пары слов',
  'Место для мыслей вслух',
 ];
 const short=maxLength?titles.filter(title=>title.length<=maxLength):[];
 const pool=short.length?short:titles;
 return pool[((variant%pool.length)+pool.length)%pool.length];
}
