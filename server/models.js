import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Dates are stored as 'YYYY-MM-DD' strings. A stay occupies [checkIn, checkOut),
// so one guest can leave and another arrive on the same day.
export const User = model('User', new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  password: String,
}, { timestamps: true }));

export const Room = model('Room', new Schema({
  number: { type: String, required: true, unique: true },
  floor: { type: Number, default: 1 },
  type: { type: String, default: 'Standard' },
  rate: { type: Number, required: true, min: 0 },
  flag: { type: String, enum: ['', 'cleaning', 'maintenance'], default: '' },
}));

export const Booking = model('Booking', new Schema({
  guest: { type: String, required: true, trim: true },
  phone: String,
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  checkIn: { type: String, required: true },
  checkOut: { type: String, required: true },
  guests: { type: Number, default: 1, min: 1 },
  rate: { type: Number, required: true, min: 0 },
  payments: [{ date: String, amount: Number }],
  status: { type: String, enum: ['reserved', 'checked_in', 'checked_out', 'cancelled'], default: 'reserved' },
  notes: String,
}, { timestamps: true }));
