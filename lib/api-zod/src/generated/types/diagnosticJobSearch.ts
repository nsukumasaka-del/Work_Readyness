export interface DiagnosticJobSearch {
  searchNotice?: string;
  fallbackApplied?: boolean;
  query: string;
  queriedBoards: string[];
  liveResults: boolean;
  boardSearchLinks?: Array<{ board: string; url: string }>;
}
