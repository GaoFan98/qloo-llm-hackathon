describe('Qloo Taste Discovery E2E', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should display the main heading and search interface', () => {
    cy.contains('Qloo Taste Discovery').should('be.visible')
    cy.contains('Discover Similar Places').should('be.visible')
    cy.get('input[placeholder*="cozy minimalist cafes"]').should('be.visible')
    cy.get('input[placeholder="New York"]').should('be.visible')
  })

  it('should handle theme switching', () => {
    // Check light mode initially
    cy.get('html').should('not.have.class', 'dark')
    
    // Click theme toggle
    cy.get('button[aria-label="Toggle theme"], button').contains('svg').first().click()
    
    // Should switch to dark mode
    cy.get('html').should('have.class', 'dark')
  })

  it('should show error for incomplete search', () => {
    cy.get('input[placeholder*="cozy minimalist cafes"]').type('test query')
    cy.get('button').contains('Search').click()
    
    cy.contains('Please enter both a search query and target city').should('be.visible')
  })

  // Skip this test if no API keys are available
  it('should perform a search and display results', function() {
    // Skip if running in CI without API keys
    if (Cypress.env('SKIP_API_TESTS')) {
      this.skip()
    }

    cy.get('input[placeholder*="cozy minimalist cafes"]').type('cozy coffee shops')
    cy.get('input[placeholder="New York"]').clear().type('San Francisco')
    
    cy.get('button').contains('Search').click()
    
    // Should show loading state
    cy.get('svg.animate-spin').should('be.visible')
    
    // Wait for results (or error)
    cy.wait(10000)
    
    // Should show either results or error, but loading should be gone
    cy.get('svg.animate-spin').should('not.exist')
    
    // Check for either results or error message
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="result-card"], .grid .bg-white, .grid .dark\\:bg-gray-800').length > 0) {
        // Results found
        cy.get('.grid .bg-white, .grid .dark\\:bg-gray-800').should('have.length.at.least', 1)
        
        // Each result should have required elements
        cy.get('.grid .bg-white, .grid .dark\\:bg-gray-800').first().within(() => {
          cy.get('h3').should('be.visible') // Place name
          cy.get('p').should('be.visible')  // Address or description
        })
        
        // Share button should be visible
        cy.contains('Share').should('be.visible')
        
      } else {
        // No results or error - should show appropriate message
        cy.get('body').should('contain.text', 'No results found').or('contain.text', 'error')
      }
    })
  })

  it('should handle Google Maps URL input', () => {
    const mapsUrl = 'https://www.google.com/maps/place/Central+Park/@40.7828647,-73.9653551,15z'
    
    cy.get('input[placeholder*="cozy minimalist cafes"]').type(mapsUrl)
    
    // Input should be processed and cleaned
    cy.get('input[placeholder*="cozy minimalist cafes"]').should('not.contain.value', 'https://')
  })

  it('should handle @ autocomplete trigger', () => {
    cy.get('input[placeholder*="cozy minimalist cafes"]').type('@central')
    
    // Should trigger autocomplete loading (if Google Maps API is available)
    cy.wait(1000)
    
    // Note: Actual autocomplete results depend on Google Maps API key availability
  })

  it('should support URL sharing', () => {
    // Visit with query parameters
    cy.visit('/?q=coffee%20shops&city=New%20York')
    
    // Should populate the form fields
    cy.get('input[placeholder*="cozy minimalist cafes"]').should('have.value', 'coffee shops')
    cy.get('input[placeholder="New York"]').should('have.value', 'New York')
  })
}) 