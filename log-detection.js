export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { 
    detectionTime, 
    confidence, 
    kangarooCount, 
    timestamp 
  } = req.body;

  // Log to Vercel's logging system
  console.log({
    timestamp,
    detectionTime,
    confidence,
    kangarooCount
  });

  res.status(200).json({ message: 'Logged successfully' });
}
