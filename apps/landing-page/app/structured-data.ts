export function getStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SweatDrop',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'iOS, Android',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
    description: 'IoT sensors and mobile app that transform gym equipment into connected, gamified experiences.',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '150',
    },
  };
}

export function getOrganizationData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SweatDrop',
    url: 'https://sweatdrop.com',
    logo: 'https://sweatdrop.com/logo.png',
    description: 'IoT platform for modern gyms. Transform equipment into connected experiences.',
    sameAs: [],
  };
}
