// Local font stacks keep reading available offline, with Cyrillic fallbacks.
export const readingFonts = [
 {id:'serif',label:'Georgia · книжный',family:"Georgia, 'Times New Roman', serif"},
 {id:'inter',label:'Inter · современный',family:"'Inter Variable', Inter, system-ui, 'Segoe UI', Arial, sans-serif"},
 {id:'sans',label:'Arial · нейтральный',family:'Arial, Helvetica, sans-serif'},
 {id:'system',label:'Системный · современный',family:"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"},
 {id:'apple',label:'San Francisco · Apple',family:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI Variable Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"},
 {id:'humanist',label:'Trebuchet · мягкий',family:"'Trebuchet MS', 'Segoe UI', Arial, sans-serif"},
 {id:'verdana',label:'Verdana · широкий',family:'Verdana, Geneva, sans-serif'},
 {id:'classic',label:'Times · классический',family:"'Times New Roman', Times, serif"},
 {id:'mono',label:'Моноширинный',family:"'JetBrains Mono Variable', 'Cascadia Code', Consolas, Menlo, monospace"},
 {id:'tahoma',label:'Tahoma · компактный',family:'Tahoma, Geneva, Arial, sans-serif'},
 {id:'segoe',label:'Segoe UI · интерфейсный',family:"'Segoe UI', system-ui, -apple-system, sans-serif"},
 {id:'cambria',label:'Cambria · выразительный',family:"Cambria, Georgia, 'Times New Roman', serif"},
 {id:'palatino',label:'Palatino · литературный',family:"'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif"},
 {id:'courier',label:'Courier · печатная машинка',family:"'Courier New', Courier, monospace"},
] as const;
export function readingFontFamily(id:string){return readingFonts.find(font=>font.id===id)?.family??readingFonts[0].family}
