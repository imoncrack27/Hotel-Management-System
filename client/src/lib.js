const KEY = 'lodgedesk_token';
const BASE = import.meta.env.VITE_API_URL || ''; // set this when the API is hosted elsewhere
export const CUR = '₱';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = t => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { setToken(); location.reload(); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export const ymd = d => d.toLocaleDateString('en-CA');
export const today = () => ymd(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
export const fd = s => new Date(s + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
export const money = n => CUR + Math.round(n || 0).toLocaleString('en');
export const nights = b => Math.round((Date.parse(b.checkOut) - Date.parse(b.checkIn)) / 864e5);
export const LABEL = {
  available: 'Available', reserved: 'Reserved', occupied: 'Occupied', cleaning: 'Cleaning', maintenance: 'Maintenance',
  checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled',
};
