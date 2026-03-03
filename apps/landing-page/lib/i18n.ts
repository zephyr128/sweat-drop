export type Language = 'en' | 'sr';

export const languages: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'sr', name: 'Srpski' },
];

export const translations = {
  en: {
    hero: {
      title: 'Your Members Are Leaving',
      titleHighlight: 'Here\'s How to Stop It',
      subtitle: '47% of gym members quit within 6 months. Sweat Drop turns every workout into a game—keeping members engaged, motivated, and coming back.',
      cta: 'Calculate Your ROI',
      ctaSecondary: 'See How It Works',
    },
    heroMinimal: {
      subtitle: 'The Digital Layer for Modern Gyms.',
      description: 'Transform your equipment into connected experiences. Increase retention. Drive revenue.',
      ctaPrimary: 'Request Demo',
      ctaSecondary: 'Apply for Pilot',
    },
    homeHero: {
      eyebrow: 'LAUNCHING Q2 2026 IN BELGRADE',
      title: 'BE THE FIRST GYM',
      titleLine2: 'IN BELGRADE',
      titleLine3: 'WITH SWEATDROP.',
      subtitle: 'Turn your cardio floor into a daily competition.\nMembers earn drops, climb leaderboards, win real prizes.\nYou get retention data that proves the ROI.\n90 days free. We handle everything.',
      scarcity: '3 PILOT SPOTS — 1 ALREADY RESERVED',
      ctaPrimary: 'Apply for Free Pilot — 2 Spots Left',
      ctaSecondary: 'See How It Works',
      phoneMockup: {
        availableDrops: 'AVAILABLE DROPS',
        sessions: 'Sessions',
        rank: 'Rank',
        streak: 'Streak',
      },
    },
    requestDemo: {
      title: 'Request Demo',
      submit: 'Submit Request',
      cancel: 'Cancel',
      close: 'Close',
      success: "We'll contact you within 24 hours.",
      fields: {
        fullName: 'Full Name',
        gymName: 'Gym Name',
        email: 'Email',
        phone: 'Phone',
        locations: 'Number of Locations',
        message: 'Message',
      },
      locations: {
        one: '1',
        twoToFive: '2-5',
        fivePlus: '5+',
      },
      errors: {
        required: 'This field is required',
        email: 'Please enter a valid email address',
      },
    },
    applyPilot: {
      title: 'Apply for Pilot',
      submit: 'Apply for Pilot',
      cancel: 'Cancel',
      close: 'Close',
      success: 'Application received. Our team will review and respond shortly.',
      fields: {
        fullName: 'Full Name',
        gymName: 'Gym Name',
        cityCountry: 'City / Country',
        activeMembers: 'Number of Active Members',
        cardioMachines: 'Cardio Machines Count',
        multipleLocations: 'Do you have multiple locations?',
        whyJoin: 'Why do you want to join the pilot?',
      },
      multipleLocations: {
        yes: 'Yes',
        no: 'No',
      },
      errors: {
        required: 'This field is required',
        number: 'Please enter a valid number',
      },
    },
    whatIsSweatDrop: {
      title: 'What is SweatDrop',
      description: 'IoT sensors and mobile app that transform your gym equipment into connected, gamified experiences.\n\nMembers earn rewards. You gain insights.',
    },
    smartCardioSensors: {
      title: 'Smart Cardio Sensors',
      subtitle: 'Non-invasive sensors that attach to existing equipment. No modifications required.',
      cardioEcosystem: {
        title: 'Smart Cardio Ecosystem',
        subtitle: 'Non-invasive, Zero-modification',
      },
      futureResistance: {
        title: 'The Future of Resistance',
        subtitle: 'Coming Soon',
        smartPin: {
          name: 'Smart Pin',
          description: 'Sensor that replaces standard weight pins, tracking reps and resistance.',
        },
        smartCarabiner: {
          name: 'Smart Carabiner',
          description: 'Intelligent carabiner for cable machines measuring tension and repetitions.',
        },
        universalMotion: {
          name: 'Universal Motion Sensor',
          description: 'Ultra-small sensor for dumbbells and barbells tracking biomechanics and movement path.',
        },
        joinBeta: 'JOIN BETA WAITLIST',
      },
    },
    appExperience: {
      title: 'Train. Earn. Compete.',
      features: {
        tracking: 'Automatic workout tracking',
        rewards: 'Sweat Drops rewards',
        leaderboards: 'Leaderboards',
        challenges: 'Challenges',
      },
    },
    whyItMatters: {
      title: 'Why It Matters',
      moreVisits: {
        title: 'More Visits',
        description: 'Members return more frequently when workouts are rewarding.',
      },
      moreRevenue: {
        title: 'More Revenue',
        description: 'Increased retention and engagement drive higher lifetime value.',
      },
      moreInsight: {
        title: 'More Insight',
        description: 'Real-time data on equipment usage and member behavior.',
      },
    },
    adminPanel: {
      title: 'Admin Panel',
      subtitle: 'Complete control over your gym\'s digital experience.',
      features: {
        dashboard: 'Real-time dashboard',
        analytics: 'Member analytics',
        rewards: 'Reward management',
        challenges: 'Challenge creation',
        branding: 'Custom branding for mobile app',
      },
    },
    futureVision: {
      title: 'This is just the beginning.',
      roadmap: [
        'AI-powered workout plans',
        'Personal trainer marketplace',
        'Advanced analytics suite',
      ],
    },
    pilotSection: {
      title: 'Start with a Smart Zone.',
      description: 'Test SweatDrop in a dedicated area of your gym. 90-day pilot program. Zero commitment.',
      cta: 'Request Demo',
    },
    problem: {
      badge: 'The Problem',
      title: 'The Hidden Cost of',
      titleHighlight: 'Member Churn',
      subtitle: 'Every member who leaves is money walking out the door. But there are deeper problems eating your revenue.',
      churn: {
        stat: 'Churn Rate',
        description: 'Members quit because they don\'t see progress. Without engagement, they have no reason to stay—and every reason to cancel.',
      },
      trainers: {
        stat: 'No Control',
        description: 'Freelance trainers work with clients, but you have zero visibility. When they leave, clients leave with them—and you lose everything.',
      },
      data: {
        stat: 'No Data',
        description: 'You don\'t know which equipment makes money and which collects dust. You\'re making decisions based on guesswork, not real data.',
      },
      monetization: {
        stat: 'Limited Revenue',
        description: 'Your only income stream is membership fees. Personal training is too expensive for most members, leaving money on the table.',
      },
      cost: {
        title: 'The Cost of Doing Nothing',
        description: 'While you wait, your competitors are winning. Every day without digitalization is another day of lost revenue, uncontrolled trainers, and blind decision-making. The question isn\'t whether you can afford to implement Smart-Gym—it\'s whether you can afford not to.',
      },
    },
    dropCounter: {
      label: 'Drops Earned Today',
      global: 'Global',
    },
    features: {
      title: 'Built for Performance',
      subtitle: 'Technology that keeps up with your intensity',
      realtime: {
        title: 'Real-time Sync',
        description: 'Every rep tracked instantly. No delays, no gaps. Pure performance data.',
      },
      leaderboards: {
        title: 'Global Leaderboards',
        description: 'Compete with the world. See where you rank among the elite.',
      },
      badges: {
        title: 'Badge System',
        description: 'Unlock achievements. Build your legacy. Show what you\'re made of.',
      },
    },
    hardware: {
      title: 'Plug-and-Play Sensors',
      subtitle: 'Universal sensors that work with your existing equipment. No modifications needed.',
      cardio: {
        title: 'Cardio Zone',
        status: 'Active',
        description: 'IoT rotation sensors for indoor cycling, magnetic pulse sync for treadmills, flywheel trackers for rowing machines. Mounts in minutes, tracks intensity and distance automatically.',
      },
      strength: {
        title: 'Strength Zone',
        status: 'Coming Soon',
        description: 'Smart modules (like carabiners or smart pins) that recognize weight and count reps. Non-invasive attachment, works with free weights and machines.',
      },
    },
    why: {
      title: 'Why Sweat Drop Works',
      subtitle: 'The Psychology of Gamification',
      description: 'Traditional fitness apps rely on willpower. Sweat Drop taps into something deeper: the human drive for achievement, recognition, and progress. Every drop earned is a micro-win. Every leaderboard position is validation. Every badge is proof. This isn\'t just tracking—it\'s transformation. For gym owners, this psychology translates directly to business results: engaged members visit more often, stay longer, and become brand advocates.',
    },
    coverage: {
      title: 'Sensor Coverage Matrix',
      subtitle: 'Complete equipment support roadmap',
      equipment: 'Equipment',
      technology: 'Technology',
      status: 'Status',
      active: 'Active',
      comingSoon: 'Coming Soon',
      rnd: 'R&D Phase',
    },
    smartcoach: {
      subtitle: 'AI-powered personal trainer that adapts workout plans to member goals',
      headline: 'The Future of Personalized Training',
      features: [
        { title: 'AI Analysis', desc: 'Analyzes member performance patterns' },
        { title: 'Adaptive Plans', desc: 'Adjusts to member progress automatically' },
        { title: 'Predictive Optimization', desc: 'Predicts optimal training moments' },
      ],
    },
    solution: {
      title: 'The Solution',
      titleHighlight: 'Plug-and-Play Digitalization',
      subtitle: 'Transform your existing gym into a Smart-Gym ecosystem. No new equipment needed—just universal sensors that integrate everything with a mobile app.',
      hook: 'Every Liter of Sweat = Digital Currency',
      description: 'Non-invasive sensors mount in minutes. No drilling, no damage, no modifications. As soon as a member approaches equipment, their phone recognizes it, activates tracking, and automatically logs results. Your gym becomes the first digitized fitness chain in the Balkans.',
    },
    monetization: {
      badge: 'Monetization',
      title: '4 Revenue Streams',
      titleHighlight: 'Beyond Membership Fees',
      subtitle: 'Stop relying solely on membership fees. Generate passive income, control trainers, increase retention, and earn from brand partnerships.',
      smartcoach: {
        title: 'SmartCoach',
        subtitle: 'Passive Income - Scalable Digital Sales',
        description: 'Most members can\'t afford personal trainers (€150+). Offer SmartCoach subscriptions for a fraction of that price (e.g., +€10/month). Members get digital plans, sensors track compliance. You sell one digital product to thousands simultaneously—zero labor costs.',
        revenue: 'Passive Revenue',
      },
      freelance: {
        title: 'Freelance Trainers',
        subtitle: 'Commission Income - Control & Revenue',
        description: 'Gain complete visibility into what freelance trainers do with clients. Trainers get tools, you get a percentage of every session and full control. Most importantly: data stays tied to your location. If a trainer leaves, you can immediately offer another trainer who takes over seamlessly.',
        revenue: 'Commission Revenue',
      },
      retention: {
        title: 'Retention & Loyalty',
        subtitle: 'Indirect Income - Lock-in Effect',
        description: 'Gamification turns every calorie and every rep into "Sweat Drops." Members use points to pay for supplements at the bar or get discounts on membership. This creates a powerful lock-in effect—members won\'t switch gyms because they\'d lose their accumulated progress and digital wallet.',
        revenue: 'Retention Revenue',
      },
      marketplace: {
        title: 'Brand Marketplace',
        subtitle: 'B2B Income - Brand Partnerships',
        description: 'Your gym is no longer limited to your own bar. Through the app, brands (Pansport, Proteini.si, Decathlon, etc.) offer exclusive discounts to members spending "Sweat Drops." Your profit: commission on every purchase or fixed fees from brands for access to your active member base.',
        revenue: 'B2B Revenue',
      },
      summary: {
        title: 'Multiple Revenue Streams, One Platform',
        description: 'Transform your gym from a single-revenue business into a multi-stream ecosystem. Generate income while you sleep, control what you couldn\'t see, and turn engagement into profit.',
      },
    },
    analytics: {
      title: 'Data-Driven Management',
      subtitle: 'Stop guessing. Start knowing. Make decisions based on real data, not staff estimates.',
      heatmap: {
        title: 'Heat-Map Reports',
        subtitle: 'See exactly which equipment makes money and which collects dust',
        description: 'Get precise visual reports showing equipment usage, revenue per machine, and member engagement patterns. No more relying on staff estimates about capacity. Know exactly which equipment drives value and which takes up space.',
      },
      usage: {
        title: 'Usage Analytics',
        description: 'Track real-time equipment usage. See peak hours, popular machines, and underutilized zones. Optimize your layout based on actual member behavior.',
      },
      optimization: {
        title: 'Smart Optimization',
        description: 'Use data to plan future equipment investments intelligently. Remove underperforming machines, add what members actually want, and maximize space efficiency.',
      },
      revenue: {
        title: 'Revenue Per Machine',
        description: 'Understand which equipment generates the most engagement and retention. Focus your resources on what actually drives member satisfaction and revenue.',
      },
    },
    businessValue: {
      title: 'Strategic Advantages',
      subtitle: 'Transform your gym into a data-driven, multi-revenue business',
      retention: {
        title: 'Increase Retention',
        description: 'Gamified workouts keep members engaged longer. Sweat Drops create a lock-in effect—members won\'t switch gyms because they\'d lose their accumulated progress and digital wallet.',
      },
      engagement: {
        title: 'Boost Engagement',
        description: 'Real-time tracking and instant gratification drive more frequent visits. Members see their progress immediately, creating the motivation that keeps them coming back.',
      },
      competitive: {
        title: 'Market Leadership',
        description: 'Become the first digitized fitness chain in the Balkans. While competitors compete on price, you compete on technology and innovation. Attract higher-paying clients who value efficiency and digital tracking.',
      },
      data: {
        title: 'Data-Driven Management',
        description: 'Get precise heat-map reports showing which equipment makes money and which collects dust. Make decisions based on real data, not guesswork. Optimize equipment layout and plan future investments intelligently.',
      },
    },
    pilot: {
      badge: 'Pilot Program',
      title: 'Start with One Smart Zone',
      subtitle: 'Test Smart-Gym in one zone for 90 days. No commitment. See real member interest and conversion rates.',
      duration: {
        title: '90-Day Test Period',
        description: 'One Smart Zone equipped for 90 days. Test real member interest, engagement, and conversion to SmartCoach subscriptions.',
      },
      commitment: {
        title: 'Zero Commitment',
        description: 'If results don\'t justify the investment, we remove everything. No long-term contracts, no hidden fees, no risk.',
      },
      testing: {
        title: 'Real Data Collection',
        description: 'Measure actual member interest, SmartCoach conversion rates, and engagement patterns. Make informed decisions based on real data, not projections.',
      },
      results: {
        title: 'Results-Driven Decision',
        description: 'After 90 days, you decide. If it works, expand. If it doesn\'t, we remove everything. Simple, transparent, risk-free.',
      },
      cta: {
        title: 'Ready to Test Smart-Gym?',
        description: 'Start with one zone. See real results. Make an informed decision. No commitment required.',
        button: 'Start 90-Day Pilot',
      },
    },
    cta: {
      title: 'Transform Your Gym. Start the Pilot.',
      subtitle: 'Test Smart-Gym in one zone for 90 days. No commitment. See real member interest and conversion rates.',
      button: 'Start Pilot Program',
      buttonSecondary: 'Schedule Demo',
    },
    navigation: {
      forGyms: 'For Gyms',
      pricing: 'Pricing',
      sweatArenas: 'Sweat Arenas',
      forMembers: 'For Members',
      forSponsors: 'For Sponsors',
      applyForPilot: 'Apply for Pilot',
    },
    footer: {
      tagline: 'The digital layer for modern gyms.',
      forGyms: 'For Gyms',
      sweatArenas: 'Sweat Arenas',
      forMembers: 'For Members',
      forSponsors: 'For Sponsors',
      privacy: 'Privacy',
      terms: 'Terms',
    },
    contact: {
      title: 'Contact Us',
      successTitle: 'Message Sent',
      successMessage: "Thanks! We'll be in touch within 24 hours.",
      fields: {
        name: 'Your name',
        company: 'Company / Gym name',
        email: 'Email',
        phone: 'Phone',
        locations: 'Number of locations',
        message: 'Message (optional)',
      },
      locations: {
        select: 'Select...',
        threeToFive: '3-5 locations',
        sixToTen: '6-10 locations',
        tenToTwenty: '10-20 locations',
        twentyPlus: '20+ locations',
      },
      submit: 'Send Message',
      cancel: 'Cancel',
      close: 'Close',
      errors: {
        required: 'Required',
        email: 'Valid email required',
      },
      errorGeneric: 'Something went wrong. Please try again.',
    },
    waitlist: {
      title: 'Join the Waitlist',
      successTitle: "You're on the list!",
      successMessage: "We'll notify you when SweatDrop launches at your gym.",
      fields: {
        email: 'Email',
        gymName: 'Which gym do you train at? (optional)',
      },
      placeholders: {
        email: 'your@email.com',
        gymName: 'Gym name',
      },
      submit: 'Join Waitlist',
      close: 'Close',
      errorGeneric: 'Something went wrong. Please try again.',
    },
    sponsorProposal: {
      title: 'Request Arena Proposal',
      successTitle: 'Proposal Request Received',
      successMessage: "Proposal request received! We'll send you custom numbers within 24 hours.",
      foundingBadge: "🏷 You're applying for the Founding Sponsor Program",
      foundingNote: '50% off first 3 arenas · 3 spots remaining',
      fields: {
        company: 'Company name',
        name: 'Your name',
        email: 'Email',
        phone: 'Phone',
        website: 'Website (optional)',
        plan: 'Interested in',
        startDate: 'Ideal start date (optional)',
        message: 'Tell us about your brand (optional)',
      },
      planOptions: {
        select: 'Select...',
        local: 'Local Arena (1 gym) — from €150/month',
        regional: 'Regional Arena (3-5 gyms) — from €500/month',
        network: 'Network Arena (all gyms) — from €1,500/month',
        notSure: 'Not sure yet',
      },
      messagePlaceholder: 'Product category, target audience, prize idea you have in mind...',
      submit: 'Send Proposal Request',
      cancel: 'Cancel',
      close: 'Close',
      errors: {
        required: 'Required',
        email: 'Valid email required',
      },
      errorGeneric: 'Something went wrong. Please try again.',
    },
    pricing: {
      badge: 'PRICING',
      title: 'SIMPLE PRICING.',
      subtitle: 'Cancel anytime. No hidden fees.',
      monthly: 'Monthly',
      annual: 'Annual — 2 months free',
      mostPopular: 'MOST POPULAR',
      sensors: 'sensors',
      members: 'members',
      upTo: 'Up to',
      unlimited: 'Unlimited',
      perMonth: '/mo',
      perYear: '/yr',
      startFreePilot: 'Start Free Pilot',
      enterprise: {
        text: 'Running 3+ locations? →',
        link: 'Contact us for enterprise pricing',
      },
      plans: {
        starter: 'STARTER',
        growth: 'GROWTH',
        pro: 'PRO',
        elite: 'ELITE',
        features: {
          weeklyLeaderboard: 'Weekly leaderboard',
          basicRewardStore: 'Basic reward store (5 rewards)',
          emailSupport: 'Email support',
          cardioZoneCoverage: 'Cardio zone coverage',
          monthlyLeaderboard: 'Weekly + Monthly leaderboard',
          fullRewardStore: 'Full reward store',
          twoActiveChallenges: '2 active challenges',
          retentionDashboard: 'Retention dashboard',
          reEngagementNotifications: 'Re-engagement notifications',
          prioritySupport: 'Priority support',
          allLeaderboards: 'All leaderboards',
          unlimitedChallenges: 'Unlimited challenges',
          atRiskMemberAlerts: 'At-risk member alerts',
          sweatArenaSupport: 'Sweat Arena support',
          dedicatedOnboardingCall: 'Dedicated onboarding call',
          everythingInPro: 'Everything in Pro',
          upToThreeLocations: 'Up to 3 locations',
          apiAccess: 'API access',
          quarterlyBusinessReview: 'Quarterly business review',
          accountManager: 'Account manager',
        },
      },
    },
    faq: {
      badge: 'FAQ',
      title: 'COMMON QUESTIONS',
      items: [
        {
          question: 'Do I need to modify my equipment?',
          answer: 'No. Sensors clip on or connect wirelessly. Nothing permanent. Nothing invasive.',
        },
        {
          question: 'How long does installation take?',
          answer: '90 minutes for a standard cardio floor of 10–15 machines.',
        },
        {
          question: 'What if members don\'t download the app?',
          answer: 'Even partial adoption creates competition. When some members see others on the leaderboard, adoption spreads quickly. Typically reaches 60–70% of active members in the first two weeks.',
        },
        {
          question: 'Can I set my own rewards and prizes?',
          answer: 'Yes. You control everything — what\'s available, how many drops it costs, stock limits, and expiry dates.',
        },
        {
          question: 'What happens after the 90-day pilot?',
          answer: 'We present your retention data and recommend the right plan. No pressure. No automatic billing.',
        },
        {
          question: 'Is my member data secure?',
          answer: 'All data is encrypted and stored on EU servers. We never sell member data. Full GDPR compliance.',
        },
        {
          question: 'Do you work with multiple locations?',
          answer: 'Yes. Elite plan supports up to 3 locations. For larger chains, contact us for enterprise pricing.',
        },
      ],
    },
    howItWorks: {
      steps: [
        {
          number: 1,
          title: 'WE SET EVERYTHING UP',
          description: 'Our team visits your gym and connects to your existing cardio machines. Smart treadmills connect directly. Bikes and ellipticals use a small clip-on sensor. Takes 90 minutes. No drilling. No wiring.',
        },
        {
          number: 2,
          title: 'MEMBERS COMPETE FROM DAY ONE',
          description: 'Members download SweatDrop, enter your gym code, and the leaderboard goes live immediately. Every session earns drops. Every drop is a step closer to winning.',
        },
        {
          number: 3,
          title: 'YOU WATCH THE NUMBERS CHANGE',
          description: 'Your admin dashboard shows visit frequency, at-risk members, and retention trends week by week. We send you a report every Monday.',
        },
      ],
    },
    finalCTA: {
      title: 'TWO SPOTS LEFT.',
      subtitle: 'YOUR COMPETITORS WILL TAKE THEM.',
      description: '90 days free. Full setup included.\nZero commitment. Real results.',
      button: 'Apply for Free Pilot Now',
    },
    pilotProgram: {
      title: 'THE 90-DAY PILOT PROGRAM',
      subtitle: 'Everything included. Zero commitment.',
      columns: {
        weProvide: {
          title: 'WE PROVIDE',
          items: [
            'All sensors',
            'Installation',
            'Full setup',
            'PRO features',
            'Weekly reports',
            'Direct support',
          ],
        },
        youProvide: {
          title: 'YOU PROVIDE',
          items: [
            'Access to cardio floor',
            '90 min of your time',
          ],
        },
        youKeep: {
          title: 'YOU KEEP',
          items: [
            'All member data',
            '100% of sponsor revenue during pilot',
          ],
        },
      },
      bottomNote: 'After 90 days: choose a paid plan or cancel.\nWe remove the sensors. Zero obligation.',
      button: 'Apply for Free Pilot — 2 Spots Left',
      availability: '● 1 SPOT ALREADY RESERVED — 2 REMAINING',
    },
    whyItWorks: {
      badge: 'WHY IT WORKS',
      title: 'THREE REASONS GYM OWNERS',
      titleHighlight: 'CHOOSE SWEATDROP',
      features: [
        {
          title: 'MEMBERS COME BACK',
          description: 'When every session has a score, members return to improve it. Leaderboards create weekly habits. Challenges create monthly goals. The average member visits more often when they\'re competing.',
        },
        {
          title: 'SPONSORS PAY YOU',
          description: 'Local supplement brands, spas, and sports shops sponsor challenges on your gym floor. They provide prizes. You earn revenue. You keep 70% of every sponsorship deal closed through your gym.',
        },
        {
          title: 'YOU SEE WHO\'S AT RISK',
          description: 'Members who stop showing up appear in your at-risk dashboard before you lose them. One automated message brings most of them back.',
        },
      ],
      visuals: {
        leaderboard: {
          title: 'WEEKLY LEADERBOARD',
        },
        challenge: {
          sponsor: 'SPONSORED BY OLIMP',
          title: 'OLIMP PROTEIN CHALLENGE',
          description: '€200 prize pool · 47 members competing',
        },
        dashboard: {
          title: 'AT-RISK MEMBERS',
          inactive: '7 days inactive',
        },
      },
    },
    sponsorsHero: {
      title: 'REACH ACTIVE GYM MEMBERS.',
      titleLine2: 'NOT IMPRESSIONS.',
      titleHighlight: 'COMPETITORS.',
      subtitle: 'Sweat Arenas put your brand at the center of a 30-day gym competition.\nMembers train to win your prizes. You get session data.',
      button: 'Request Arena Proposal',
      visual: {
        sponsoredBy: 'SPONSORED BY [YOUR BRAND]',
        arenaName: 'YOUR BRAND ARENA',
        membersCompeting: '47 members competing · 8 days left',
      },
    },
    membersHero: {
      title: 'YOUR GYM JUST GOT',
      titleLine2: 'A LOT MORE',
      titleHighlight: 'INTERESTING.',
      subtitle: 'Connect to any machine. Earn drops every session.\nClimb your gym\'s leaderboard.\nWin real prizes every week.',
      downloadAppStore: 'Download on App Store',
      downloadGooglePlay: 'Get it on Google Play',
      joinWaitlist: 'Join the Waitlist — Be First in Your Gym',
      waitlistNote: 'We\'ll notify you the moment SweatDrop launches at your gym.',
      sessionComplete: 'Session complete',
      dropsEarned: 'Drops earned',
    },
    sweatArenasHero: {
      badge: 'SWEAT ARENAS',
      title: 'SPONSORED COMPETITIONS.',
      titleLine2: 'ON YOUR GYM FLOOR.',
      subtitle: 'Brands sponsor dedicated leaderboard competitions inside SweatDrop.\nMembers compete for prizes. Gyms earn revenue. Brands get real data.',
      imAGymOwner: 'I\'m a Gym Owner',
      imABrand: 'I\'m a Brand',
    },
    compatibleEquipment: {
      title: 'WORKS WITH WHAT YOU',
      titleHighlight: 'ALREADY HAVE',
      equipment: {
        treadmill: {
          title: 'TREADMILL',
          description: 'Smart treadmills connect directly via Bluetooth. No sensor needed.',
          compatible: 'COMPATIBLE:',
        },
        bike: {
          title: 'BIKE',
          description: 'Magene S3+ sensor clips onto the crank arm. Install in 60 seconds. No tools.',
          compatible: 'COMPATIBLE:',
        },
        elliptical: {
          title: 'ELLIPTICAL',
          description: 'Same Magene S3+ sensor. Works on any elliptical regardless of brand or age.',
          compatible: 'COMPATIBLE:',
        },
      },
      comingSoon: 'Weight machines and resistance equipment — coming in a future update.',
    },
    membersHowItWorks: {
      steps: [
        {
          number: 1,
          title: 'DOWNLOAD AND JOIN YOUR GYM',
          description: 'Download SweatDrop and create your profile. Free forever. Takes 30 seconds.',
        },
        {
          number: 2,
          title: 'WALK UP TO ANY MACHINE',
          description: 'SweatDrop connects automatically via Bluetooth. No pairing. No setup. Just start training.',
        },
        {
          number: 3,
          title: 'EARN DROPS. WIN PRIZES.',
          description: 'Every calorie burns drops. Every drop climbs the leaderboard. Top 10 every week wins.',
        },
      ],
    },
    whatYouEarn: {
      title: 'EVERY WORKOUT PAYS OFF',
      earnings: [
        {
          title: 'DROPS',
          subtitle: 'EARN DROPS',
          description: 'Earn drops every session based on how hard you train. The longer and harder the session, the more drops. Streak bonuses multiply your earnings.',
        },
        {
          title: 'WEEKLY PRIZES',
          subtitle: 'WIN REAL PRIZES',
          description: 'Top 10 on your gym\'s weekly leaderboard win real prizes — free memberships, PT sessions, supplement packages, spa vouchers. New prizes every Monday.',
        },
        {
          title: 'BADGES',
          subtitle: 'UNLOCK BADGES',
          description: 'Unlock badges for milestones. First session. 7-day streak. Top 3 finish. Monster session. Each badge earns bonus drops.',
        },
      ],
    },
    rewardStore: {
      title: 'SPEND YOUR DROPS.',
      subtitle: 'Your gym\'s reward store is stocked with real rewards you can claim with drops.\nNo cash. Just train and claim.',
      rewards: {
        proteinDiscount: 'Protein discount',
        freeShaker: 'Free shaker',
        ptSession: 'PT session',
        freeWeekPass: 'Free week pass',
      },
      expiryNote: 'Drops expire after 90 days — another reason to keep training.',
    },
    appScreenshots: {
      title: 'SEE IT IN ACTION',
      screens: {
        home: {
          label: 'Home',
          desc: 'Drops balance, streak, challenge',
        },
        liveSession: {
          label: 'Live Session',
          desc: 'Machine connected, drops ticking',
        },
        leaderboard: {
          label: 'Leaderboard',
          desc: 'Weekly, your rank highlighted',
        },
        rewardStore: {
          label: 'Reward Store',
          desc: 'Browse and claim',
        },
      },
    },
    howArenaWorks: {
      title: 'HOW A SWEAT ARENA WORKS',
      steps: [
        {
          number: 1,
          title: 'YOU DEFINE THE PRIZE',
          description: 'Your product, voucher, or experience becomes the prize pool. We handle all logistics.',
        },
        {
          number: 2,
          title: 'MEMBERS COMPETE',
          description: 'Members opt into your arena and train specifically to win your prizes. Your brand is in their mind every session for 30 days.',
        },
        {
          number: 3,
          title: 'YOU RECEIVE THE REPORT',
          description: 'After the arena closes: participant count, total sessions, visit frequency lift, demographics, and prize claim data.',
        },
      ],
    },
    whatIsArena: {
      panels: [
        {
          title: 'THE BRAND SETS THE PRIZE',
          description: 'A local spa, supplement brand, or sports shop defines a prize pool — their product, voucher, or experience. They pay SweatDrop to host it.',
        },
        {
          title: 'MEMBERS COMPETE',
          description: 'Members opt into the arena and train to climb the leaderboard. Your brand is front of mind every single session for 30 days.',
        },
        {
          title: 'WINNERS CLAIM. BRANDS GET DATA.',
          description: 'Top competitors win the prizes. The brand receives a full report: participants, session data, demographics.',
        },
      ],
    },
    waitlistForm: {
      success: "You're on the list! We'll notify you when SweatDrop launches.",
      placeholder: 'Enter your email',
      joining: 'Joining...',
      join: 'Join',
      error: 'Something went wrong. Please try again.',
    },
    forSponsors: {
      badge: 'FOR BRANDS & SPONSORS',
      title: 'YOUR AUDIENCE IS ALREADY',
      titleHighlight: 'AT THE GYM.',
      comparison: {
        traditional: {
          title: 'TRADITIONAL GYM ADS',
          items: [
            'Poster on the wall',
            'Members walk past it',
            'No engagement data',
            'Anyone sees it',
            'Passive awareness',
            '€50–150/month',
          ],
        },
        sweatArena: {
          title: 'SWEAT ARENA',
          items: [
            'Branded leaderboard in app',
            'Members compete for 30 days',
            'Full session report',
            'Opted-in competitors only',
            'Active brand association',
            'From €150/month',
          ],
        },
      },
      whoRunsArenas: {
        title: 'WHO RUNS ARENAS',
        profiles: [
          {
            title: 'SUPPLEMENT & NUTRITION',
            description: 'Your exact customer. Already spending money on protein, vitamins, and training gear. Competing for your product creates trial. Trial converts.',
            examples: 'Protein brands, supplement shops, health food stores',
          },
          {
            title: 'SPA & WELLNESS',
            description: 'Gym members prioritize recovery. A SPA weekend attracts your premium customer — health-conscious, active, disposable income. High perceived prize value, strong opt-in rates.',
            examples: 'Spas, massage centers, wellness clinics, physiotherapy practices',
          },
          {
            title: 'SPORTS & LIFESTYLE',
            description: 'Active members are your most engaged customers. Clothing, footwear, and equipment worn during training gets maximum visibility every session.',
            examples: 'Sports shops, clothing brands, equipment stores, sportswear labels',
          },
        ],
      },
      arenaPricing: {
        title: 'ARENA PRICING',
        tiers: [
          {
            name: 'LOCAL ARENA',
            subtitle: 'One gym · 30 days',
            price: 'From €150/month',
            features: [
              'Branded leaderboard in app',
              'Your logo on all challenge cards',
              'Your logo in push notifications',
              'Basic report (participants + sessions)',
              'You provide prizes',
            ],
          },
          {
            name: 'REGIONAL ARENA',
            subtitle: '3–5 gyms · 30 days',
            price: 'From €500/month',
            features: [
              'Everything in Local',
              'Full demographic report',
              'Category exclusivity option',
              'Dedicated arena design',
              'You provide prizes',
            ],
          },
          {
            name: 'NETWORK ARENA',
            subtitle: 'All SweatDrop gyms · 30–90 days',
            price: 'From €1,500/month',
            features: [
              'Everything in Regional',
              'Premium data package',
              'Category exclusivity included',
              'Priority scheduling',
              'Founding rate available',
              'You provide prizes',
            ],
          },
        ],
        requestProposal: 'Request Proposal',
      },
      foundingSponsor: {
        badge: 'FOUNDING SPONSOR PROGRAM',
        title: 'Be the first brand in Belgrade.',
        description: '3 founding spots — 50% off first 3 arenas.\nFirst right on category exclusivity.',
        button: 'Apply for Founding Sponsor Rate',
      },
    },
    forGymOwners: {
      badge: 'FOR GYM OWNERS',
      title: 'YOUR GYM EARNS REVENUE',
      titleLine2: 'FROM EVERY ARENA',
      exampleDeal: {
        badge: 'EXAMPLE DEAL',
        supplementShopPays: 'A supplement shop pays:',
        youKeep: 'You keep (70%):',
        sweatDropFee: 'SweatDrop fee (30%):',
        yourWork: 'Your work:',
        zero: 'Zero',
      },
      revenueTable: {
        badge: 'REVENUE TABLE',
        arenaType: 'Arena Type',
        sponsorPays: 'Sponsor Pays',
        yourCut: 'Your Cut',
        rows: [
          { type: 'Local (1 gym)', sponsor: '€150–300/mo', cut: '€105–210/mo' },
          { type: 'Regional', sponsor: 'SweatDrop sells', cut: 'Flat fee/gym' },
          { type: 'Network', sponsor: 'SweatDrop sells', cut: 'Flat fee/gym' },
        ],
        note: 'Regional and Network arenas are sold by SweatDrop directly.\nYour gym participates automatically and earns a flat monthly fee.',
      },
      scoringModels: {
        title: 'DIFFERENT SCORING ATTRACTS',
        titleLine2: 'DIFFERENT MEMBERS',
        models: [
          {
            title: 'Total Drops',
            description: 'Effort wins. Rewards the hardest trainers.',
          },
          {
            title: 'Days Visited',
            description: 'Consistency wins. Great for retention.',
          },
          {
            title: 'Variety Score',
            description: 'Most machines used. Members explore the gym.',
          },
          {
            title: 'Longest Streak',
            description: 'Habit wins. Perfect for new members.',
          },
        ],
      },
      cta: 'Learn About Gym Plans',
    },
    sponsorsFAQ: {
      badge: 'FAQ — SPONSORS',
      title: 'COMMON QUESTIONS',
      items: [
        {
          question: 'Who provides the prizes?',
          answer: 'You — your product, voucher, or experience. We host, manage, and promote the competition.',
        },
        {
          question: 'How do members receive prizes?',
          answer: 'Winners receive a unique redemption code in the app. They show it at your location or redeem online.',
        },
        {
          question: 'Can I target specific gyms?',
          answer: 'Yes. Local arenas run at the gym of your choice. Regional arenas target gyms in specific cities.',
        },
        {
          question: 'Can I prevent my competitors from advertising?',
          answer: 'Category exclusivity is available on Regional and Network plans. Only one brand per category per arena period.',
        },
        {
          question: 'When can the first arena start?',
          answer: 'First arenas launch when our pilot gyms go live in Q2 2026. Apply now to secure founding sponsor pricing.',
        },
        {
          question: 'Is there a minimum commitment?',
          answer: 'No. Each arena is a standalone 30-day campaign. No long-term contract required.',
        },
      ],
    },
    arenaFAQ: {
      badge: 'FAQ — ARENAS',
      title: 'COMMON QUESTIONS',
      items: [
        {
          question: 'Who provides the prizes?',
          answer: 'You do — your product, voucher, or experience. We host the competition and deliver the audience.',
        },
        {
          question: 'How many members will compete?',
          answer: 'Depends on gym size and prize appeal. Typically 20–60% of active members opt in when the prize is relevant to them.',
        },
        {
          question: 'Can I run an arena before SweatDrop is in multiple gyms?',
          answer: 'Yes. A single-gym local arena is available now for our pilot gym partners.',
        },
        {
          question: 'What data do I receive after?',
          answer: 'Participant count, total sessions during arena, visit frequency vs. baseline, peak training times, gender split, age range, prize claim data.',
        },
        {
          question: 'Can I prevent competitors from advertising too?',
          answer: 'Yes. Category exclusivity is available on Regional and Network plans.',
        },
        {
          question: 'When can the first arena start?',
          answer: 'First arenas launch when our pilot gyms go live in Q2 2026. Apply now to secure founding sponsor pricing.',
        },
      ],
    },
    findYourGym: {
      title: 'IS YOUR GYM ON SWEATDROP?',
      subtitle: 'SweatDrop is launching in Belgrade in Q2 2026.\nJoin the waitlist and we\'ll notify you when your gym goes live.',
      joinWaitlist: 'Join Waitlist',
      notListed: 'Your gym not listed?',
      tellGym: 'Tell your gym to apply →',
    },
    membersFinalCTA: {
      readyToStart: 'READY TO START EARNING?',
      beFirst: 'BE FIRST IN YOUR GYM.',
      bonus: 'Members who join in the first week start with a 200 drop bonus\nand newcomer leaderboard advantage.',
      joinWaitlist: 'Join Waitlist',
      appStore: 'App Store',
      googlePlay: 'Google Play',
    },
    foundingSponsor: {
      badge: 'FOUNDING SPONSOR PROGRAM',
      title: 'SweatDrop is launching in Belgrade in Q2 2026.',
      description: 'We are accepting 3 founding brand sponsors who will be first to reach our gym network.\n\nFounding sponsors receive:',
      benefits: [
        '50% off standard arena pricing for first 3 arenas',
        'First right of refusal on category exclusivity',
        'Co-marketing opportunities at launch',
        'Input on arena features during development',
      ],
      availability: '3 spots. First come, first served.',
      button: 'Apply for Founding Sponsor Rate',
    },
    arenaFinalCTA: {
      gymButton: 'I\'m a gym — add arenas to my plan',
      brandButton: 'I\'m a brand — request arena proposal',
    },
    whatYouReceive: {
      title: 'YOUR MONTHLY REPORT',
      badge: 'ARENA PERFORMANCE REPORT',
      items: [
        'Total opted-in participants',
        'Session count during arena period',
        'Visit frequency vs. 30 days prior',
        'Peak training days and times',
        'Gender split + estimated age range',
        'Prize claims: who won, when claimed',
        'Gym breakdown (regional/network)',
      ],
      delivery: 'Delivered within 5 days of arena close\nFormat: PDF + CSV export',
    },
    leaderboardSection: {
      badge: 'WEEKLY LEADERBOARD',
      title: 'COMPETE WITH YOUR GYM.',
      titleLine2: 'EVERY WEEK.',
      description: 'The leaderboard resets every Monday.\nEveryone starts from zero.\nThat means anyone can win.',
      updates: 'Your rank updates every 5 minutes.\nWhen someone passes you, you\'ll get a notification.\nYou\'ll want to go back.',
      newcomer: {
        badge: 'NEW MEMBERS — YOU\'RE PROTECTED',
        description: 'First 30 days: separate newcomer leaderboard.\nSame prizes. Only other new members.\nFair start guaranteed.',
      },
    },
    arenasForMembers: {
      title: 'COMPETE FOR BRAND PRIZES.',
      description: 'Sweat Arenas are optional competitions sponsored by local brands.\nOpt in, train hard, win their prizes.\n\nA spa weekend. A supplement package. A sports kit.\nNew arenas launch regularly.',
      note: 'Arenas are optional — you choose which ones to enter.\nYour regular leaderboard rank is never affected.',
      learnMore: 'Learn About Sweat Arenas',
      visual: {
        sponsoredBy: 'SPONSORED BY OLIMP',
        arenaName: 'OLIMP PROTEIN ARENA',
        daysLeft: '8D LEFT',
        membersCompeting: '47 members competing',
        prize: 'Prize: Protein bundle',
      },
    },
    problemComparison: {
      traditional: {
        title: 'TRADITIONAL GYM ADS',
        items: [
          'Poster on the wall',
          'Members walk past it',
          'Zero engagement data',
          'Anyone sees it',
          'Passive awareness',
          'No targeting',
          '€50–150/month',
        ],
      },
      sweatArena: {
        title: 'SWEAT ARENA',
        items: [
          'Branded leaderboard in app',
          'Members compete for 30 days',
          'Full session report',
          'Opted-in competitors only',
          'Active brand association',
          'Targeted audience',
          'From €150/month',
        ],
      },
    },
    projectedNumbers: {
      title: 'WHAT TO EXPECT',
      projections: [
        { value: '30–80', label: 'Opted-in participants', unit: '' },
        { value: '200–500', label: 'Total sessions', unit: '' },
        { value: '800–2,000', label: 'App opens', unit: '(brand exposures)' },
        { value: '30 days', label: 'Standard duration', unit: '' },
      ],
      note: 'Projections based on average gym activity data.\nActual numbers depend on gym size and prize relevance.\nWe provide specific projections in your proposal.',
    },
    sweatArenasPreview: {
      badge: 'NEW — SWEAT ARENAS',
      title: 'EARN MORE REVENUE WITH',
      titleHighlight: 'SPONSORED COMPETITIONS',
      description: 'Brands sponsor dedicated competitions at your gym.\nMembers compete for their prizes. You earn revenue\nwithout lifting a finger. 70% of every sponsorship\ngoes directly to you.',
      learnMore: 'Learn About Sweat Arenas',
      visual: {
        sponsoredBy: 'SPONSORED BY OLIMP',
        arenaName: 'OLIMP PROTEIN ARENA',
        daysLeft: '2D LEFT',
        progress: 'Progress',
        membersCompeting: '47 members competing',
        prize: 'Prize: Protein bundle',
      },
    },
  },
  sr: {
    hero: {
      title: 'Tvoji Članovi Odlaze',
      titleHighlight: 'Evo Kako da Zaustaviš',
      subtitle: '47% članova teretane napusti u roku od 6 meseci. Sweat Drop pretvara svaki trening u igru—držeći članove angažovanim, motivisanim i vraćajući ih nazad.',
      cta: 'Izračunaj ROI',
      ctaSecondary: 'Vidi Kako Radi',
    },
    heroMinimal: {
      subtitle: 'IoT Platforma za Moderne Teretane.',
      description: 'Transformiši svoju opremu u povezana iskustva. Povećaj zadržavanje. Povećaj prihod.',
      ctaPrimary: 'Zatraži Demo',
      ctaSecondary: 'Prijavi se za Pilot',
    },
    homeHero: {
      eyebrow: 'POKRETANJE Q2 2026 U BEOGRADU',
      title: 'BUDI PRVA TERETANA',
      titleLine2: 'U BEOGRADU',
      titleLine3: 'SA SWEATDROP-OM.',
      subtitle: 'Pretvori svoj kardio deo u dnevno takmičenje.\nČlanovi zarađuju kapi, penju se na rang liste, osvajaju stvarne nagrade.\nDobijaš podatke o zadržavanju koji dokazuju ROI.\n90 dana besplatno. Mi sve rešavamo.',
      scarcity: '3 PILOT MESTA — 1 VEĆ REZERVISANO',
      ctaPrimary: 'Prijavi se za Besplatan Pilot — 2 Mesta Preostalo',
      ctaSecondary: 'Vidi Kako Radi',
      phoneMockup: {
        availableDrops: 'DOSTUPNE KAPI',
        sessions: 'Sesije',
        rank: 'Rang',
        streak: 'Serija',
      },
    },
    whatIsSweatDrop: {
      title: 'Šta je SweatDrop',
      description: 'IoT senzori i mobilna aplikacija koja transformiše opremu tvoje teretane u povezana, gejmifikovana iskustva.\n\nČlanovi zarađuju nagrade. Ti dobijaš uvid.',
    },
    requestDemo: {
      title: 'Zatraži Demo',
      submit: 'Pošalji Zahtev',
      cancel: 'Otkaži',
      close: 'Zatvori',
      success: 'Kontaktiraćemo vas u roku od 24 sata.',
      fields: {
        fullName: 'Ime i Prezime',
        gymName: 'Naziv Teretane',
        email: 'Email',
        phone: 'Telefon',
        locations: 'Broj Lokacija',
        message: 'Poruka',
      },
      locations: {
        one: '1',
        twoToFive: '2-5',
        fivePlus: '5+',
      },
      errors: {
        required: 'Ovo polje je obavezno',
        email: 'Unesite validnu email adresu',
      },
    },
    applyPilot: {
      title: 'Prijavi se za Pilot',
      submit: 'Prijavi se za Pilot',
      cancel: 'Otkaži',
      close: 'Zatvori',
      success: 'Prijava primljena. Naš tim će pregledati i odgovoriti uskoro.',
      fields: {
        fullName: 'Ime i Prezime',
        gymName: 'Naziv Teretane',
        cityCountry: 'Grad / Država',
        activeMembers: 'Broj Aktivnih Članova',
        cardioMachines: 'Broj Kardio Mašina',
        multipleLocations: 'Da li imate više lokacija?',
        whyJoin: 'Zašto želite da se pridružite pilot programu?',
      },
      multipleLocations: {
        yes: 'Da',
        no: 'Ne',
      },
      errors: {
        required: 'Ovo polje je obavezno',
        number: 'Unesite validan broj',
      },
    },
    smartCardioSensors: {
      title: 'Pametni Kardio Senzori',
      subtitle: 'Neinvazivni senzori koji se montiraju na postojeću opremu. Nisu potrebne modifikacije.',
      cardioEcosystem: {
        title: 'Smart Cardio Ekosistem',
        subtitle: 'Neinvazivno, Bez modifikacija',
      },
      futureResistance: {
        title: 'Budućnost Otpora',
        subtitle: 'Uskoro',
        smartPin: {
          name: 'Smart Pin',
          description: 'Senzor koji zamenjuje standardne osigurače, prati ponavljanja i otpor.',
        },
        smartCarabiner: {
          name: 'Smart Carabiner',
          description: 'Inteligentni karabiner za sprave sa sajlama koji meri tenziju i ponavljanja.',
        },
        universalMotion: {
          name: 'Universal Motion Sensor',
          description: 'Ultra-mali senzor za bućice i šipke koji prati biomehaniku i putanju pokreta.',
        },
        joinBeta: 'PRIJAVI SE ZA BETA',
      },
    },
    appExperience: {
      title: 'Vežbaj. Zarađuj. Takmiči se.',
      features: {
        tracking: 'Automatsko praćenje treninga',
        rewards: 'Sweat Drops nagrade',
        leaderboards: 'Rang liste',
        challenges: 'Izazovi',
      },
    },
    whyItMatters: {
      title: 'Zašto je Važno',
      moreVisits: {
        title: 'Više Poseta',
        description: 'Članovi se vraćaju češće kada su treninzi nagrađeni.',
      },
      moreRevenue: {
        title: 'Više Prihoda',
        description: 'Povećano zadržavanje i angažovanje pokreću veću životnu vrednost članova.',
      },
      moreInsight: {
        title: 'Više Uvida',
        description: 'Podaci u realnom vremenu o korišćenju opreme i ponašanju članova.',
      },
    },
    adminPanel: {
      title: 'Admin Panel',
      subtitle: 'Potpuna kontrola nad digitalnim iskustvom tvoje teretane.',
      features: {
        dashboard: 'Dashboard u realnom vremenu',
        analytics: 'Analitika članova',
        rewards: 'Upravljanje nagradama',
        challenges: 'Kreiranje izazova',
        branding: 'Custom branding mobilne aplikacije',
      },
    },
    futureVision: {
      title: 'Ovo je tek početak.',
      roadmap: [
        'AI planovi treninga',
        'Marketplace ličnih trenera',
        'Napredna analitika',
      ],
    },
    pilotSection: {
      title: 'Počni sa Smart Zonom.',
      description: 'Testiraj SweatDrop u određenom delu tvoje teretane. 90-dnevni pilot program. Bez obaveza.',
      cta: 'Zatraži Demo',
    },
    problem: {
      badge: 'Problem',
      title: 'Skriveni Trošak',
      titleHighlight: 'Odlaska Članova',
      subtitle: 'Svaki član koji ode je novac koji izlazi kroz vrata. Ali postoje dublji problemi koji jedu tvoj prihod.',
      churn: {
        stat: 'Stopa Odlaska',
        description: 'Članovi odustaju jer ne vide napredak. Bez angažovanja, nemaju razlog da ostanu—i svaki razlog da otkažu.',
      },
      trainers: {
        stat: 'Bez Kontrole',
        description: 'Freelance treneri rade sa klijentima, ali ti nemaš nikakav uvid. Kada odu, klijenti idu sa njima—i ti gubiš sve.',
      },
      data: {
        stat: 'Bez Podataka',
        description: 'Ne znaš koja oprema donosi novac, a koja skuplja prašinu. Donosiš odluke na osnovu nagađanja, ne stvarnih podataka.',
      },
      monetization: {
        stat: 'Ograničen Prihod',
        description: 'Tvoj jedini izvor prihoda su članarine. Lični treninzi su preskupi za većinu članova, ostavljajući novac na stolu.',
      },
      cost: {
        title: 'Trošak Nečinjenja Ničega',
        description: 'Dok čekaš, tvoji konkurenti pobedjuju. Svaki dan bez digitalizacije je još jedan dan izgubljenog prihoda, nekontrolisanih trenera i slepih odluka. Pitanje nije da li možeš sebi da priuštiš implementaciju Smart-Gym-a—već da li možeš sebi da priuštiš da ne implementiraš.',
      },
    },
    dropCounter: {
      label: 'Kapi Zarađeno Danas',
      global: 'Globalno',
    },
    features: {
      title: 'Napravljeno za Performanse',
      subtitle: 'Tehnologija koja drži korak sa tvojim intenzitetom',
      realtime: {
        title: 'Sinhronizacija u Realnom Vremenu',
        description: 'Svako ponavljanje praćeno trenutno. Bez kašnjenja, bez praznina. Čisti podaci o performansama.',
      },
      leaderboards: {
        title: 'Globalne Rang Liste',
        description: 'Takmiči se sa svetom. Vidi gde se nalaziš među elitom.',
      },
      badges: {
        title: 'Sistem Badžova',
        description: 'Otključaj dostignuća. Izgradi svoju ostavštinu. Pokaži od čega si napravljen.',
      },
    },
    hardware: {
      title: 'Plug-and-Play Senzori',
      subtitle: 'Univerzalni senzori koji rade sa tvojom postojećom opremom. Nisu potrebne modifikacije.',
      cardio: {
        title: 'Kardio Zona',
        status: 'Aktivan',
        description: 'IoT rotacioni senzori za bicikle, magnetska sinhronizacija za trake, senzori za veslačke mašine. Montira se za nekoliko minuta, automatski prati intenzitet i pređeni put.',
      },
      strength: {
        title: 'Zona Snage',
        status: 'Uskoro',
        description: 'Pametni moduli (kao karabineri ili smart pinovi) koji prepoznaju težinu i broje ponavljanja. Neinvazivno pričvršćivanje, radi sa slobodnim tegovima i mašinama.',
      },
    },
    why: {
      title: 'Zašto Sweat Drop Radi',
      subtitle: 'Psihologija Gejmifikacije',
      description: 'Tradicionalne fitnes aplikacije se oslanjaju na volju. Sweat Drop koristi nešto dublje: ljudsku potrebu za dostignućem, priznanjem i napretkom. Svaka zarađena kap je mikro-pobeda. Svaka pozicija na rang listi je validacija. Svaki badž je dokaz. Ovo nije samo praćenje—ovo je transformacija.',
    },
    coverage: {
      title: 'Matrica Pokrivenosti Senzora',
      subtitle: 'Kompletan plan podrške opreme',
      equipment: 'Oprema',
      technology: 'Tehnologija',
      status: 'Status',
      active: 'Aktivan',
      comingSoon: 'Uskoro',
      rnd: 'Faza Istraživanja',
    },
    smartcoach: {
      subtitle: 'AI-powered lični trener koji prilagođava planove treninga ciljevima članova',
      headline: 'Budućnost Personalizovanog Treninga',
      features: [
        { title: 'AI Analiza', desc: 'Analizira obrasce performansi članova' },
        { title: 'Adaptivni Planovi', desc: 'Automatski se prilagođava napretku člana' },
        { title: 'Prediktivna Optimizacija', desc: 'Predviđa optimalne trenutke za trening' },
      ],
    },
    solution: {
      title: 'Rešenje',
      titleHighlight: 'Plug-and-Play Digitalizacija',
      subtitle: 'Transformiši svoju postojeću teretanu u Smart-Gym ekosistem. Nije potrebna nova oprema—samo univerzalni senzori koji integrišu sve sa mobilnom aplikacijom.',
      hook: 'Svaki Lit Znoja = Digitalna Valuta',
      description: 'Neinvazivni senzori se montiraju za nekoliko minuta. Bez bušenja, bez oštećenja, bez modifikacija. Čim član priđe spravi, telefon ga prepoznaje, aktivira praćenje i automatski upisuje rezultate. Tvoja teretana postaje prvi digitalizovani fitnes lanac na Balkanu.',
    },
    monetization: {
      badge: 'Monetizacija',
      title: '4 Izvora Prihoda',
      titleHighlight: 'Osim Članarina',
      subtitle: 'Prestani da se oslanjaš samo na članarine. Generiši pasivan prihod, kontroliši trenere, povećaj zadržavanje i zarađuj od partnerskih brendova.',
      smartcoach: {
        title: 'SmartCoach',
        subtitle: 'Pasivan Prihod - Skalabilna Digitalna Prodaja',
        description: 'Većina članova ne može da priušti ličnog trenera (€150+). Ponudi SmartCoach pretplate za delić te cene (npr. +€10/mesec). Članovi dobijaju digitalne planove, senzori prate da li ih sprovode. Prodaješ jedan digitalni proizvod hiljadama ljudi istovremeno—bez troškova radne snage.',
        revenue: 'Pasivan Prihod',
      },
      freelance: {
        title: 'Freelance Treneri',
        subtitle: 'Provizioni Prihod - Kontrola i Prihod',
        description: 'Dobij potpunu vidljivost u to šta freelance treneri rade sa klijentima. Treneri dobijaju alate, ti dobijaš procenat od svakog treninga i potpunu kontrolu. Najvažnije: podaci ostaju vezani za tvoju lokaciju. Ako trener ode, možeš odmah da ponudiš drugog trenera koji preuzima bez prekida.',
        revenue: 'Provizioni Prihod',
      },
      retention: {
        title: 'Zadržavanje i Lojalnost',
        subtitle: 'Indirektan Prihod - Lock-in Efekat',
        description: 'Gejmifikacija pretvara svaku kaloriju i svako ponavljanje u "Sweat Drops." Članovi koriste poene da plate suplemente na šanku ili dobiju popust na sledeću članarinu. Ovo stvara snažan lock-in efekat—članovi neće preći u drugu teretanu jer bi izgubili svoj akumulirani progres i digitalni novčanik.',
        revenue: 'Prihod od Zadržavanja',
      },
      marketplace: {
        title: 'Brand Marketplace',
        subtitle: 'B2B Prihod - Partnerski Brendovi',
        description: 'Tvoja teretana više nije ograničena samo na sopstveni šank. Kroz aplikaciju, brendovi (Pansport, Proteini.si, Decathlon, itd) nude ekskluzivne popuste članovima koji troše svoje "Sweat Drops." Tvoj profit: provizija od svake realizovane kupovine ili fiksna naknada od brendova za pristup tvojoj bazi aktivnih vežbača.',
        revenue: 'B2B Prihod',
      },
      summary: {
        title: 'Više Izvora Prihoda, Jedna Platforma',
        description: 'Transformiši svoju teretanu iz biznisa sa jednim izvorom prihoda u ekosistem sa više tokova. Generiši prihod dok spavaš, kontroliši ono što nisi mogao da vidiš, i pretvori angažovanost u profit.',
      },
    },
    analytics: {
      title: 'Menadžment Baziran na Podacima',
      subtitle: 'Prestani da nagađaš. Počni da znaš. Donosi odluke na osnovu stvarnih podataka, ne procena osoblja.',
      heatmap: {
        title: 'Heat-Map Izveštaji',
        subtitle: 'Vidi tačno koja oprema donosi novac, a koja skuplja prašinu',
        description: 'Dobij precizne vizuelne izveštaje koji pokazuju korišćenje opreme, prihod po mašini i obrasce angažovanja članova. Više se ne oslanjaj na procene osoblja o popunjenosti. Znaj tačno koja oprema pokreće vrednost, a koja zauzima prostor.',
      },
      usage: {
        title: 'Analitika Korišćenja',
        description: 'Prati korišćenje opreme u realnom vremenu. Vidi špiceve, popularne mašine i nedovoljno korišćene zone. Optimizuj raspored na osnovu stvarnog ponašanja članova.',
      },
      optimization: {
        title: 'Pametna Optimizacija',
        description: 'Koristi podatke da inteligentno planiraš buduće investicije u opremu. Ukloni mašine koje ne performiraju, dodaj ono što članovi stvarno žele, i maksimizuj efikasnost prostora.',
      },
      revenue: {
        title: 'Prihod po Mašini',
        description: 'Razumi koja oprema generiše najviše angažovanja i zadržavanja. Fokusiraj resurse na ono što stvarno pokreće zadovoljstvo članova i prihod.',
      },
    },
    businessValue: {
      title: 'Strateške Prednosti',
      subtitle: 'Transformiši svoju teretanu u biznis baziran na podacima sa više izvora prihoda',
      retention: {
        title: 'Povećaj Zadržavanje',
        description: 'Gejmifikovani treningovi drže članove angažovanim duže. Sweat Drops stvaraju lock-in efekat—članovi neće preći u drugu teretanu jer bi izgubili svoj akumulirani progres i digitalni novčanik.',
      },
      engagement: {
        title: 'Povećaj Angažovanost',
        description: 'Praćenje u realnom vremenu i trenutna gratifikacija pokreću češće posete. Članovi vide svoj napredak trenutno, stvarajući motivaciju koja ih vraća nazad.',
      },
      competitive: {
        title: 'Tržišno Liderstvo',
        description: 'Postani prvi digitalizovani fitnes lanac na Balkanu. Dok se konkurenti takmiče cenom, ti se takmičiš tehnologijom i inovacijama. Privuci klijente veće platežne moći koji vrednuju efikasnost i digitalno praćenje.',
      },
      data: {
        title: 'Menadžment Baziran na Podacima',
        description: 'Dobij precizne heat-map izveštaje koji pokazuju koja oprema donosi novac, a koja skuplja prašinu. Donosi odluke na osnovu stvarnih podataka, ne nagađanja. Optimizuj raspored opreme i planiraj buduće investicije inteligentno.',
      },
    },
    pilot: {
      badge: 'Pilot Program',
      title: 'Počni sa Jednom Smart Zonom',
      subtitle: 'Testiraj Smart-Gym u jednoj zoni 90 dana. Bez obaveza. Vidi stvarno interesovanje članova i stope konverzije.',
      duration: {
        title: '90-Dnevni Test Period',
        description: 'Jedna Smart Zona opremljena 90 dana. Testiraj stvarno interesovanje članova, angažovanost i konverziju u SmartCoach pretplate.',
      },
      commitment: {
        title: 'Nula Obaveza',
        description: 'Ako rezultati ne opravdaju investiciju, uklanjamo sve. Bez dugoročnih ugovora, bez skrivenih troškova, bez rizika.',
      },
      testing: {
        title: 'Prikupijanje Stvarnih Podataka',
        description: 'Meraj stvarno interesovanje članova, stope konverzije SmartCoach-a i obrasce angažovanja. Donosi informisane odluke na osnovu stvarnih podataka, ne projekcija.',
      },
      results: {
        title: 'Odluka Bazirana na Rezultatima',
        description: 'Nakon 90 dana, ti odlučuješ. Ako radi, proširi. Ako ne radi, uklanjamo sve. Jednostavno, transparentno, bez rizika.',
      },
      cta: {
        title: 'Spremni da Testiraš Smart-Gym?',
        description: 'Počni sa jednom zonom. Vidi stvarne rezultate. Donesi informisanu odluku. Nije potrebna obaveza.',
        button: 'Pokreni 90-Dnevni Pilot',
      },
    },
    cta: {
      title: 'Transformiši Svoju Teretanu. Pokreni Pilot.',
      subtitle: 'Testiraj Smart-Gym u jednoj zoni 90 dana. Bez obaveza. Vidi stvarno interesovanje članova i stope konverzije.',
      button: 'Pokreni Pilot Program',
      buttonSecondary: 'Zakaži Demo',
    },
    navigation: {
      forGyms: 'Za Teretane',
      pricing: 'Cenovnik',
      sweatArenas: 'Sweat Arenas',
      forMembers: 'Za Članove',
      forSponsors: 'Za Sponzore',
      applyForPilot: 'Prijavi se za Pilot',
    },
    footer: {
      tagline: 'Digitalni sloj za moderne teretane.',
      forGyms: 'Za Teretane',
      sweatArenas: 'Sweat Arenas',
      forMembers: 'Za Članove',
      forSponsors: 'Za Sponzore',
      privacy: 'Privatnost',
      terms: 'Uslovi',
    },
    contact: {
      title: 'Kontaktiraj Nas',
      successTitle: 'Poruka Poslata',
      successMessage: 'Hvala! Kontaktiraćemo vas u roku od 24 sata.',
      fields: {
        name: 'Tvoje Ime',
        company: 'Kompanija / Naziv Teretane',
        email: 'Email',
        phone: 'Telefon',
        locations: 'Broj Lokacija',
        message: 'Poruka (opciono)',
      },
      locations: {
        select: 'Izaberi...',
        threeToFive: '3-5 lokacija',
        sixToTen: '6-10 lokacija',
        tenToTwenty: '10-20 lokacija',
        twentyPlus: '20+ lokacija',
      },
      submit: 'Pošalji Poruku',
      cancel: 'Otkaži',
      close: 'Zatvori',
      errors: {
        required: 'Obavezno',
        email: 'Validna email adresa je obavezna',
      },
      errorGeneric: 'Nešto je pošlo po zlu. Molimo pokušajte ponovo.',
    },
    waitlist: {
      title: 'Pridruži se Listi Čekanja',
      successTitle: 'Na Listi Si!',
      successMessage: 'Obavestićemo te kada SweatDrop bude dostupan u tvojoj teretani.',
      fields: {
        email: 'Email',
        gymName: 'U kojoj teretani treniraš? (opciono)',
      },
      placeholders: {
        email: 'tvoj@email.com',
        gymName: 'Naziv teretane',
      },
      submit: 'Pridruži se Listi',
      close: 'Zatvori',
      errorGeneric: 'Nešto je pošlo po zlu. Molimo pokušajte ponovo.',
    },
    sponsorProposal: {
      title: 'Zatraži Predlog za Arenu',
      successTitle: 'Zahtev za Predlog Primljen',
      successMessage: 'Zahtev za predlog primljen! Poslaćemo ti prilagođene brojke u roku od 24 sata.',
      foundingBadge: '🏷 Prijavljuješ se za Program Osnivačkog Sponzora',
      foundingNote: '50% popusta na prve 3 arene · 3 mesta preostalo',
      fields: {
        company: 'Naziv Kompanije',
        name: 'Tvoje Ime',
        email: 'Email',
        phone: 'Telefon',
        website: 'Veb Sajt (opciono)',
        plan: 'Interesuje me',
        startDate: 'Idealni Datum Početka (opciono)',
        message: 'Reci nam o svom brendu (opciono)',
      },
      planOptions: {
        select: 'Izaberi...',
        local: 'Lokalna Arena (1 teretana) — od €150/mesec',
        regional: 'Regionalna Arena (3-5 teretana) — od €500/mesec',
        network: 'Mrežna Arena (sve teretane) — od €1,500/mesec',
        notSure: 'Još nisam siguran',
      },
      messagePlaceholder: 'Kategorija proizvoda, ciljna publika, ideja za nagradu koju imaš na umu...',
      submit: 'Pošalji Zahtev za Predlog',
      cancel: 'Otkaži',
      close: 'Zatvori',
      errors: {
        required: 'Obavezno',
        email: 'Validna email adresa je obavezna',
      },
      errorGeneric: 'Nešto je pošlo po zlu. Molimo pokušajte ponovo.',
    },
    pricing: {
      badge: 'CENOVNIK',
      title: 'JEDNOSTAVAN CENOVNIK.',
      subtitle: 'Otkazuj bilo kada. Bez skrivenih troškova.',
      monthly: 'Mesečno',
      annual: 'Godišnje — 2 meseca besplatno',
      mostPopular: 'NAJPOPULARNIJE',
      sensors: 'senzora',
      members: 'članova',
      upTo: 'Do',
      unlimited: 'Neograničeno',
      perMonth: '/mesec',
      perYear: '/god',
      startFreePilot: 'Pokreni Besplatni Pilot',
      enterprise: {
        text: 'Imaš 3+ lokacije? →',
        link: 'Kontaktiraj nas za enterprise cenovnik',
      },
      plans: {
        starter: 'STARTER',
        growth: 'GROWTH',
        pro: 'PRO',
        elite: 'ELITE',
        features: {
          weeklyLeaderboard: 'Nedeljna rang lista',
          basicRewardStore: 'Osnovna prodavnica nagrada (5 nagrada)',
          emailSupport: 'Email podrška',
          cardioZoneCoverage: 'Pokrivenost kardio zone',
          monthlyLeaderboard: 'Nedeljna + Mesečna rang lista',
          fullRewardStore: 'Puna prodavnica nagrada',
          twoActiveChallenges: '2 aktivna izazova',
          retentionDashboard: 'Dashboard zadržavanja',
          reEngagementNotifications: 'Obaveštenja za ponovno angažovanje',
          prioritySupport: 'Prioritetna podrška',
          allLeaderboards: 'Sve rang liste',
          unlimitedChallenges: 'Neograničeni izazovi',
          atRiskMemberAlerts: 'Upozorenja za članove pod rizikom',
          sweatArenaSupport: 'Podrška za Sweat Arenu',
          dedicatedOnboardingCall: 'Dedicirani poziv za onboarding',
          everythingInPro: 'Sve iz Pro paketa',
          upToThreeLocations: 'Do 3 lokacije',
          apiAccess: 'API pristup',
          quarterlyBusinessReview: 'Kvartalni pregled poslovanja',
          accountManager: 'Menadžer naloga',
        },
      },
    },
    faq: {
      badge: 'ČESTA PITANJA',
      title: 'ČESTA PITANJA',
      items: [
        {
          question: 'Da li moram da modifikujem opremu?',
          answer: 'Ne. Senzori se pričvršćuju ili se povezuju bežično. Ništa trajno. Ništa invazivno.',
        },
        {
          question: 'Koliko traje instalacija?',
          answer: '90 minuta za standardni kardio pod od 10–15 mašina.',
        },
        {
          question: 'Šta ako članovi ne preuzmu aplikaciju?',
          answer: 'Čak i delimična usvajanje stvara konkurenciju. Kada neki članovi vide druge na rang listi, usvajanje se brzo širi. Obično dostigne 60–70% aktivnih članova u prve dve nedelje.',
        },
        {
          question: 'Mogu li da postavim svoje nagrade i nagrade?',
          answer: 'Da. Ti kontrolišeš sve — šta je dostupno, koliko kapi košta, ograničenja zaliha i datume isteka.',
        },
        {
          question: 'Šta se dešava nakon 90-dnevnog pilota?',
          answer: 'Predstavljamo ti podatke o zadržavanju i preporučujemo pravi plan. Bez pritiska. Bez automatskog naplaćivanja.',
        },
        {
          question: 'Da li su podaci mojih članova sigurni?',
          answer: 'Svi podaci su šifrovani i čuvaju se na EU serverima. Nikada ne prodajemo podatke članova. Potpuna GDPR usklađenost.',
        },
        {
          question: 'Radite li sa više lokacija?',
          answer: 'Da. Elite plan podržava do 3 lokacije. Za veće lance, kontaktiraj nas za enterprise cenovnik.',
        },
      ],
    },
    howItWorks: {
      steps: [
        {
          number: 1,
          title: 'MI SVE POSTAVLJAMO',
          description: 'Naš tim poseti tvoju teretanu i poveže se sa tvojom postojećom kardio opremom. Pametne trake se povezuju direktno. Bicikli i eliptični koriste mali senzor koji se pričvršćuje. Traje 90 minuta. Bez bušenja. Bez žica.',
        },
        {
          number: 2,
          title: 'ČLANOVI SE TAKMIČE OD PRVOG DANA',
          description: 'Članovi preuzmu SweatDrop, unesu kod tvoje teretane, i rang lista odmah postaje aktivna. Svaka sesija zarađuje kapi. Svaka kap je korak bliže pobedi.',
        },
        {
          number: 3,
          title: 'TI POSMATRAŠ KAKO SE BROJEVI MENJAJU',
          description: 'Tvoj admin dashboard pokazuje učestalost poseta, članove pod rizikom i trendove zadržavanja nedelju za nedeljom. Šaljemo ti izveštaj svakog ponedeljka.',
        },
      ],
    },
    finalCTA: {
      title: 'DVA MESTA PREOSTALA.',
      subtitle: 'TVOJI KONKURENTI ĆE IH UZETI.',
      description: '90 dana besplatno. Kompletna instalacija uključena.\nNula obaveza. Stvarni rezultati.',
      button: 'Prijavi se za Besplatni Pilot Sada',
    },
    pilotProgram: {
      title: '90-DNEVNI PILOT PROGRAM',
      subtitle: 'Sve uključeno. Nula obaveza.',
      columns: {
        weProvide: {
          title: 'MI OBESBEĐUJEMO',
          items: [
            'Sve senzore',
            'Instalaciju',
            'Kompletnu postavku',
            'PRO funkcije',
            'Nedeljne izveštaje',
            'Direktnu podršku',
          ],
        },
        youProvide: {
          title: 'TI OBESBEĐUJEŠ',
          items: [
            'Pristup kardio podu',
            '90 minuta tvog vremena',
          ],
        },
        youKeep: {
          title: 'TI ZADRŽAVAŠ',
          items: [
            'Sve podatke članova',
            '100% prihoda od sponzora tokom pilota',
          ],
        },
      },
      bottomNote: 'Nakon 90 dana: izaberi plaćeni plan ili otkaži.\nUklanjamo senzore. Nula obaveza.',
      button: 'Prijavi se za Besplatni Pilot — 2 Mesta Preostala',
      availability: '● 1 MESTO VEĆ REZERVISANO — 2 PREOSTALA',
    },
    whyItWorks: {
      badge: 'ZAŠTO RADI',
      title: 'TRI RAZLOGA ZAŠTO VLASNICI TERETANA',
      titleHighlight: 'BIRAJU SWEATDROP',
      features: [
        {
          title: 'ČLANOVI SE VRATAJU',
          description: 'Kada svaka sesija ima rezultat, članovi se vraćaju da ga poboljšaju. Rang liste stvaraju nedeljne navike. Izazovi stvaraju mesečne ciljeve. Prosečan član posjećuje češće kada se takmiči.',
        },
        {
          title: 'SPONZORI TE PLATE',
          description: 'Lokalni brendovi suplemenata, spa centri i sportske radnje sponzorišu izazove na tvom kardio podu. Oni obezbeđuju nagrade. Ti zarađuješ prihod. Zadržavaš 70% od svakog sponzorskog ugovora zaključenog kroz tvoju teretanu.',
        },
        {
          title: 'VIDIŠ KO JE POD RIZIKOM',
          description: 'Članovi koji prestanu da dolaze pojavljuju se u tvom dashboard-u pod rizikom pre nego što ih izgubiš. Jedna automatska poruka vraća većinu njih nazad.',
        },
      ],
      visuals: {
        leaderboard: {
          title: 'NEDELJNA RANG LISTA',
        },
        challenge: {
          sponsor: 'SPONZORIŠE OLIMP',
          title: 'OLIMP PROTEIN IZAZOV',
          description: '€200 nagradni fond · 47 članova se takmiči',
        },
        dashboard: {
          title: 'ČLANOVI POD RIZIKOM',
          inactive: '7 dana neaktivno',
        },
      },
    },
    sponsorsHero: {
      title: 'DOSTIGNI AKTIVNE ČLANOVE TERETANE.',
      titleLine2: 'NE IMPRESIJE.',
      titleHighlight: 'KONKURENTE.',
      subtitle: 'Sweat Arenas stavljaju tvoj brend u centar 30-dnevnog takmičenja u teretani.\nČlanovi treniraju da osvoje tvoje nagrade. Ti dobijaš podatke o sesijama.',
      button: 'Zatraži Predlog za Arenu',
      visual: {
        sponsoredBy: 'SPONZORIŠE [TVOJ BREND]',
        arenaName: 'TVOJA BREND ARENA',
        membersCompeting: '47 članova se takmiči · 8 dana preostalo',
      },
    },
    membersHero: {
      title: 'TVOJA TERETANA JE UPRAVO POSTALA',
      titleLine2: 'MNOGO',
      titleHighlight: 'INTERESANTNIJA.',
      subtitle: 'Poveži se sa bilo kojom mašinom. Zarađuj kapi svaku sesiju.\nPenji se na rang listu svoje teretane.\nOsvoj stvarne nagrade svake nedelje.',
      downloadAppStore: 'Preuzmi na App Store',
      downloadGooglePlay: 'Preuzmi na Google Play',
      joinWaitlist: 'Pridruži se Listi Čekanja — Budi Prvi u Svojoj Teretani',
      waitlistNote: 'Obavestićemo te čim SweatDrop bude dostupan u tvojoj teretani.',
      sessionComplete: 'Sesija završena',
      dropsEarned: 'Kapi zarađeno',
    },
    sweatArenasHero: {
      badge: 'SWEAT ARENAS',
      title: 'SPONZORISANA TAKMIČENJA.',
      titleLine2: 'NA TVOJEM KARDIO PODU.',
      subtitle: 'Brendovi sponzorišu namenske rang liste unutar SweatDrop-a.\nČlanovi se takmiče za nagrade. Teretane zarađuju prihod. Brendovi dobijaju stvarne podatke.',
      imAGymOwner: 'Ja sam Vlasnik Teretane',
      imABrand: 'Ja sam Brend',
    },
    compatibleEquipment: {
      title: 'RADI SA ONIM ŠTO',
      titleHighlight: 'VEĆ IMAŠ',
      equipment: {
        treadmill: {
          title: 'TRAKA ZA TRČANJE',
          description: 'Pametne trake se povezuju direktno preko Bluetooth-a. Senzor nije potreban.',
          compatible: 'KOMPATIBILNO:',
        },
        bike: {
          title: 'BICIKL',
          description: 'Magene S3+ senzor se pričvršćuje na ručicu pedale. Instalira se za 60 sekundi. Bez alata.',
          compatible: 'KOMPATIBILNO:',
        },
        elliptical: {
          title: 'ELIPTIČNI',
          description: 'Isti Magene S3+ senzor. Radi na bilo kom eliptičnom bez obzira na brend ili starost.',
          compatible: 'KOMPATIBILNO:',
        },
      },
      comingSoon: 'Mašine za snagu i oprema za otpor — dolazi u budućem ažuriranju.',
    },
    membersHowItWorks: {
      steps: [
        {
          number: 1,
          title: 'PREUZMI I PRIDRUŽI SE SVOJ TERETANI',
          description: 'Preuzmi SweatDrop i kreiraj svoj profil. Besplatno zauvek. Traje 30 sekundi.',
        },
        {
          number: 2,
          title: 'PRIĐI BILO KOJOJ MAŠINI',
          description: 'SweatDrop se automatski povezuje preko Bluetooth-a. Bez uparivanja. Bez podešavanja. Samo počni da treniraš.',
        },
        {
          number: 3,
          title: 'ZARAĐUJ KAPI. OSVAJAJ NAGRADE.',
          description: 'Svaka kalorija zarađuje kapi. Svaka kap te penje na rang listu. Top 10 svake nedelje pobedjuje.',
        },
      ],
    },
    whatYouEarn: {
      title: 'SVAKI TRENING SE ISPLATI',
      earnings: [
        {
          title: 'KAPI',
          subtitle: 'ZARAĐUJ KAPI',
          description: 'Zarađuj kapi svaku sesiju na osnovu toga koliko naporno treniraš. Što duža i napornija sesija, to više kapi. Bonus za seriju umnožava tvoju zaradu.',
        },
        {
          title: 'NEDELJNE NAGRADE',
          subtitle: 'OSVAJAJ STVARNE NAGRADE',
          description: 'Top 10 na nedeljnoj rang listi tvoje teretane osvaja stvarne nagrade — besplatne članarine, PT sesije, pakete suplemenata, spa vaučere. Nove nagrade svakog ponedeljka.',
        },
        {
          title: 'BADŽEVI',
          subtitle: 'OTKLJUČAJ BADŽEVE',
          description: 'Otključaj badževe za postignuća. Prva sesija. 7-dnevna serija. Top 3 mesto. Monstrum sesija. Svaki badž zarađuje bonus kapi.',
        },
      ],
    },
    rewardStore: {
      title: 'TROŠI SVOJE KAPI.',
      subtitle: 'Prodavnica nagrada tvoje teretane je puna stvarnih nagrada koje možeš da zatražiš sa kapima.\nBez novca. Samo treniraj i zatraži.',
      rewards: {
        proteinDiscount: 'Popust na proteine',
        freeShaker: 'Besplatan šejker',
        ptSession: 'PT sesija',
        freeWeekPass: 'Besplatna nedeljna članarina',
      },
      expiryNote: 'Kapi ističu nakon 90 dana — još jedan razlog da nastaviš da treniraš.',
    },
    appScreenshots: {
      title: 'VIDI KAKO RADI',
      screens: {
        home: {
          label: 'Početna',
          desc: 'Stanje kapi, serija, izazov',
        },
        liveSession: {
          label: 'Aktivna Sesija',
          desc: 'Mašina povezana, kapi se povećavaju',
        },
        leaderboard: {
          label: 'Rang Lista',
          desc: 'Nedeljno, tvoj rang istaknut',
        },
        rewardStore: {
          label: 'Prodavnica Nagrada',
          desc: 'Pregledaj i zatraži',
        },
      },
    },
    howArenaWorks: {
      title: 'KAKO RADI SWEAT ARENA',
      steps: [
        {
          number: 1,
          title: 'TI ODREĐUJEŠ NAGRADU',
          description: 'Tvoj proizvod, vaučer ili iskustvo postaje nagradni fond. Mi rešavamo sve logistike.',
        },
        {
          number: 2,
          title: 'ČLANOVI SE TAKMIČE',
          description: 'Članovi se prijavljuju za tvoju arenu i treniraju specifično da osvoje tvoje nagrade. Tvoj brend im je u mislima svake sesije tokom 30 dana.',
        },
        {
          number: 3,
          title: 'TI DOBIJAŠ IZVEŠTAJ',
          description: 'Nakon što se arena zatvori: broj učesnika, ukupne sesije, povećanje učestalosti poseta, demografija i podaci o zatraženim nagradama.',
        },
      ],
    },
    whatIsArena: {
      panels: [
        {
          title: 'BREND ODREĐUJE NAGRADU',
          description: 'Lokalni spa, brend suplemenata ili sportska radnja određuje nagradni fond — njihov proizvod, vaučer ili iskustvo. Oni plaćaju SweatDrop da to organizuje.',
        },
        {
          title: 'ČLANOVI SE TAKMIČE',
          description: 'Članovi se prijavljuju za arenu i treniraju da se popnu na rang listu. Tvoj brend im je u mislima svake sesije tokom 30 dana.',
        },
        {
          title: 'POBEDNICI ZAHTEVAJU. BRENDOVI DOBIJAJU PODATKE.',
          description: 'Najbolji takmičari osvajaju nagrade. Brend dobija kompletan izveštaj: učesnici, podaci o sesijama, demografija.',
        },
      ],
    },
    waitlistForm: {
      success: 'Na listi si! Obavestićemo te kada SweatDrop bude dostupan.',
      placeholder: 'Unesi svoj email',
      joining: 'Pridruživanje...',
      join: 'Pridruži se',
      error: 'Nešto je pošlo po zlu. Molimo pokušajte ponovo.',
    },
    forSponsors: {
      badge: 'ZA BRENDOVE I SPONZORE',
      title: 'TVOJA PUBLIKA JE VEĆ',
      titleHighlight: 'U TERETANI.',
      comparison: {
        traditional: {
          title: 'TRADICIONALNI REKLAMNI POSTERI',
          items: [
            'Poster na zidu',
            'Članovi prolaze pored',
            'Bez podataka o angažovanju',
            'Svi ga vide',
            'Pasivna svest',
            '€50–150/mesec',
          ],
        },
        sweatArena: {
          title: 'SWEAT ARENA',
          items: [
            'Brandirana rang lista u aplikaciji',
            'Članovi se takmiče 30 dana',
            'Kompletan izveštaj o sesijama',
            'Samo prijavljeni takmičari',
            'Aktivna asocijacija brenda',
            'Od €150/mesec',
          ],
        },
      },
      whoRunsArenas: {
        title: 'KO POKREĆE ARENE',
        profiles: [
          {
            title: 'SUPLEMENTI I ISHRANA',
            description: 'Tvoj tačan klijent. Već troše novac na proteine, vitamine i opremu za trening. Takmičenje za tvoj proizvod stvara probu. Proba se pretvara.',
            examples: 'Brendovi proteina, radnje sa suplementima, radnje zdrave hrane',
          },
          {
            title: 'SPA I WELLNESS',
            description: 'Članovi teretane daju prioritet oporavku. SPA vikend privlači tvog premium klijenta — svestan zdravlja, aktivan, raspoloživ prihod. Visoka percipirana vrednost nagrade, jake stope prijavljivanja.',
            examples: 'Spa centri, centri za masažu, wellness klinike, fizioterapijske prakse',
          },
          {
            title: 'SPORT I LIFESTYLE',
            description: 'Aktivni članovi su tvoji najangažovaniji klijenti. Odeća, obuća i oprema koja se nosi tokom treninga dobija maksimalnu vidljivost svake sesije.',
            examples: 'Sportske radnje, brendovi odeće, radnje sa opremom, brendovi sportske odeće',
          },
        ],
      },
      arenaPricing: {
        title: 'CENOVNIK ARENA',
        tiers: [
          {
            name: 'LOKALNA ARENA',
            subtitle: 'Jedna teretana · 30 dana',
            price: 'Od €150/mesec',
            features: [
              'Brandirana rang lista u aplikaciji',
              'Tvoj logo na svim kartama izazova',
              'Tvoj logo u push obaveštenjima',
              'Osnovni izveštaj (učesnici + sesije)',
              'Ti obezbeđuješ nagrade',
            ],
          },
          {
            name: 'REGIONALNA ARENA',
            subtitle: '3–5 teretana · 30 dana',
            price: 'Od €500/mesec',
            features: [
              'Sve iz Lokalne',
              'Kompletan demografski izveštaj',
              'Opcija ekskluzivnosti kategorije',
              'Dedicirani dizajn arene',
              'Ti obezbeđuješ nagrade',
            ],
          },
          {
            name: 'MREŽNA ARENA',
            subtitle: 'Sve SweatDrop teretane · 30–90 dana',
            price: 'Od €1,500/mesec',
            features: [
              'Sve iz Regionalne',
              'Premium paket podataka',
              'Ekskluzivnost kategorije uključena',
              'Prioritetno zakazivanje',
              'Osnivački cenovnik dostupan',
              'Ti obezbeđuješ nagrade',
            ],
          },
        ],
        requestProposal: 'Zatraži Predlog',
      },
      foundingSponsor: {
        badge: 'PROGRAM OSNIVAČKOG SPONZORA',
        title: 'Budi prvi brend u Beogradu.',
        description: '3 osnivačka mesta — 50% popusta na prve 3 arene.\nPrvo pravo na ekskluzivnost kategorije.',
        button: 'Prijavi se za Osnivački Cenovnik',
      },
    },
    forGymOwners: {
      badge: 'ZA VLASNIKE TERETANA',
      title: 'TVOJA TERETANA ZARAĐUJE PRIHOD',
      titleLine2: 'OD SVAKE ARENE',
      exampleDeal: {
        badge: 'PRIMER UGOVORA',
        supplementShopPays: 'Radnja sa suplementima plaća:',
        youKeep: 'Ti zadržavaš (70%):',
        sweatDropFee: 'SweatDrop naknada (30%):',
        yourWork: 'Tvoj posao:',
        zero: 'Nula',
      },
      revenueTable: {
        badge: 'TABELA PRIHODA',
        arenaType: 'Tip Arene',
        sponsorPays: 'Sponzor Plaća',
        yourCut: 'Tvoj Deo',
        rows: [
          { type: 'Lokalna (1 teretana)', sponsor: '€150–300/mesec', cut: '€105–210/mesec' },
          { type: 'Regionalna', sponsor: 'SweatDrop prodaje', cut: 'Fiksna naknada/teretana' },
          { type: 'Mrežna', sponsor: 'SweatDrop prodaje', cut: 'Fiksna naknada/teretana' },
        ],
        note: 'Regionalne i Mrežne arene prodaje SweatDrop direktno.\nTvoja teretana učestvuje automatski i zarađuje fiksnu mesečnu naknadu.',
      },
      scoringModels: {
        title: 'RAZLIČITO BODOVANJE PRIVLAČI',
        titleLine2: 'RAZLIČITE ČLANOVE',
        models: [
          {
            title: 'Ukupne Kapi',
            description: 'Napor pobedjuje. Nagrađuje najnapornije trenere.',
          },
          {
            title: 'Dani Posete',
            description: 'Konzistentnost pobedjuje. Odlično za zadržavanje.',
          },
          {
            title: 'Skor Raznovrsnosti',
            description: 'Najviše korišćenih mašina. Članovi istražuju teretanu.',
          },
          {
            title: 'Najduža Serija',
            description: 'Navika pobedjuje. Savršeno za nove članove.',
          },
        ],
      },
      cta: 'Saznaj Više o Planovima za Teretane',
    },
    sponsorsFAQ: {
      badge: 'FAQ — SPONZORI',
      title: 'ČESTA PITANJA',
      items: [
        {
          question: 'Ko obezbeđuje nagrade?',
          answer: 'Ti — tvoj proizvod, vaučer ili iskustvo. Mi organizujemo, upravljamo i promovišemo takmičenje.',
        },
        {
          question: 'Kako članovi dobijaju nagrade?',
          answer: 'Pobednici dobijaju jedinstveni kod za iskorišćenje u aplikaciji. Pokazuju ga na tvojoj lokaciji ili koriste online.',
        },
        {
          question: 'Mogu li da ciljam određene teretane?',
          answer: 'Da. Lokalne arene se odvijaju u teretani po tvom izboru. Regionalne arene ciljaju teretane u određenim gradovima.',
        },
        {
          question: 'Mogu li da sprečim konkurente da reklamiraju?',
          answer: 'Ekskluzivnost kategorije je dostupna na Regionalnim i Mrežnim planovima. Samo jedan brend po kategoriji po periodu arene.',
        },
        {
          question: 'Kada može prva arena da počne?',
          answer: 'Prve arene se pokreću kada naše pilot teretane budu aktivne u Q2 2026. Prijavi se sada da osiguraš osnivački cenovnik sponzora.',
        },
        {
          question: 'Postoji li minimalna obaveza?',
          answer: 'Ne. Svaka arena je samostalna 30-dnevna kampanja. Nije potreban dugoročni ugovor.',
        },
      ],
    },
    arenaFAQ: {
      badge: 'FAQ — ARENE',
      title: 'ČESTA PITANJA',
      items: [
        {
          question: 'Ko obezbeđuje nagrade?',
          answer: 'Ti — tvoj proizvod, vaučer ili iskustvo. Mi organizujemo takmičenje i obezbeđujemo publiku.',
        },
        {
          question: 'Koliko članova će se takmičiti?',
          answer: 'Zavisi od veličine teretane i privlačnosti nagrade. Obično 20–60% aktivnih članova se prijavljuje kada im je nagrada relevantna.',
        },
        {
          question: 'Mogu li da pokrenem arenu pre nego što SweatDrop bude u više teretana?',
          answer: 'Da. Lokalna arena za jednu teretanu je dostupna sada za naše pilot partnere teretana.',
        },
        {
          question: 'Koje podatke dobijam nakon?',
          answer: 'Broj učesnika, ukupne sesije tokom arene, učestalost poseta u odnosu na osnovu, špicevi treninga, podela po polu, starosni opseg, podaci o zatraženim nagradama.',
        },
        {
          question: 'Mogu li da sprečim konkurente da reklamiraju takođe?',
          answer: 'Da. Ekskluzivnost kategorije je dostupna na Regionalnim i Mrežnim planovima.',
        },
        {
          question: 'Kada može prva arena da počne?',
          answer: 'Prve arene se pokreću kada naše pilot teretane budu aktivne u Q2 2026. Prijavi se sada da osiguraš osnivački cenovnik sponzora.',
        },
      ],
    },
    findYourGym: {
      title: 'DA LI JE TVOJA TERETANA NA SWEATDROP-U?',
      subtitle: 'SweatDrop se pokreće u Beogradu u Q2 2026.\nPridruži se listi čekanja i obavestićemo te kada tvoja teretana bude aktivna.',
      joinWaitlist: 'Pridruži se Listi',
      notListed: 'Tvoja teretana nije na listi?',
      tellGym: 'Reci svojoj teretani da se prijavi →',
    },
    membersFinalCTA: {
      readyToStart: 'SPREMN SI DA POČNEŠ DA ZARAĐUJEŠ?',
      beFirst: 'BUDI PRVI U SVOJ TERETANI.',
      bonus: 'Članovi koji se pridruže u prvoj nedelji počinju sa bonusom od 200 kapi\ni prednost na rang listi za nove članove.',
      joinWaitlist: 'Pridruži se Listi',
      appStore: 'App Store',
      googlePlay: 'Google Play',
    },
    foundingSponsor: {
      badge: 'PROGRAM OSNIVAČKOG SPONZORA',
      title: 'SweatDrop se pokreće u Beogradu u Q2 2026.',
      description: 'Prihvatamo 3 osnivačka brend sponzora koji će prvi dostići našu mrežu teretana.\n\nOsnivački sponzori dobijaju:',
      benefits: [
        '50% popusta na standardni cenovnik arena za prve 3 arene',
        'Prvo pravo odbijanja na ekskluzivnost kategorije',
        'Mogućnosti zajedničkog marketinga pri pokretanju',
        'Uticaj na funkcije arena tokom razvoja',
      ],
      availability: '3 mesta. Ko prvi, taj dobio.',
      button: 'Prijavi se za Osnivački Cenovnik',
    },
    arenaFinalCTA: {
      gymButton: 'Ja sam teretana — dodaj arene u moj plan',
      brandButton: 'Ja sam brend — zatraži predlog za arenu',
    },
    whatYouReceive: {
      title: 'TVOJ MESEČNI IZVEŠTAJ',
      badge: 'IZVEŠTAJ O PERFORMANSAMA ARENE',
      items: [
        'Ukupan broj prijavljenih učesnika',
        'Broj sesija tokom perioda arene',
        'Učestalost poseta u odnosu na 30 dana pre',
        'Špicevi treninga po danima i vremenu',
        'Podela po polu + procenjeni starosni opseg',
        'Zatražene nagrade: ko je pobedio, kada zatraženo',
        'Pregled po teretanama (regionalna/mrežna)',
      ],
      delivery: 'Dostavljeno u roku od 5 dana od zatvaranja arene\nFormat: PDF + CSV izvoz',
    },
    leaderboardSection: {
      badge: 'NEDELJNA RANG LISTA',
      title: 'TAKMIČI SE SA SVOJOM TERETANOM.',
      titleLine2: 'SVAKE NEDELJE.',
      description: 'Rang lista se resetuje svakog ponedeljka.\nSvi počinju od nule.\nTo znači da svako može da pobedi.',
      updates: 'Tvoj rang se ažurira svakih 5 minuta.\nKada te neko prestigne, dobićeš obaveštenje.\nPoželeti ćeš da se vratiš.',
      newcomer: {
        badge: 'NOVI ČLANOVI — ZAŠTIĆENI STE',
        description: 'Prvih 30 dana: odvojena rang lista za nove članove.\nIste nagrade. Samo drugi novi članovi.\nPošten start zagarantovan.',
      },
    },
    arenasForMembers: {
      title: 'TAKMIČI SE ZA NAGRADE BRENDOVA.',
      description: 'Sweat Arenas su opciona takmičenja koja sponzorišu lokalni brendovi.\nPrijavi se, treniraj naporno, osvoj njihove nagrade.\n\nSpa vikend. Paket suplemenata. Sportska oprema.\nNove arene se pokreću redovno.',
      note: 'Arene su opcione — ti biraš u koje se prijavljuješ.\nTvoj redovni rang na rang listi nikada nije utiče.',
      learnMore: 'Saznaj Više o Sweat Arenama',
      visual: {
        sponsoredBy: 'SPONZORIŠE OLIMP',
        arenaName: 'OLIMP PROTEIN ARENA',
        daysLeft: '8D PREOSTALO',
        membersCompeting: '47 članova se takmiči',
        prize: 'Nagrada: Paket proteina',
      },
    },
    problemComparison: {
      traditional: {
        title: 'TRADICIONALNI REKLAMNI POSTERI',
        items: [
          'Poster na zidu',
          'Članovi prolaze pored',
          'Nula podataka o angažovanju',
          'Svi ga vide',
          'Pasivna svest',
          'Bez ciljanja',
          '€50–150/mesec',
        ],
      },
      sweatArena: {
        title: 'SWEAT ARENA',
        items: [
          'Brandirana rang lista u aplikaciji',
          'Članovi se takmiče 30 dana',
          'Kompletan izveštaj o sesijama',
          'Samo prijavljeni takmičari',
          'Aktivna asocijacija brenda',
          'Ciljana publika',
          'Od €150/mesec',
        ],
      },
    },
    projectedNumbers: {
      title: 'ŠTA OČEKIVATI',
      projections: [
        { value: '30–80', label: 'Prijavljenih učesnika', unit: '' },
        { value: '200–500', label: 'Ukupne sesije', unit: '' },
        { value: '800–2,000', label: 'Otvaranja aplikacije', unit: '(izloženost brenda)' },
        { value: '30 dana', label: 'Standardno trajanje', unit: '' },
      ],
      note: 'Projekcije bazirane na prosečnim podacima aktivnosti teretana.\nStvarni brojevi zavise od veličine teretane i relevantnosti nagrade.\nDajemo specifične projekcije u tvom predlogu.',
    },
    sweatArenasPreview: {
      badge: 'NOVO — SWEAT ARENAS',
      title: 'ZARAĐUJ VIŠE PRIHODA SA',
      titleHighlight: 'SPONZORISANIM TAKMIČENJIMA',
      description: 'Brendovi sponzorišu namenska takmičenja u tvojoj teretani.\nČlanovi se takmiče za njihove nagrade. Ti zarađuješ prihod\nbez da pomeriš prst. 70% od svakog sponzorstva\nide direktno tebi.',
      learnMore: 'Saznaj Više o Sweat Arenama',
      visual: {
        sponsoredBy: 'SPONZORIŠE OLIMP',
        arenaName: 'OLIMP PROTEIN ARENA',
        daysLeft: '2D PREOSTALO',
        progress: 'Napredak',
        membersCompeting: '47 članova se takmiči',
        prize: 'Nagrada: Paket proteina',
      },
    },
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
