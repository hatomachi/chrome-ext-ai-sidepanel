/**
 * Types for Browser Automation Engine (Experimental Feature)
 * Enables AI agents to scan interactive elements, click, input, scroll, and execute actions with human-in-the-loop confirmation.
 */

export type AutomationActionType = 'click' | 'type' | 'scroll' | 'wait' | 'navigate';

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
  targetDescription?: string;
  value?: string;           // for 'type' action
  direction?: 'up' | 'down'; // for 'scroll' action
  amount?: number;          // scroll pixels or wait ms
  url?: string;             // for 'navigate' action
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected';
  error?: string;
  createdAt: number;
}

export interface AutomationScanResult {
  elements: InteractiveElement[];
  pageTitle: string;
  pageUrl: string;
  scannedAt: number;
}
