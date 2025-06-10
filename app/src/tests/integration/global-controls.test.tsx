import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from '../../App'

describe('Global Controls Integration', () => {
  it('should use image percentage in ChatInterface', async () => {
    render(<App />)
    
    // Wait for the app to load
    await screen.findByText('Event Timeline & Generation')
    
    // Find the image percentage control by looking for the Images label context
    const imagesLabel = screen.getByText('Images')
    const imagePercentageInput = imagesLabel.closest('.control-group')?.querySelector('input')
    expect(imagePercentageInput).toHaveValue(30)
    
    // Change image percentage
    fireEvent.change(imagePercentageInput!, { target: { value: '75' } })
    
    // Verify the new value is displayed
    expect(imagePercentageInput).toHaveValue(75)
  })

  it('should update global message rate', async () => {
    render(<App />)
    
    // Wait for the app to load
    await screen.findByText('Message Generation')
    
    // Find the global rate control by looking for the Global Rate label context
    const globalRateLabel = screen.getByText('Global Rate')
    const globalRateInput = globalRateLabel.closest('.control-group')?.querySelector('input')
    expect(globalRateInput).toHaveValue(50)
    
    // Change global rate
    fireEvent.change(globalRateInput!, { target: { value: '100' } })
    
    // Verify the new value is displayed
    expect(globalRateInput).toHaveValue(100)
  })

  it('should show device toggle controls', async () => {
    render(<App />)
    
    // Wait for the app to load
    await screen.findByText('Device Enable/Disable')
    
    // Check that device toggles are present
    const aliceToggle = screen.getByRole('checkbox', { name: /alice/i })
    const bobToggle = screen.getByRole('checkbox', { name: /bob/i })
    
    expect(aliceToggle).toBeChecked()
    expect(bobToggle).toBeChecked()
    
    // Toggle alice off
    fireEvent.click(aliceToggle)
    expect(aliceToggle).not.toBeChecked()
    
    // Toggle alice back on
    fireEvent.click(aliceToggle)
    expect(aliceToggle).toBeChecked()
  })

  it('should render control labels and units correctly', async () => {
    render(<App />)
    
    // Wait for the app to load
    await screen.findByText('Message Generation')
    
    // Check all expected labels and units
    expect(screen.getByText('Global Rate')).toBeInTheDocument()
    expect(screen.getByText('Images')).toBeInTheDocument()
    expect(screen.getByText('msg/hr')).toBeInTheDocument()
    expect(screen.getByText('%')).toBeInTheDocument()
    expect(screen.getByText('Device Enable/Disable')).toBeInTheDocument()
  })

  it('should handle edge values in controls', async () => {
    render(<App />)
    
    // Wait for the app to load
    await screen.findByText('Global Rate')
    
    const globalRateLabel = screen.getByText('Global Rate')
    const globalRateInput = globalRateLabel.closest('.control-group')?.querySelector('input')
    
    const imagesLabel = screen.getByText('Images')
    const imagePercentageInput = imagesLabel.closest('.control-group')?.querySelector('input')
    
    // Test minimum values
    fireEvent.change(globalRateInput!, { target: { value: '0' } })
    fireEvent.change(imagePercentageInput!, { target: { value: '0' } })
    
    expect(globalRateInput).toHaveValue(0)
    expect(imagePercentageInput).toHaveValue(0)
    
    // Test maximum values
    fireEvent.change(globalRateInput!, { target: { value: '3600' } })
    fireEvent.change(imagePercentageInput!, { target: { value: '100' } })
    
    expect(globalRateInput).toHaveValue(3600)
    expect(imagePercentageInput).toHaveValue(100)
  })
})