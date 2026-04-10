// Ticketing system Mongoose model (replace with Sequelize if using SQL)
import mongoose from 'mongoose';

const TicketCommentSchema = new mongoose.Schema({
  authorId: String,
  authorType: String, // 'customer', 'studio', 'admin'
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const TicketHistorySchema = new mongoose.Schema({
  action: String, // 'created', 'comment', 'status', 'escalate', etc.
  by: String,
  timestamp: { type: Date, default: Date.now },
  details: String
});

const TicketSchema = new mongoose.Schema({
  subject: String,
  description: String,
  createdBy: String, // user id
  createdForStudio: String, // studio id (optional)
  assignedTo: String, // admin id (optional)
  status: { type: String, enum: ['open', 'pending', 'closed'], default: 'open' },
  escalated: { type: Boolean, default: false },
  comments: [TicketCommentSchema],
  history: [TicketHistorySchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
});

export default mongoose.model('Ticket', TicketSchema);
