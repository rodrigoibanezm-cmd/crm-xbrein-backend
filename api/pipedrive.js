// api/pipedrive.js
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ status: 'error', message: 'Method not allowed' });
  }

  return res.status(200).json({
    status: 'ok',
    message: 'stub pipedrive funcionando en crm-xbrein-backend',
  });
}

