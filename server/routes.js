import { Router } from 'express';
import { Room, Booking } from './models.js';
import { h } from './auth.js';

const r = Router();
const LIVE = ['reserved', 'checked_in'];
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, server timezone
const addDay = s => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); };
const okDates = (a, b) => /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && b > a;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const rx = s => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

// A room is free if no live booking overlaps [a, b).
const free = async (room, a, b, skip) => !(await Booking.exists({
  room, status: { $in: LIVE }, checkIn: { $lt: b }, checkOut: { $gt: a }, ...(skip && { _id: { $ne: skip } }),
}));
const blocked = async room => room.flag ? `Room is marked ${room.flag}.`
  : (await Booking.exists({ room: room._id, status: 'checked_in' })) ? 'A guest is still checked in.' : '';

// Billing: nights x rate, minus payments. Early check-out shortens the stay.
const effOut = b => { const T = today(); return b.checkOut > T ? (T > b.checkIn ? T : addDay(b.checkIn)) : b.checkOut; };
const bill = (b, out = b.checkOut) => {
  const nights = Math.round((Date.parse(out) - Date.parse(b.checkIn)) / 864e5);
  const total = nights * b.rate, paid = b.payments.reduce((s, p) => s + p.amount, 0);
  return { nights, total, paid, balance: total - paid };
};

const snapshot = () => Promise.all([
  Room.find().sort({ floor: 1, number: 1 }).collation({ locale: 'en', numericOrdering: true }).lean(),
  Booking.find({ status: { $in: LIVE } }).sort({ checkIn: 1 }).lean(),
]);
function state(room, bks) {
  if (room.flag === 'maintenance') return 'maintenance';
  const T = today(), mine = bks.filter(b => String(b.room) === String(room._id));
  if (mine.some(b => b.status === 'checked_in')) return 'occupied';
  if (room.flag === 'cleaning') return 'cleaning';
  if (mine.some(b => b.status === 'reserved' && b.checkIn <= T && b.checkOut > T)) return 'reserved';
  return 'available';
}

// ---------- Rooms ----------
r.get('/rooms', h(async (_, res) => {
  const [rooms, bks] = await snapshot(), T = today();
  res.json(rooms.map(x => {
    const mine = bks.filter(b => String(b.room) === String(x._id));
    return { ...x, status: state(x, bks),
      current: mine.find(b => b.status === 'checked_in') || null,
      next: mine.find(b => b.status === 'reserved' && b.checkOut > T) || null };
  }));
}));

r.get('/rooms/available', h(async (req, res) => {
  const { checkIn: a, checkOut: b } = req.query;
  if (!okDates(a, b)) throw new Error('Check-out must be after check-in.');
  const busy = await Booking.find({ status: { $in: LIVE }, checkIn: { $lt: b }, checkOut: { $gt: a } }).distinct('room');
  res.json(await Room.find({ _id: { $nin: busy }, flag: { $ne: 'maintenance' } }).sort({ floor: 1, number: 1 }).lean());
}));

const roomFields = ['number', 'floor', 'type', 'rate'];
r.post('/rooms', h(async (req, res) => res.status(201).json(await Room.create(pick(req.body, roomFields)))));
r.put('/rooms/:id', h(async (req, res) =>
  res.json(await Room.findByIdAndUpdate(req.params.id, pick(req.body, roomFields), { new: true, runValidators: true }))));

r.patch('/rooms/:id/flag', h(async (req, res) => {
  const flag = req.body.flag || '';
  if (flag === 'maintenance' && await Booking.exists({ room: req.params.id, status: 'checked_in' }))
    throw new Error('Check the guest out before setting maintenance.');
  res.json(await Room.findByIdAndUpdate(req.params.id, { flag }, { new: true, runValidators: true }));
}));

r.delete('/rooms/:id', h(async (req, res) => {
  if (await Booking.exists({ room: req.params.id })) throw new Error('This room has bookings. Set it to maintenance instead.');
  await Room.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---------- Bookings ----------
// Filters: ?status=reserved,checked_in  ?from=2026-11-01&to=2026-12-01 (overlap, for the calendar)  ?q=guest or phone
r.get('/bookings', h(async (req, res) => {
  const { status, from, to, q } = req.query, f = {};
  if (status) f.status = { $in: status.split(',') };
  if (from && to) { f.checkIn = { $lt: to }; f.checkOut = { $gt: from }; }
  if (q) f.$or = [{ guest: rx(q) }, { phone: rx(q) }];
  res.json(await Booking.find(f).populate('room', 'number type').sort({ checkIn: 1 }).lean());
}));

r.post('/bookings', h(async (req, res) => {
  const b = pick(req.body, ['guest', 'phone', 'room', 'checkIn', 'checkOut', 'guests', 'rate', 'notes']);
  if (!okDates(b.checkIn, b.checkOut)) throw new Error('Check-out must be after check-in.');
  const room = await Room.findById(b.room);
  if (!room) throw new Error('Room not found.');
  if (room.flag === 'maintenance') throw new Error('Room is under maintenance.');
  if (!(await free(room._id, b.checkIn, b.checkOut))) throw new Error('Room is already booked for those dates.');
  const walkIn = !!req.body.walkIn, advance = Number(req.body.advance) || 0;
  if (walkIn) {
    if (b.checkIn !== today()) throw new Error('A walk-in must start today.');
    const m = await blocked(room); if (m) throw new Error(m);
  }
  const bk = await Booking.create({
    ...b, rate: b.rate ?? room.rate, status: walkIn ? 'checked_in' : 'reserved',
    payments: advance > 0 ? [{ date: today(), amount: advance }] : [],
  });
  res.status(201).json(bk);
}));

r.put('/bookings/:id', h(async (req, res) => {
  const bk = await Booking.findById(req.params.id);
  if (!bk || !LIVE.includes(bk.status)) throw new Error('Only reserved or checked-in bookings can be edited.');
  const d = pick(req.body, ['guest', 'phone', 'room', 'checkIn', 'checkOut', 'guests', 'rate', 'notes']);
  const n = { ...bk.toObject(), ...d };
  if (!okDates(n.checkIn, n.checkOut)) throw new Error('Check-out must be after check-in.');
  if (!(await free(n.room, n.checkIn, n.checkOut, bk._id))) throw new Error('Room is already booked for those dates.');
  Object.assign(bk, d);
  res.json(await bk.save());
}));

r.post('/bookings/:id/check-in', h(async (req, res) => {
  const bk = await Booking.findById(req.params.id);
  if (!bk || bk.status !== 'reserved') throw new Error('Only reserved bookings can be checked in.');
  if (bk.checkIn > today()) throw new Error('This guest is not due until ' + bk.checkIn + '.');
  const m = await blocked(await Room.findById(bk.room)); if (m) throw new Error(m);
  bk.status = 'checked_in';
  res.json(await bk.save());
}));

// Preview the bill before checking out (early departures are billed to today).
r.get('/bookings/:id/bill', h(async (req, res) => {
  const bk = await Booking.findById(req.params.id);
  if (!bk) throw new Error('Booking not found.');
  const out = bk.status === 'checked_in' ? effOut(bk) : bk.checkOut;
  res.json({ checkOut: out, ...bill(bk, out) });
}));

r.post('/bookings/:id/check-out', h(async (req, res) => {
  const bk = await Booking.findById(req.params.id);
  if (!bk || bk.status !== 'checked_in') throw new Error('Only checked-in guests can be checked out.');
  bk.checkOut = effOut(bk);
  const collect = Number(req.body.collect) || 0;
  if (collect > 0) bk.payments.push({ date: today(), amount: collect });
  bk.status = 'checked_out';
  await bk.save();
  await Room.findByIdAndUpdate(bk.room, { flag: 'cleaning' });
  res.json({ booking: bk, ...bill(bk) });
}));

r.post('/bookings/:id/cancel', h(async (req, res) => {
  const bk = await Booking.findById(req.params.id);
  if (!bk || bk.status !== 'reserved') throw new Error('Only reserved bookings can be cancelled.');
  bk.status = 'cancelled';
  res.json(await bk.save());
}));

// ---------- Dashboard ----------
r.get('/dashboard', h(async (_, res) => {
  const T = today(), [rooms, bks] = await snapshot();
  const counts = { available: 0, reserved: 0, occupied: 0, cleaning: 0, maintenance: 0 };
  rooms.forEach(x => counts[state(x, bks)]++);
  const usable = rooms.length - counts.maintenance;
  const [rev] = await Booking.aggregate([
    { $unwind: '$payments' }, { $match: { 'payments.date': T } },
    { $group: { _id: null, total: { $sum: '$payments.amount' } } }]);
  const [arrivals, departures] = await Promise.all([
    Booking.find({ status: 'reserved', checkIn: { $lte: T }, checkOut: { $gt: T } }).populate('room', 'number type').lean(),
    Booking.find({ status: 'checked_in', checkOut: { $lte: T } }).populate('room', 'number type').lean(),
  ]);
  res.json({ date: T, revenue: rev?.total || 0, totalRooms: rooms.length, counts,
    occupancy: usable ? Math.round(counts.occupied / usable * 100) : 0, arrivals, departures });
}));

export default r;
