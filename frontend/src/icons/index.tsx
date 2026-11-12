import {forwardRef,type ForwardRefExoticComponent,type RefAttributes,type SVGProps} from 'react';
import {glyphs} from './f7Glyphs';

/**
 * Иконки интерфейса — Framework7 Icons (MIT), рисунок в духе SF Symbols.
 * Имена экспорта совпадают с прежними lucide-react, чтобы замена была точечной.
 * Глифы залитые (без штриха) и лежат в сетке 56×56; `strokeWidth` принимается и
 * игнорируется. `fill` (не `none`) включает залитый вариант, если он объявлен.
 * Новую иконку: добавить строку `icon(...)` ниже и запустить
 * `node tools/gen_f7_icons.cjs` — он пересоберёт `f7Glyphs.ts`.
 */
export type IconProps=Omit<SVGProps<SVGSVGElement>,'ref'>&{size?:number|string;strokeWidth?:number|string;absoluteStrokeWidth?:boolean};
export type IconComponent=ForwardRefExoticComponent<IconProps&RefAttributes<SVGSVGElement>>;

function icon(name:string,glyph:keyof typeof glyphs,filled?:keyof typeof glyphs):IconComponent{
 const Icon=forwardRef<SVGSVGElement,IconProps>(function Icon({size=24,className,fill,strokeWidth:_stroke,absoluteStrokeWidth:_absolute,children:_children,...rest},ref){
  const body=filled&&fill&&fill!=='none'?glyphs[filled]:glyphs[glyph];
  const labelled=!!(rest['aria-label']||rest['aria-labelledby']);
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 56 56" fill="currentColor" stroke="none" focusable="false" role={labelled?'img':undefined} aria-hidden={labelled?undefined:true} {...rest} data-icon={name} className={className?`app-icon f7-icon ${className}`:'app-icon f7-icon'} dangerouslySetInnerHTML={{__html:body}}/>;
 });
 Icon.displayName=name;
 return Icon;
}

/** Индикатор загрузки — единственная штриховая иконка: у F7 нет спиннера. */
export const Loader2:IconComponent=forwardRef<SVGSVGElement,IconProps>(function Loader2({size=24,className,strokeWidth:_stroke,absoluteStrokeWidth:_absolute,fill:_fill,...rest},ref){
 const labelled=!!(rest['aria-label']||rest['aria-labelledby']);
 return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" focusable="false" role={labelled?'img':undefined} aria-hidden={labelled?undefined:true} {...rest} style={{strokeWidth:'var(--icon-spinner-stroke, 2.4)',...rest.style}} data-icon="loader-circle" className={className?`app-icon ${className}`:'app-icon'}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>;
});
Loader2.displayName='Loader2';

// Первый аргумент — имя для движка анимаций (desktop/icon-motion.js), второй — глиф F7.
export const AlertCircle=icon('circle-alert','exclamationmark-circle');
export const Archive=icon('archive','archivebox');
export const ArrowDown=icon('arrow-down','arrow-down');
export const ArrowLeft=icon('arrow-left','arrow-left');
export const ArrowLeftRight=icon('arrow-left-right','arrow-right-arrow-left');
export const ArrowRight=icon('arrow-right','arrow-right');
export const ArrowUp=icon('arrow-up','arrow-up');
export const ArrowUpRight=icon('arrow-up-right','arrow-up-right');
export const Bell=icon('bell','bell');
export const BellOff=icon('bell-off','bell-slash');
export const BookOpen=icon('book-open','book');
export const Bookmark=icon('bookmark','bookmark');
export const BookmarkPlus=icon('bookmark-plus','rectangle-stack-badge-plus');
export const Bot=icon('bot','person-crop-rectangle');
export const Brain=icon('brain','lightbulb');
export const ChartNoAxesColumn=icon('chart-no-axes-column','chart-bar');
export const ChartNoAxesCombined=icon('chart-no-axes-combined','graph-square');
export const Check=icon('check','checkmark');
export const CheckIcon=Check;
export const ChevronDown=icon('chevron-down','chevron-down');
export const ChevronLeft=icon('chevron-left','chevron-left');
export const ChevronRight=icon('chevron-right','chevron-right');
export const ChevronRightIcon=ChevronRight;
export const ChevronsLeftRight=icon('chevrons-left-right','chevron-left-slash-chevron-right');
export const CircleIcon=icon('circle','circle-fill');
export const Clapperboard=icon('clapperboard','film');
export const Cloud=icon('cloud','cloud');
export const Code2=icon('code-xml','chevron-left-slash-chevron-right');
export const Columns=icon('columns-2','square-split-2x1');
export const Columns2=Columns;
export const Copy=icon('copy','doc-on-doc');
export const CornerDownLeft=icon('corner-down-left','arrow-turn-down-left');
export const Cpu=icon('cpu','desktopcomputer');
export const Database=icon('database','tray-2');
export const Download=icon('download','arrow-down-to-line');
export const Eclipse=icon('eclipse','circle-lefthalf-fill');
export const Expand=icon('expand','arrow-up-left-arrow-down-right');
export const Eye=icon('eye','eye');
export const EyeOff=icon('eye-off','eye-slash');
export const Feather=icon('feather','pencil');
export const File=icon('file','doc');
export const FileDiff=icon('file-diff','plusminus');
export const FileText=icon('file-text','doc-text');
export const Film=icon('film','film');
export const Folder=icon('folder','folder');
export const FolderOpen=icon('folder-open','folder');
export const FolderPlus=icon('folder-plus','folder-badge-plus');
export const Ghost=icon('ghost','eyeglasses');
export const GitBranch=icon('git-branch','arrow-branch');
export const Globe=icon('globe','globe');
export const GraduationCap=icon('graduation-cap','book-circle');
export const GripVertical=icon('grip-vertical','line-horizontal-3');
export const History=icon('history','clock');
export const Image=icon('image','photo');
export const ImageOff=icon('image-off','exclamationmark-triangle');
export const ImagePlus=icon('image-plus','photo-on-rectangle');
export const Images=icon('images','photo-on-rectangle');
export const Info=icon('info','info-circle');
export const Languages=icon('languages','textformat-alt');
export const Layers3=icon('layers-3','square-stack-3d-up');
export const Library=icon('library','book');
export const Link2=icon('link-2','link');
export const ListChecks=icon('list-checks','text-badge-checkmark');
export const LockKeyhole=icon('lock-keyhole','lock');
export const LogOut=icon('log-out','square-arrow-right');
export const Menu=icon('menu','line-horizontal-3');
export const MessageCircle=icon('message-circle','chat-bubble');
export const MessageSquare=icon('message-square','bubble-left');
export const Mic=icon('mic','mic');
export const Minus=icon('minus','minus');
export const Monitor=icon('monitor','desktopcomputer');
export const Moon=icon('moon','moon');
export const MoreHorizontal=icon('more-horizontal','ellipsis');
export const MoreVertical=icon('more-vertical','ellipsis-vertical');
export const PanelLeft=icon('panel-left','sidebar-left');
export const PanelsTopLeft=icon('panels-top-left','uiwindow-split-2x1');
export const Pencil=icon('pencil','pencil');
export const Paperclip=icon('paperclip','paperclip');
export const Pause=icon('pause','pause');
export const Pin=icon('pin','pin');
export const PinOff=icon('pin-off','pin-slash');
export const Play=icon('play','play');
export const Plug=icon('plug','link');
export const Plus=icon('plus','plus');
export const Power=icon('power','power');
export const RefreshCw=icon('refresh-cw','arrow-clockwise');
export const Repeat=icon('repeat','repeat');
export const RotateCcw=icon('rotate-ccw','arrow-counterclockwise');
export const Scan=icon('scan','viewfinder');
export const Search=icon('search','search');
export const Settings2=icon('settings-2','slider-horizontal-3');
export const Shapes=icon('shapes','square-on-circle');
export const Share=icon('share','square-arrow-up');
export const Shield=icon('shield','shield');
export const ShieldCheck=icon('shield-check','checkmark-shield');
export const Shrink=icon('shrink','arrow-down-right-arrow-up-left');
export const SlidersHorizontal=icon('sliders-horizontal','slider-horizontal-3');
export const Sparkles=icon('sparkles','sparkles');
export const Square=icon('square','stop-fill');
export const Star=icon('star','star','star-fill');
export const Sun=icon('sun','sun-max');
export const Terminal=icon('terminal','chevron-left-slash-chevron-right');
export const Trash2=icon('trash-2','trash');
export const TriangleAlert=icon('triangle-alert','exclamationmark-triangle');
export const Undo2=icon('undo-2','arrow-uturn-left');
export const Upload=icon('upload','arrow-up-to-line');
export const UserRound=icon('user-round','person-crop-circle');
export const Video=icon('video','videocam');
export const Volume2=icon('volume-2','speaker-2');
export const WifiOff=icon('wifi-off','wifi-slash');
export const Wrench=icon('wrench','wrench');
export const X=icon('x','xmark');
export const XIcon=X;
export const ZoomIn=icon('zoom-in','zoom-in');
export const ZoomOut=icon('zoom-out','zoom-out');
