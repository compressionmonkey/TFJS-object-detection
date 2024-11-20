export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { 
      detectionTime, 
      confidence, 
      phoneCount, 
      type,
      timestamp 
    } = req.body;

    // Enhanced logging with different formats based on log type
    if (type === 'phone_detection') {
      console.log(`[DETECTION] Phones: ${phoneCount}, Confidence: ${confidence.toFixed(2)}%, Time: ${timestamp}`);
    } else if (type === 'average_detection_time') {
      console.log(`[PERFORMANCE] Average Detection Time: ${detectionTime.toFixed(2)}ms, Time: ${timestamp}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[ERROR] Logging failed:', error);
    res.status(500).json({ error: 'Failed to log detection' });
  }
}
