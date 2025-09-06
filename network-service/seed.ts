import { PrismaClient, PostType } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.postView.deleteMany();
  await prisma.postShare.deleteMany();
  await prisma.postComment.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.postBookmark.deleteMany();
  await prisma.postLink.deleteMany();
  await prisma.postTag.deleteMany();
  await prisma.postMedia.deleteMany();
  await prisma.media.deleteMany();
  await prisma.post.deleteMany();
  await prisma.userFollow.deleteMany();

  // Create sample posts with different types
  const posts = [
    {
      type: 'GENERAL' as PostType,
      content: '🎉 Welcome to the new Nexus Network! Excited to connect with fellow students and faculty. Let\'s build something amazing together! #nexus #networking',
      authorId: 'user1',
      authorDisplayName: 'Alex Johnson',
      authorRole: 'student',
      authorDepartment: 'Computer Science',
      authorCollegeId: 'college1',
      tags: ['nexus', 'networking', 'welcome'],
      likeCount: 15,
      commentCount: 8,
    },
    
    {
      type: 'BADGE_AWARD' as PostType,
      content: '🏆 Just earned my "Full Stack Developer" badge! Thanks to Prof. Smith for the amazing web development course.',
      authorId: 'user2',
      authorDisplayName: 'Sarah Chen',
      authorRole: 'student',
      authorDepartment: 'Computer Science',
      authorCollegeId: 'college1',
      badgeData: {
        badgeId: 'badge1',
        badgeName: 'Full Stack Developer',
        description: 'Mastered both frontend and backend development',
        criteria: 'Complete 3 full-stack projects and pass advanced web dev exam',
        rarity: 'rare'
      },
      tags: ['badge', 'fullstack', 'achievement'],
      likeCount: 32,
      commentCount: 12,
    },

    {
      type: 'PROJECT_UPDATE' as PostType,
      content: '🚀 Major milestone reached! Our AI-powered study assistant now supports 5 languages and has helped over 1000 students. Next up: mobile app launch!',
      authorId: 'user3',
      authorDisplayName: 'Michael Rodriguez',
      authorRole: 'student',
      authorDepartment: 'Artificial Intelligence',
      authorCollegeId: 'college1',
      projectData: {
        projectTitle: 'AI Study Assistant',
        milestone: 'Multi-language Support Launch',
        progress: 75,
        teamMembers: ['Michael Rodriguez', 'Lisa Park', 'David Kim'],
        githubUrl: 'https://github.com/nexus/ai-study-assistant',
        demoUrl: 'https://study.nexus.ai',
        techStack: ['Python', 'React', 'TensorFlow', 'PostgreSQL']
      },
      tags: ['ai', 'project', 'milestone', 'collaboration'],
      likeCount: 45,
      commentCount: 18,
    },

    {
      type: 'COLLABORATION' as PostType,
      content: '🤝 Looking for 2-3 passionate developers to join our startup idea: EcoTrack - a sustainability app that helps users reduce their carbon footprint. We have funding secured!',
      authorId: 'user4',
      authorDisplayName: 'Emma Thompson',
      authorRole: 'student',
      authorDepartment: 'Environmental Science',
      authorCollegeId: 'college1',
      collaborationData: {
        requiredSkills: ['React Native', 'Node.js', 'UI/UX Design', 'Environmental Science'],
        capacity: 3,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        applyInApp: true
      },
      tags: ['collaboration', 'startup', 'environment', 'sustainability'],
      likeCount: 28,
      commentCount: 22,
    },

    {
      type: 'EVENT' as PostType,
      content: '📅 Don\'t miss our upcoming "Women in Tech" symposium! Amazing speakers from Google, Microsoft, and Meta. Free registration for students!',
      authorId: 'user5',
      authorDisplayName: 'Dr. Jennifer Lee',
      authorRole: 'faculty',
      authorDepartment: 'Computer Science',
      authorCollegeId: 'college1',
      eventData: {
        title: 'Women in Tech Symposium 2025',
        date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Main Auditorium & Virtual',
        type: 'conference',
        registrationRequired: true,
        capacity: 500,
        registrationUrl: 'https://events.nexus.edu/women-in-tech-2025'
      },
      tags: ['event', 'women-in-tech', 'symposium', 'free'],
      likeCount: 67,
      commentCount: 35,
    },

    {
      type: 'JOB_POSTING' as PostType,
      content: '💼 Exciting opportunity! TechCorp is hiring Software Engineering Interns for Summer 2025. Competitive pay, mentorship program, and potential full-time offer!',
      authorId: 'user6',
      authorDisplayName: 'Career Services',
      authorRole: 'faculty',
      authorDepartment: 'Career Development',
      authorCollegeId: 'college1',
      jobData: {
        title: 'Software Engineering Intern',
        company: 'TechCorp Inc.',
        location: 'San Francisco, CA (Hybrid)',
        type: 'internship',
        deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        applyUrl: 'https://techcorp.com/careers/intern-2025',
        salaryRange: '$25-30/hour'
      },
      tags: ['internship', 'software', 'summer2025', 'techcorp'],
      likeCount: 89,
      commentCount: 43,
    },

    {
      type: 'RESEARCH_PAPER' as PostType,
      content: '📚 Our research on "Quantum Computing Applications in Machine Learning" has been accepted at ICML 2025! Proud of our team\'s hard work. PDF available below.',
      authorId: 'user7',
      authorDisplayName: 'Prof. Alan Turing',
      authorRole: 'faculty',
      authorDepartment: 'Quantum Computing',
      authorCollegeId: 'college1',
      links: [
        {
          url: 'https://arxiv.org/abs/2501.12345',
          title: 'Quantum Computing Applications in Machine Learning - ArXiv',
          order: 0
        }
      ],
      tags: ['research', 'quantum', 'machinelearning', 'icml2025'],
      likeCount: 156,
      commentCount: 67,
    }
  ];

  for (const postData of posts) {
    const { tags, links, ...postFields } = postData;
    
    const post = await prisma.post.create({
      data: {
        ...postFields,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time in last week
      }
    });

    // Add tags
    if (tags && tags.length > 0) {
      await prisma.postTag.createMany({
        data: tags.map(tag => ({
          postId: post.id,
          tag: tag.toLowerCase()
        }))
      });
    }

    // Add links
    if (links && links.length > 0) {
      await prisma.postLink.createMany({
        data: links.map(link => ({
          postId: post.id,
          url: link.url,
          title: link.title,
          order: link.order
        }))
      });
    }
  }

  // Create some sample media (placeholder images)
  const sampleMedia = await prisma.media.createMany({
    data: [
      {
        url: 'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=800',
        mimeType: 'image/jpeg',
        sizeBytes: 156789,
        width: 800,
        height: 600,
        storageKey: 'sample-code.jpg',
        ownerUserId: 'user1'
      },
      {
        url: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800',
        mimeType: 'image/jpeg', 
        sizeBytes: 234567,
        width: 800,
        height: 600,
        storageKey: 'sample-laptop.jpg',
        ownerUserId: 'user2'
      }
    ]
  });

  console.log('✅ Seed data created successfully!');
  console.log(`📝 Created ${posts.length} posts`);
  console.log('🖼️ Created sample media');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
