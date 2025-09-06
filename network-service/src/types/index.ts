import { PostType, PostVisibility, PostStatus } from '@prisma/client';

export { PostType, PostVisibility, PostStatus };

export interface CreatePostRequest {
  type: PostType;
  content?: string;
  visibility?: PostVisibility;
  status?: PostStatus;
  tags?: string[];
  links?: Array<{
    url: string;
    title?: string;
  }>;
  mediaIds?: string[];
  
  // Author fields from frontend
  authorCollegeId?: string;
  authorDepartment?: string;
  authorAvatarUrl?: string;
  
  // Type-specific data
  badgeData?: {
    badgeId: string;
    badgeName: string;
    description: string;
    criteria: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
  };
  
  collaborationData?: {
    requiredSkills: string[];
    capacity: number;
    deadline: string;
    applyInApp: boolean;
    applyLink?: string;
  };
  
  projectData?: {
    projectTitle: string;
    milestone: string;
    progress: number;
    teamMembers?: string[];
    githubUrl?: string;
    demoUrl?: string;
    techStack: string[];
  };
  
  eventData?: {
    title: string;
    date: string;
    location: string;
    type: 'workshop' | 'seminar' | 'conference' | 'competition';
    registrationRequired: boolean;
    capacity?: number;
    registrationUrl?: string;
  };
  
  jobData?: {
    title: string;
    company: string;
    location: string;
    type: 'full-time' | 'part-time' | 'internship' | 'contract';
    deadline?: string;
    applyUrl?: string;
    salaryRange?: string;
  };
}

export interface PostResponse {
  id: string;
  type: PostType;
  content?: string;
  visibility: PostVisibility;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  
  // Author info
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  authorRole: string;
  authorDepartment?: string;
  authorCollegeId: string;
  
  // Engagement
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  
  // User interactions
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  
  // Content
  media: MediaResponse[];
  tags: string[];
  links: Array<{
    url: string;
    title?: string;
    order: number;
  }>;
  
  // Type-specific data
  badgeData?: any;
  collaborationData?: any;
  projectData?: any;
  eventData?: any;
  jobData?: any;
}

export interface MediaResponse {
  id: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface CommentResponse {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
}

export interface FeedParams {
  scope?: 'global' | 'college' | 'following';
  cursor?: string;
  limit?: number;
  postTypes?: PostType[];
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}
