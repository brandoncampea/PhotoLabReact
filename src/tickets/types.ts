// Shared ticketing types for frontend
export type TicketStatus = 'open' | 'pending' | 'closed';
export type TicketComment = {
  authorId: string;
  authorType: 'customer' | 'studio' | 'admin';
  message: string;
  createdAt: string;
};
export type TicketHistoryEntry = {
  action: string;
  by: string;
  timestamp: string;
  details: string;
};
export type Ticket = {
  _id: string;
  subject: string;
  description: string;
  createdBy: string;
  createdForStudio?: string;
  assignedTo?: string;
  status: TicketStatus;
  escalated: boolean;
  comments: TicketComment[];
  history: TicketHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  meta?: {
    page?: string;
    user?: any;
    studio?: string;
    browser?: string;
    [key: string]: any;
  };
};
