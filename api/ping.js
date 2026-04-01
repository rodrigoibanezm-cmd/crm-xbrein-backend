// api/ping.js cambio minimo para deploy
export default function handler(req, res) {
  res.status(200).json({ ok: true, path: '/api/ping' });
}
