import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Room } from './models.js';
import { LODGE_ROOMS } from './rooms.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lodgedesk');
const email = (process.env.ADMIN_EMAIL || 'staff@lodge.local').toLowerCase();
await User.updateOne({ email },
  { name: 'Front desk', password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'change-me-now', 10) },
  { upsert: true });

if (!(await Room.countDocuments())) await Room.insertMany(LODGE_ROOMS);
console.log('Seeded. Staff login:', email);
process.exit(0);
