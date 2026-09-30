import { AutomationActionType } from '../automation/automationTypes';

export type ParameterType = 'string' | 'number' | 'date' | 'time' | 'select';

export interface WorkflowParameter {
  key: string;
  label: string;
  type: ParameterType;
  default?: string;
  options?: string[];
  required?: boolean;
  description?: string;
}

export interface WorkflowStep {
  id: string;
  order: number;
  action: AutomationActionType;
  selector: string;
  targetDescription: string;
  valueTemplate?: string;   // e.g. "{{workDate}}" or static "09:00"
  dangerous?: boolean;      // Marks high-impact step (like confirm/submit) requiring approval in auto-pilot
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

export interface WorkflowRecipe {
  id: string;
  title: string;
  description?: string;
  targetUrl?: string;
  parameters: WorkflowParameter[];
  steps: WorkflowStep[];
  markdownContent?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type WorkflowExecutionMode = 'step-by-step' | 'auto-pilot';

export interface WorkflowExecutionState {
  recipe: WorkflowRecipe;
  params: Record<string, string>;
  mode: WorkflowExecutionMode;
  currentStepIndex: number;
  status: 'idle' | 'running' | 'paused_for_approval' | 'completed' | 'failed' | 'needs_healing';
  logs: string[];
}
