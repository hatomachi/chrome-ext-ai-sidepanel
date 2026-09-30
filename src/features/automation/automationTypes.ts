/**
 * Types for Browser Automation Engine (Experimental Feature)
 * Enables AI agents to scan interactive elements, click, input, scroll, and execute actions with human-in-the-loop confirmation.
 */

export type AutomationActionType = 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'navigate';

export interface InteractiveElement {
  id: number;
  tagName: string;
  type?: string;
  text: string;
  selector: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
}

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  targetId?: number;
  selector?: string;         // Direct CSS selector (for workflows / replay)
  targetDescription?: string;
  value?: string;           // for 'type' or 'select' action
  direction?: 'up' | 'down'; // for 'scroll' action
  amount?: number;          // scroll pixels or wait ms
  url?: string;             // for 'navigate' action
  reason?: string;          // Reason explaining why AI proposes this action
  dangerous?: boolean;      // Marks high-impact actions like submit/order
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected';
  error?: string;
  createdAt: number;
  executedAt?: number;
}

export type BrowserActionProposal = AutomationAction;

export interface BrowserActionResult {
  success: boolean;
  actionId: string;
  message?: string;
  error?: string;
  targetId?: number;
  newPageUrl?: string;
  executedAt: number;
}

export interface AutomationScanResult {
  elements: InteractiveElement[];
  pageTitle: string;
  pageUrl: string;
  scannedAt: number;
}

export interface ScanOptions {
  showOverlay?: boolean;
  highlightDurationMs?: number;
  maxElements?: number;
}
