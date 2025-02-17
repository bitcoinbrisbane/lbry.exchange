import { useState, useEffect } from 'react'
import axios from 'axios'

export function useRate() {
  const [rate, setRate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchRate = async () => {
      try {
        // For testing, let's hardcode the rate until the backend endpoint is ready
        setRate(0.0035) // 1 LBC = 0.0035 USDC
        
        // Once backend is ready, uncomment this:
        // const response = await axios.get('/api/rate')
        // setRate(response.data.rate)
        
        setError(null)
      } catch (err) {
        setError('Failed to fetch current rate')
        console.error('Rate fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRate()
    // Optionally refresh rate periodically
    const interval = setInterval(fetchRate, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [])

  return { rate, loading, error }
} 