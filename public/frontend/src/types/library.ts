export type MediaLibraryType = 'movie' | 'tv' | 'music';

export interface Library {
  id: number;
  name: string;
  type: MediaLibraryType;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryFormData {
  name: string;
  type: MediaLibraryType;
  path: string;
}

export interface ScanJob {
  id: number;
  libraryId: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progressCurrent: number;
  progressTotal: number;
  currentFile?: string;
  errorsCount: number;
  startedAt: string;
  completedAt?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ValidatePathResult {
  valid: boolean;
  error?: string;
}

export interface ScanProgressEvent {
  scanJobId: number;
  libraryId: number;
  progressCurrent: number;
  progressTotal: number;
  currentFile: string;
}

export interface ScanCompletedEvent {
  scanJobId: number;
  libraryId: number;
}

export interface ScanFailedEvent {
  scanJobId: number;
  libraryId: number;
  error: string;
}
