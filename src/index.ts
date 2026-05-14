import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import ordersRouter from './routes/orders';
import profileRouter from './routes/profile';
import postsRouter from './routes/posts';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRouter);
app.use('/orders', ordersRouter);
app.use('/profile', profileRouter);
app.use('/posts', postsRouter);

app.get('/health', (_, res) => res.json({ ok: true, service: 'footlub-backend' }));

const PORT = process.env.PORT || 3000;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`FootLub backend running on http://0.0.0.0:${PORT}`);
});
