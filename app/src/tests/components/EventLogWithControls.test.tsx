import { render, screen, fireEvent } from '@testing-library/react'
import { EventLogWithControls } from '../../components/EventLogWithControls'
import { describe, it, expect, vi } from 'vitest'

describe('EventLogWithControls', () => {
  const defaultProps = {
    currentTime: 1000,
    upcomingEvents: [],
    executedEvents: [],
    frequencies: [
      { deviceId: 'alice', messagesPerHour: 30, enabled: true },
      { deviceId: 'bob', messagesPerHour: 20, enabled: true }
    ],
    onUpdateFrequencies: vi.fn(),
    isRunning: true,
    speedMultiplier: 1,
    globalMessagesPerHour: 50,
    onUpdateGlobalMessagesPerHour: vi.fn(),
    imageAttachmentPercentage: 30,
    onUpdateImagePercentage: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSetSpeed: vi.fn(),
    onReset: vi.fn()
  }

  it('should render global message rate control', () => {
    render(<EventLogWithControls {...defaultProps} />)
    
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    expect(screen.getByText('msg/hr')).toBeInTheDocument()
  })

  it('should render image percentage control', () => {
    render(<EventLogWithControls {...defaultProps} />)
    
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
    expect(screen.getByText('%')).toBeInTheDocument()
  })

  it('should call onUpdateGlobalMessagesPerHour when global rate changes', () => {
    const onUpdateGlobalMessagesPerHour = vi.fn()
    render(
      <EventLogWithControls 
        {...defaultProps} 
        onUpdateGlobalMessagesPerHour={onUpdateGlobalMessagesPerHour}
      />
    )
    
    const globalRateInput = screen.getByDisplayValue('50')
    fireEvent.change(globalRateInput, { target: { value: '75' } })
    
    expect(onUpdateGlobalMessagesPerHour).toHaveBeenCalledWith(75)
  })

  it('should call onUpdateImagePercentage when image percentage changes', () => {
    const onUpdateImagePercentage = vi.fn()
    render(
      <EventLogWithControls 
        {...defaultProps} 
        onUpdateImagePercentage={onUpdateImagePercentage}
      />
    )
    
    const imagePercentageInput = screen.getByDisplayValue('30')
    fireEvent.change(imagePercentageInput, { target: { value: '50' } })
    
    expect(onUpdateImagePercentage).toHaveBeenCalledWith(50)
  })

  it('should render device enable/disable toggles', () => {
    render(<EventLogWithControls {...defaultProps} />)
    
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    
    const aliceCheckbox = screen.getByRole('checkbox', { name: /alice/i })
    const bobCheckbox = screen.getByRole('checkbox', { name: /bob/i })
    
    expect(aliceCheckbox).toBeChecked()
    expect(bobCheckbox).toBeChecked()
  })

  it('should call onUpdateFrequencies when device is toggled', () => {
    const onUpdateFrequencies = vi.fn()
    render(
      <EventLogWithControls 
        {...defaultProps} 
        onUpdateFrequencies={onUpdateFrequencies}
      />
    )
    
    const aliceCheckbox = screen.getByRole('checkbox', { name: /alice/i })
    fireEvent.click(aliceCheckbox)
    
    expect(onUpdateFrequencies).toHaveBeenCalledWith([
      { deviceId: 'alice', messagesPerHour: 30, enabled: false },
      { deviceId: 'bob', messagesPerHour: 20, enabled: true }
    ])
  })

  it('should handle boundary values for image percentage', () => {
    const onUpdateImagePercentage = vi.fn()
    render(
      <EventLogWithControls 
        {...defaultProps} 
        onUpdateImagePercentage={onUpdateImagePercentage}
      />
    )
    
    const imagePercentageInput = screen.getByDisplayValue('30')
    
    // Test minimum value
    fireEvent.change(imagePercentageInput, { target: { value: '0' } })
    expect(onUpdateImagePercentage).toHaveBeenCalledWith(0)
    
    // Test maximum value
    fireEvent.change(imagePercentageInput, { target: { value: '100' } })
    expect(onUpdateImagePercentage).toHaveBeenCalledWith(100)
  })

  it('should display proper labels for controls', () => {
    render(<EventLogWithControls {...defaultProps} />)
    
    expect(screen.getByText('Message Generation')).toBeInTheDocument()
    expect(screen.getByText('Global Rate')).toBeInTheDocument()
    expect(screen.getByText('Images')).toBeInTheDocument()
    expect(screen.getByText('Device Enable/Disable')).toBeInTheDocument()
  })
})