import type { ReactNode } from "react";

function Icon({ children, viewBox = "0 0 24 24" }: { children: ReactNode; viewBox?: string }) {
  return <svg viewBox={viewBox} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
export const ReceiptIcon = () => <Icon><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></Icon>;
export const ReceiptLargeIcon = () => <Icon><path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5L8 20l-2 1.5v-19Z"/><path d="M9 8h6M9 12h6M9 16h3"/></Icon>;
export const CameraIcon = () => <Icon><path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/></Icon>;
export const ImageIcon = () => <Icon><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 5"/></Icon>;
export const CheckIcon = () => <Icon><path d="m5 12 4 4L19 6"/></Icon>;
export const AlertIcon = () => <Icon><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></Icon>;
export const ArrowIcon = () => <Icon><path d="M5 12h14M14 7l5 5-5 5"/></Icon>;
export const ShieldIcon = () => <Icon><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></Icon>;
export const LockIcon = () => <Icon><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Icon>;
export const HistoryIcon = () => <Icon><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></Icon>;
export const StoreIcon = () => <Icon><path d="m4 10 1-6h14l1 6M5 10v10h14V10M9 20v-6h6v6"/><path d="M3 10c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"/></Icon>;
export const BasketIcon = () => <Icon><path d="M4 9h16l-2 11H6L4 9ZM8 9l4-6 4 6M9 13v3M15 13v3"/></Icon>;
export const CardIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></Icon>;
export const CalculatorIcon = () => <Icon><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 5h8v4H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/></Icon>;
export const ChevronIcon = ({ up = false }: { up?: boolean }) => <Icon><path d={up ? "m7 15 5-5 5 5" : "m7 9 5 5 5-5"}/></Icon>;
export const DatabaseIcon = () => <Icon><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></Icon>;
export const DownloadIcon = () => <Icon><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></Icon>;
export const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></Icon>;
export const CodeIcon = () => <Icon><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></Icon>;
export const SunIcon = () => <Icon><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Icon>;
export const MoonIcon = () => <Icon><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></Icon>;
