import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { Room, Booking } from './models.js';
import { LODGE_ROOMS } from './rooms.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lodgedesk');

// Add the lodge's rooms, or update them if they already exist.
for (const r of LODGE_ROOMS) await Room.updateOne({ number: r.number }, { $set: r }, { upsert: true });

// Remove the old sample rooms, but never a room that has bookings.
const keep = LODGE_ROOMS.map(r => r.number);
for (const old of await Room.find({ number: { $nin: keep } })) {
  if (await Booking.exists({ room: old._id })) console.log(`Kept room ${old.number}: it still has bookings. Delete those bookings first, then run this again.`);
  else { await old.deleteOne(); console.log(`Removed old room ${old.number}`); }
}
console.log(`Done. ${await Room.countDocuments()} rooms in the database.`);
process.exit(0);
