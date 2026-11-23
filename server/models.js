import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Dates are stored as 'YYYY-MM-DD' strings. A stay occupies [checkIn, checkOut),
// so one guest can leave and another arrive on the same day.
export const User = model(
  "User",
  new Schema(
    {
      name: String,
      email: { type: String, unique: true, lowercase: true },
      password: String,
    },
    { timestamps: true }
  )
);

export const Room = model(
  "Room",
  new Schema({
    number: { type: String, required: true, unique: true },
    floor: { type: Number, default: 1 },
    type: { type: String, default: "Standard" },
    rate: { type: Number, required: true, min: 0 },
    rate3: { type: Number, default: 0, min: 0 }, // short-stay prices; 0 = not offered
    rate6: { type: Number, default: 0, min: 0 },
    rate12: { type: Number, default: 0, min: 0 },
    includedGuests: { type: Number, default: 2, min: 1 }, // guests covered by the room price
    extraPerson: { type: Number, default: 0, min: 0 }, // fee per extra guest, per night
    flag: { type: String, enum: ["", "cleaning", "maintenance"], default: "" },
  })
);

export const Booking = model(
  "Booking",
  new Schema(
    {
      guest: { type: String, required: true, trim: true },
      phone: String,
      room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
      checkIn: { type: String, required: true },
      checkOut: { type: String, required: true },
      guests: { type: Number, default: 1, min: 1 },
      extra: { type: Number, default: 0 }, // extra-guest charge per night, worked out when booked
      kind: { type: String, enum: ["night", "short"], default: "night" },
      startTime: String, // short stays: 'HH:MM'
      hours: Number, // short stays: 3, 6 or 12
      rate: { type: Number, required: true, min: 0 },
      payments: [{ date: String, amount: Number }],
      status: {
        type: String,
        enum: ["reserved", "checked_in", "checked_out", "cancelled"],
        default: "reserved",
      },
      notes: String,
    },
    { timestamps: true }
  )
);
