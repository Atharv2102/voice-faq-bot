import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import healthRouter from './routes/health.js';
import queryRouter from './routes/query.js';
import adminCommandRouter from './routes/adminCommand.js';
import adminConfirmRouter from './routes/adminConfirm.js';
import suggestionsRouter from './routes/suggestions.js';
import authRouter from './routes/auth.js';
import questionsRouter from './routes/questions.js';
import lockRouter from './routes/lock.js';
import bulkImportRouter from './routes/bulkImport.js';
import auditLogRouter from './routes/auditLog.js';
import queryLogRouter from './routes/queryLog.js';
import botNotifyRouter from './routes/botNotify.js';
import convRefRouter from './routes/convRef.js';

const app = express();
app.use(cors({ origin: process.env.ADMIN_PANEL_URL || true }));
app.use(express.json());
app.use(morgan('dev'));

// Public
app.use('/api', healthRouter);
app.use('/api', queryRouter);
app.use('/api', adminCommandRouter);
app.use('/api', adminConfirmRouter);
app.use('/api', suggestionsRouter);  // includes public POST + quick-token GET

// Auth
app.use('/api/auth', authRouter);

// JWT-protected
app.use('/api', questionsRouter);
app.use('/api', lockRouter);
app.use('/api', bulkImportRouter);
app.use('/api', auditLogRouter);
app.use('/api', queryLogRouter);

// Internal (secret-protected)
app.use('/api', botNotifyRouter);
app.use('/api', convRefRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
