import {
  LayoutDashboard, Calendar, Briefcase, Clock, MapPin, Users, ShieldCheck,
  Building2, Camera, Package, Receipt, List, User, Plus, Search, X, Check,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Menu, LogOut, SquarePen,
  Trash2, TriangleAlert, Info, Sun, Moon, ListFilter, Download, RefreshCw,
  Phone, Image, Inbox, Wrench, ChartLine, KeyRound, Copy, Flag, PanelLeftClose,
  PanelLeftOpen, ArrowUpRight, ArrowDownRight, Minus, CircleCheck, CircleAlert,
  ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal, Mail, Building, LogIn,
} from 'lucide-react';

/**
 * One icon set, one stroke width, one construction grid.
 *
 * These were hand-drawn SVG paths, which drifted in optical weight — the
 * briefcase and chart glyphs were visibly cruder than the rest. Lucide gives
 * a single family on a 24px grid; the names below stay stable so call sites
 * do not change.
 *
 * Sizes are fixed to a small set. An icon beside 13px text is 14px; beside
 * body text, 16px; standalone controls, 18px. Picking arbitrary sizes is what
 * makes an interface look assembled rather than designed.
 */
const MAP = {
  dashboard: LayoutDashboard,
  calendar: Calendar,
  briefcase: Briefcase,
  clock: Clock,
  map: MapPin,
  mapPin: MapPin,
  users: Users,
  shield: ShieldCheck,
  building: Building2,
  office: Building,
  camera: Camera,
  box: Package,
  receipt: Receipt,
  list: List,
  user: User,
  plus: Plus,
  search: Search,
  x: X,
  check: Check,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  menu: Menu,
  logout: LogOut,
  login: LogIn,
  edit: SquarePen,
  trash: Trash2,
  alert: TriangleAlert,
  info: Info,
  sun: Sun,
  moon: Moon,
  filter: ListFilter,
  download: Download,
  refresh: RefreshCw,
  phone: Phone,
  mail: Mail,
  image: Image,
  inbox: Inbox,
  wrench: Wrench,
  chart: ChartLine,
  key: KeyRound,
  copy: Copy,
  flag: Flag,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  trendUp: ArrowUpRight,
  trendDown: ArrowDownRight,
  trendFlat: Minus,
  circleCheck: CircleCheck,
  circleAlert: CircleAlert,
  sort: ArrowUpDown,
  sortAsc: ArrowUp,
  sortDesc: ArrowDown,
  more: MoreHorizontal,
};

export default function Icon({ name, size = 16, className, style, strokeWidth = 1.75 }) {
  const Glyph = MAP[name];
  if (!Glyph) return null;
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    />
  );
}

export const ICON_NAMES = Object.keys(MAP);
