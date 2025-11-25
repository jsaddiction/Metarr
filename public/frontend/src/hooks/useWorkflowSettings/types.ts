/**
 * Workflow Settings Types
 *
 * Types for the workflow control system that manages
 * global enable/disable of processing stages.
 */

export type WorkflowStage = 'webhooks' | 'scanning' | 'identification' | 'enrichment' | 'publishing';

export interface WorkflowSettings {
  webhooks: boolean;
  scanning: boolean;
  identification: boolean;
  enrichment: boolean;
  publishing: boolean;
}

export interface WorkflowStageConfig {
  id: WorkflowStage;
  name: string;
  description: string;
  icon: string;
  dependencies?: WorkflowStage[];
}

export interface WorkflowUpdateEvent {
  type: 'workflow.updated';
  stage: WorkflowStage;
  enabled: boolean;
}
