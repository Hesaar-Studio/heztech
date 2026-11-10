import {
  Home,
  MessageSquare,
  Bot,
  Globe,
  Satellite,
  Megaphone,
  Clapperboard,
  Target,
  BookOpen,
  Link2,
  Settings,
  Search,
  BarChart3,
  Shield,
  ShieldCheck,
  BookMarked,
  Crown,
  Plus,
  Send,
  Paperclip,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoreHorizontal,
  MoreVertical,
  Circle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Brain,
  Clock,
  FileText,
  Database,
  TrendingUp,
  User,
  Moon,
  Bell,
  Cpu,
  LayoutGrid,
  Layers,
  Radio,
  Sparkles,
  Mic,
  MicOff,
  Square,
  Eye,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';

// Custom ChessKnight icon matching user reference architecture & operations view
const ChessKnightIcon: LucideIcon = (({ size = 20, strokeWidth = 1.75, className, ...props }: any) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M19 22H5a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1Z" />
    <path d="M17 17V9.5a4.5 4.5 0 0 0-4.5-4.5H11L7 9v8" />
    <path d="M7 11h3" />
    <circle cx="10" cy="7.5" r="1" fill="currentColor" />
  </svg>
)) as unknown as LucideIcon;

const map: Record<string, LucideIcon> = {
  home: Home,
  assistant: MessageSquare,
  agents: Bot,
  web: Globe,
  social: Satellite,
  marketing: Megaphone,
  media: Clapperboard,
  missions: Target,
  knowledge: BookOpen,
  connections: Link2,
  settings: Settings,
  search: Search,
  chess: ChessKnightIcon,
  chart: BarChart3,
  shield: Shield,
  book: BookMarked,
  crown: Crown,
  plus: Plus,
  send: Send,
  attach: Paperclip,
  close: X,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  panelClose: PanelLeftClose,
  panelOpen: PanelLeft,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  fit: Maximize2,
  more: MoreHorizontal,
  moreVertical: MoreVertical,
  circle: Circle,
  alert: AlertCircle,
  check: CheckCircle2,
  loader: Loader2,
  brain: Brain,
  clock: Clock,
  fileText: FileText,
  document: FileText,
  database: Database,
  trend: TrendingUp,
  user: User,
  moon: Moon,
  bell: Bell,
  cpu: Cpu,
  grid: LayoutGrid,
  layers: Layers,
  radio: Radio,
  sparkles: Sparkles,
  shieldCheck: ShieldCheck,
  mic: Mic,
  micOff: MicOff,
  square: Square,
  eye: Eye,
  volume2: Volume2,
  volumeX: VolumeX,
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}

export function Icon({ name, size = 20, className, strokeWidth = 1.75, ...rest }: IconProps) {
  const Comp = map[name] ?? Circle;
  return <Comp size={size} className={className} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
