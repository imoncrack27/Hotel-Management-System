# LodgeDesk

Staff-only lodge booking: room status, advance reservations, check-in/out, calendar data.
Stack: MongoDB, Express, React (next step), Node.

## Run the API (step 1)

Needs Node 18+ and MongoDB (local, or a free Atlas connection string).

```bash
cd server
npm install
cp .env.example .env     # then edit JWT_SECRET and the staff password
npm run seed             # creates the staff login and 12 sample rooms
npm run dev              # http://localhost:5000
```

Quick test:

```bash
curl -X POST localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"staff@lodge.local","password":"change-me-now"}'
# copy the token, then:
curl localhost:5000/api/rooms -H "Authorization: Bearer <token>"
```

## API

| Method            | Path                                            | Purpose                                                                        |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| POST              | /api/auth/login                                 | Staff login, returns a token                                                   |
| GET               | /api/dashboard                                  | Revenue today, occupancy, room counts, arrivals, departures                    |
| GET               | /api/rooms                                      | Rooms with live status, current guest, next booking                            |
| GET               | /api/rooms/available?checkIn=&checkOut=         | Rooms free for those dates                                                     |
| POST, PUT, DELETE | /api/rooms, /api/rooms/:id                      | Add, edit, delete a room                                                       |
| PATCH             | /api/rooms/:id/flag                             | Set `cleaning`, `maintenance`, or `""` (ready)                                 |
| GET               | /api/bookings?status=&from=&to=&q=              | List, search, calendar range                                                   |
| POST              | /api/bookings                                   | Reserve (add `"walkIn": true` to check in now, `"advance": 500` for a deposit) |
| PUT               | /api/bookings/:id                               | Edit dates, room, guest                                                        |
| POST              | /api/bookings/:id/check-in, /check-out, /cancel | Stay lifecycle                                                                 |
| GET               | /api/bookings/:id/bill                          | Total, paid, balance before check-out                                          |

## Roadmap

1. API (this folder)
2. React client in `client/` (Vite): login, dashboard, calendar, reservations, rooms
3. Deploy: API on Render or Railway, client on Netlify or Vercel, database on MongoDB Atlas
