import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { auth, login } from './auth.js';
import api from './routes.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));
app.post('/api/auth/login', login);   // the only public route: staff accounts are created by seed.js
app.use('/api', auth, api);           // everything else needs a staff token

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lodgedesk');
const port = process.env.PORT || 5000;
app.listen(port, () => console.log('LodgeDesk API running on http://localhost:' + port));
