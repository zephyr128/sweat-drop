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

/** FAQ items for schema.org FAQPage (EN) — used for SEO so Google indexes FAQ content. */
const faqItemsEn = [
  { question: 'Do I need to modify my equipment?', answer: 'No. Smart machines connect directly via Bluetooth. For older machines we use a small sensor that mounts in 60 seconds — no tools, no drilling.' },
  { question: 'How long does installation take?', answer: 'Our team comes to your gym and everything is done in 90 minutes.' },
  { question: "What if members don't download the app?", answer: "Reception check-in works without the app — members just scan a QR code. For full gamification (leaderboard, challenges, rewards) the app is needed, but it's free and easy to download." },
  { question: 'Can I set my own rewards and challenges?', answer: 'Yes. You define rewards in the store, prices in drops, and challenge duration. Everything is under your control.' },
  { question: 'What happens after the 90 days?', answer: 'You choose a paid plan or cancel. If you cancel, we remove the sensors. Zero obligation. You keep all member data.' },
  { question: 'Is my member data secure?', answer: 'Yes. All data is stored on secure EU servers and is not shared with third parties. You retain full ownership of your data.' },
  { question: 'Do you work with multiple locations?', answer: 'Yes. PRO plan supports one location, ELITE plan up to 3 locations. For chains with more than 3 gyms, contact us for enterprise pricing.' },
];

export function getFAQStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItemsEn.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
