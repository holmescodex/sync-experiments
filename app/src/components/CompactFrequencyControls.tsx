import type { DeviceFrequency } from '../simulation/engine'

interface CompactFrequencyControlsProps {
  frequencies: DeviceFrequency[]
  onUpdateFrequencies: (frequencies: DeviceFrequency[]) => void
}

export function CompactFrequencyControls({ frequencies, onUpdateFrequencies }: CompactFrequencyControlsProps) {
  const handleFrequencyChange = (deviceId: string, messagesPerHour: number) => {
    const updated = frequencies.map(freq => 
      freq.deviceId === deviceId 
        ? { ...freq, messagesPerHour }
        : freq
    )
    onUpdateFrequencies(updated)
  }

  const handleToggle = (deviceId: string, enabled: boolean) => {
    const updated = frequencies.map(freq => 
      freq.deviceId === deviceId 
        ? { ...freq, enabled }
        : freq
    )
    onUpdateFrequencies(updated)
  }

  return (
    <div className="compact-frequency-controls">
      <h4>Event Generation</h4>
      <div className="frequency-list">
        {frequencies.map(freq => (
          <div key={freq.deviceId} className="frequency-item">
            <label className="device-toggle">
              <input
                type="checkbox"
                checked={freq.enabled}
                onChange={(e) => handleToggle(freq.deviceId, e.target.checked)}
              />
              <span className={`device-name device-${freq.deviceId}`}>
                {freq.deviceId}
              </span>
            </label>
            <div className="frequency-input-compact">
              <input
                type="number"
                min="0"
                max="3600"
                value={freq.messagesPerHour}
                onChange={(e) => handleFrequencyChange(freq.deviceId, Number(e.target.value))}
                disabled={!freq.enabled}
              />
              <span className="frequency-unit">msg/hr</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}