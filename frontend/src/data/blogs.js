const image = (id, width = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`

export const blogs = [
  {
    slug: 'simple-morning-skincare-routine',
    title: '5 Steps for a Simple Morning Skincare Routine',
    excerpt: 'Start the day with a calm, considered ritual.',
    image: image('photo-1556228578-8c89e6adf883'),
    body: 'A thoughtful morning routine does not need to be complicated. Begin with a gentle cleanse, follow with a hydrating serum, and finish with moisturizer and daily SPF. Give each layer a moment to settle so your skin feels comfortable and ready for the day.'
  },
  {
    slug: 'how-to-choose-the-right-sunscreen',
    title: 'How to Choose the Right Sunscreen',
    excerpt: 'Everything you need to know about daily SPF.',
    image: image('photo-1556228720-195a672e8a03'),
    body: 'The best sunscreen is one you will use every day. Look for broad-spectrum protection, choose a texture that suits your skin, and apply enough to cover your face, neck, and ears. Reapply when you spend extended time outdoors.'
  },
  {
    slug: 'build-a-night-skincare-routine',
    title: 'How to Build a Night Skincare Routine',
    excerpt: 'Small evening steps for beautifully rested skin.',
    image: image('photo-1611930022073-b7a4ba5fcccd'),
    body: 'An evening ritual is a chance to slow down. Remove the day gently, cleanse thoroughly, then apply treatments that suit your needs before sealing in moisture. Consistency matters more than a long list of products.'
  }
]