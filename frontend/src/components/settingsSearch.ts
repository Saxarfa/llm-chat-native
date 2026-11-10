// Only UI labels are indexed; account values, tokens and connection secrets never enter search.
export const settingsSearchItems = [
 ['appearance','Тема интерфейса','Тёмная светлая OLED системная оформление цвет'],
 ['appearance','Шрифт ответов','Текст гарнитура serif sans'],
 ['appearance','Размер текста','Масштаб размер ответа шрифт'],
 ['appearance','Размер интерфейса','Компактный обычный крупный масштаб меню кнопки'],
 ['appearance','Следовать за ответом','Автопрокрутка прокрутка чат'],
 ['appearance','Автоматические названия чатов','Заголовки переименование диалогов'],
 ['appearance','Варианты продолжения','Предложения подсказки чат'],
 ['appearance','Пружинные жесты','Анимация шторка жесты плавность физика движение'],
 ['appearance','Логотип приложения','Картинка бренд иконка'],
 ['account','Отображаемое имя','Профиль аккаунт имя пользователя'],
 ['account','Загрузить фото','Профиль аватар изображение'],
 ['account','Логин','Аккаунт имя вход'],
 ['account','Выйти из аккаунта','Выход профиль'],
 ['connection','Адрес API','Подключение локальный сервер llama.cpp llama-swap endpoint'],
 ['connection','Ключ API','Подключение локальный сервер авторизация'],
 ['connection','Google AI Studio','Подключение Google Gemini Gemma Argon'],
 ['connection','Gemini · веб-чат','Подключение Google Gemini Web браузер веб'],
 ['connection','Gemini · через подписку','Подключение Google Antigravity подписка'],
 ['search','Провайдер','Веб-поиск SearXNG Tavily интернет'],
 ['search','Режим для новых чатов','Веб-поиск авто всегда выключить'],
 ['search','Количество результатов','Веб-поиск источники лимит'],
 ['search','Исключённые домены','Веб-поиск чёрный список сайтов'],
 ['images','Изображения','Генерация ComfyUI чекпоинт шаги CFG семплер разрешение картинки'],
 ['memory','Использовать память','Факты предпочтения личная память'],
 ['memory','Автоматически запоминать','Память сохранение фактов'],
 ['models','Профили моделей','Модели инструкции системный промпт рассуждения температура'],
 ['system','Система и задачи','Сервисы очередь память загрузка'],
 ['data','Резервная копия','Данные экспорт скачать JSON backup архив'],
 ['data','Восстановление из файла','Данные импорт JSON восстановить'],
] as const;

const normalize=(value:string)=>value.toLocaleLowerCase('ru').replaceAll('ё','е');
export function findSettings(query:string){
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return words.length?settingsSearchItems.filter(item=>words.every(word=>normalize(item.slice(1).join(' ')).includes(word))):[];
}
