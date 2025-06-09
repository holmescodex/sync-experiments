import { useState } from 'react'
import type { DeviceFrequency } from '../simulation/engine'

interface EventFrequencyControlsProps {
  frequencies: DeviceFrequency[]
  onUpdateFrequencies: (frequencies: DeviceFrequency[]) => void
}

export function EventFrequencyControls({ frequencies, onUpdateFrequencies }: EventFrequencyControlsProps) {
  const [localFrequencies, setLocalFrequencies] = useState(frequencies)

  const updateFrequency = (deviceId: string, field: keyof DeviceFrequency, value: any) => {
    const updated = localFrequencies.map(freq => 
      freq.deviceId === deviceId ? { ...freq, [field]: value } : freq
    )
    setLocalFrequencies(updated)
    onUpdateFrequencies(updated)
  }

  const presetFrequencies = [
    { label: 'Silent', value: 0 },
    { label: 'Quiet (1/hour)', value: 1 },
    { label: 'Light (6/hour)', value: 6 },
    { label: 'Normal (30/hour)', value: 30 },
    { label: 'Active (120/hour)', value: 120 },
    { label: 'Heavy (300/hour)', value: 300 }
  ]

  return (
    <div className="frequency-controls">
      <h3>Automatic Event Generation</h3>
      <p>Configure how often each device automatically generates messages</p>
      
      <div className="frequency-grid">
        {localFrequencies.map(freq => (
          <div key={freq.deviceId} className="frequency-device">
            <h4>Device {freq.deviceId}</h4>
            
            <div className="frequency-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={freq.enabled}
                  onChange={(e) => updateFrequency(freq.deviceId, 'enabled', e.target.checked)}
                />
                Enable Auto-Generation
              </label>
            </div>
            
            <div className="frequency-input">
              <label>
                Messages per hour:
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={freq.messagesPerHour}
                  onChange={(e) => updateFrequency(freq.deviceId, 'messagesPerHour', parseInt(e.target.value) || 0)}
                  disabled={!freq.enabled}
                />
              </label>
            </div>
            
            <div className="frequency-presets">
              <label>Quick presets:</label>
              <div className="preset-buttons">
                {presetFrequencies.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => updateFrequency(freq.deviceId, 'messagesPerHour', preset.value)}
                    disabled={!freq.enabled}
                    className={freq.messagesPerHour === preset.value ? 'active' : ''}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="frequency-stats">
              {freq.enabled && freq.messagesPerHour > 0 && (
                <p>
                  Average: 1 message every {Math.round(3600 / freq.messagesPerHour)} seconds
                  {freq.messagesPerHour >= 60 && (
                    <span> ({Math.round(freq.messagesPerHour / 60)} per minute)</span>
                  )}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}