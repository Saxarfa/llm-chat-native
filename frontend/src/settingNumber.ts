export function settingNumber(value:number,step:number){
 return Number((Math.round(value/step)*step).toFixed(8));
}
