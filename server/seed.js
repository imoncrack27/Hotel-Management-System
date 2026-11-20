import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Room } from './models.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lodgedesk');
const email = (process.env.ADMIN_EMAIL || 'staff@lodge.local').toLowerCase();
await User.updateOne({ email },
  { name: 'Front desk', password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'change-me-now', 10) },
  { upsert: true });

if (!(await Room.countDocuments())) {
  const types = [['Standard', 1200], ['Standard', 1200], ['Deluxe', 1800], ['Deluxe', 1800], ['Family', 2500], ['Standard', 1200]];
  await Room.insertMany([1, 2].flatMap(floor => types.map(([type, rate], i) =>
    ({ number: `${floor}0${i + 1}`, floor, type, rate }))));
}
console.log('Seeded. Staff login:', email);
process.exit(0);
