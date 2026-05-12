export interface FAQ {
  id: string;
  question: string;
  alternates: string[];
  answer: string;
  category: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  lock?: { userId: string; userEmail: string; expiresAt: number } | null;
}

export interface Suggestion {
  id: string;
  type: 'update' | 'add' | 'report';
  submitted_by: { teams_user_id: string; name?: string; email?: string };
  target_faq_id: string | null;
  target_question_snippet: string | null;
  current_answer: string | null;
  proposed_question: string | null;
  proposed_answer: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  applied: boolean;
}

export interface AuditEntry {
  timestamp: string;
  actor_name: string;
  actor_email: string;
  action: string;
  source: string;
  faq_id: string;
  question_snippet: string;
  before_answer: string;
  after_answer: string;
  notes: string;
}

export interface QueryEntry {
  timestamp: string;
  user_email: string;
  user_name: string;
  query: string;
  matched_faq_id: string;
  confidence: string;
  answered: string;
}
