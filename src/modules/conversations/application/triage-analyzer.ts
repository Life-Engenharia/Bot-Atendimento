export type TriageRoute = 'commercial' | 'technical' | 'human';

export type TriageAnalysis = {
  route: TriageRoute;
  confidence: number;
};

export interface TriageAnalyzer {
  classify(message: string): Promise<TriageAnalysis>;
}
