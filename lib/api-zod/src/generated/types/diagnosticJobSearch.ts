export interface DiagnosticJobSearch {
  query: string;
  queriedBoards: string[];
  liveResults: boolean;
  boardSearchLinks?: Array<{ board: string; url: string }>;
}
