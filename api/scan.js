const fetch = global.fetch;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { isbn } = req.query;
  if (!isbn) {
    res.status(400).json({ error: 'ISBN is required' });
    return;
  }

  try {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`);
    const payload = await response.json();
    const data = payload[`ISBN:${isbn}`] || null;
    res.status(200).json({ data });
  } catch (error) {
    res.status(502).json({ error: 'Could not reach metadata provider', details: error.message });
  }
}
