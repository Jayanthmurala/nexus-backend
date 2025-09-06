# Nexus Network Service Integration Guide

## 🎯 Complete CRUD & Role-Based Integration

This guide provides everything you need to integrate the Nexus Network Service with your frontend application, including complete CRUD operations and role-based access control.

## 📋 What's Been Implemented

### ✅ Backend Features (Complete)

#### **Core CRUD Operations**
- ✅ **Posts**: Create, Read, Update, Delete with full type support
- ✅ **Comments**: Full CRUD with nested threading support  
- ✅ **Bookmarks**: Toggle bookmarks, get user bookmarks
- ✅ **Likes**: Toggle likes with real-time counts
- ✅ **Media**: Upload, associate with posts, full gallery support

#### **Role-Based Access Control**
- ✅ **5-Tier Role System**: STUDENT → FACULTY → DEPT_ADMIN → PLACEMENTS_ADMIN → HEAD_ADMIN
- ✅ **Permission Hierarchy**: Higher roles inherit lower role permissions
- ✅ **Endpoint Protection**: Role-specific access to features
- ✅ **Content Ownership**: Users can modify their own content, admins can moderate all

#### **Post Types Supported**
- ✅ **GENERAL**: Basic social posts
- ✅ **PROJECT_UPDATE**: Progress updates with milestones, tech stack
- ✅ **BADGE_AWARD**: Achievement celebrations with rarity
- ✅ **COLLABORATION**: Team formation with skill requirements
- ✅ **JOB_POSTING**: Career opportunities (Admin only)
- ✅ **EVENT**: Campus events with registration
- ✅ **ANNOUNCEMENT**: Official announcements (Faculty+ only)
- ✅ **PROJECT_SHOWCASE**: Completed project displays
- ✅ **RESEARCH_PAPER**: Academic publications
- ✅ **EVENT_HIGHLIGHT**: Event summaries

#### **Admin Features**
- ✅ **Dashboard Stats**: Total posts, daily activity, user metrics
- ✅ **Content Moderation**: Approve, hide, delete, flag posts
- ✅ **Bulk Operations**: Mass approve/delete posts
- ✅ **User Management**: View user posts, moderation history
- ✅ **Analytics**: Engagement metrics, post type breakdown

#### **Advanced Features**
- ✅ **Infinite Scroll Pagination**: Cursor-based for performance
- ✅ **Multi-scope Feeds**: Global, college, following feeds
- ✅ **Media Gallery**: Images, videos with responsive grid
- ✅ **Tag System**: Hashtag support with filtering
- ✅ **Link Previews**: External link integration
- ✅ **Real-time Interactions**: Live like/comment counts

### ✅ Frontend Integration (Complete)

#### **API Client**
- ✅ **TypeScript Client**: Fully typed API wrapper
- ✅ **Authentication**: JWT token management
- ✅ **Error Handling**: Comprehensive error responses
- ✅ **Request/Response Types**: Full TypeScript definitions

#### **React Hooks**
- ✅ **Feed Management**: `useFeed` with infinite scroll
- ✅ **Post Operations**: `useCreatePost`, `useDeletePost`, `usePost`
- ✅ **Interactions**: `usePostInteractions` for likes/bookmarks
- ✅ **Comments**: `useComments` with CRUD operations
- ✅ **Media Upload**: `useMediaUpload` with progress
- ✅ **User Content**: `useUserPosts`, `useBookmarks`
- ✅ **Admin Features**: `useAdminStats`, admin hooks
- ✅ **Utilities**: `useDebounce`, `useLocalStorage`, `useInfiniteScroll`

#### **React Components**
- ✅ **Post Display**: `PostCard` with all post types
- ✅ **Feed Component**: `Feed` with infinite scroll
- ✅ **Media Gallery**: Responsive image/video grid
- ✅ **Comments System**: Nested comment threads
- ✅ **Post Interactions**: Like, bookmark, share buttons
- ✅ **Type-Specific Renderers**: Custom displays for each post type
- ✅ **Admin Dashboard**: Complete moderation interface
- ✅ **User Management**: Admin user oversight tools

---

## 🚀 Quick Start Integration

### 1. Install Dependencies

```bash
npm install @types/react @types/react-dom
```

### 2. Setup API Client

```typescript
// lib/network-client.ts
import { createNetworkClient } from '../network-service/frontend-integration/api-client';

export const networkClient = createNetworkClient({
  baseUrl: process.env.NEXT_PUBLIC_NETWORK_API_URL || 'http://localhost:4005',
  getAuthToken: () => {
    // Your auth token retrieval logic
    return localStorage.getItem('access_token');
  }
});
```

### 3. Create Network Context

```typescript
// contexts/NetworkContext.tsx
import React, { createContext, useContext } from 'react';
import { NetworkApiClient } from '../network-service/frontend-integration/api-client';
import { networkClient } from '../lib/network-client';

interface NetworkContextType {
  client: NetworkApiClient;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NetworkContext.Provider value={{ client: networkClient }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkClient = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkClient must be used within a NetworkProvider');
  }
  return context;
};
```

### 4. Create Home Feed Page

```typescript
// pages/home.tsx
import React, { useState } from 'react';
import { Feed } from '../network-service/frontend-integration/components';
import { useFeed, usePostTypeFilter } from '../network-service/frontend-integration/hooks';
import { useNetworkClient } from '../contexts/NetworkContext';
import { PostType } from '../network-service/frontend-integration/api-client';

const HomePage: React.FC = () => {
  const { client } = useNetworkClient();
  const [feedScope, setFeedScope] = useState<'global' | 'college' | 'following'>('college');
  const { selectedTypes, toggleType, clearTypes } = usePostTypeFilter();
  
  const { posts, loading, error, hasMore, loadMore, refresh } = useFeed(
    { 
      scope: feedScope,
      postTypes: selectedTypes.length > 0 ? selectedTypes : undefined
    },
    { client }
  );

  const handlePostUpdate = (postId: string, updatedPost: any) => {
    // Handle real-time post updates
    console.log('Post updated:', postId, updatedPost);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Nexus Network</h1>
          
          {/* Feed Scope Selector */}
          <div className="flex gap-2 mt-4">
            {(['global', 'college', 'following'] as const).map(scope => (
              <button
                key={scope}
                onClick={() => setFeedScope(scope)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  feedScope === scope
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {scope.charAt(0).toUpperCase() + scope.slice(1)}
              </button>
            ))}
          </div>

          {/* Post Type Filters */}
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.values(PostType).map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`px-3 py-1 rounded-full text-xs ${
                  selectedTypes.includes(type)
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
            {selectedTypes.length > 0 && (
              <button
                onClick={clearTypes}
                className="px-3 py-1 rounded-full text-xs bg-red-100 text-red-800"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feed Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading && posts.length === 0 ? (
          <div className="text-center py-8">Loading feed...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">
            Error: {error}
            <button
              onClick={refresh}
              className="block mt-2 mx-auto bg-red-500 text-white px-4 py-2 rounded"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <Feed
              posts={posts}
              config={{ client }}
              onPostUpdate={handlePostUpdate}
            />
            
            {hasMore && (
              <div className="text-center mt-6">
                <button
                  onClick={loadMore}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
                >
                  Load More Posts
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
```

### 5. Create Admin Dashboard

```typescript
// pages/admin.tsx
import React from 'react';
import { AdminDashboard } from '../network-service/frontend-integration/admin-dashboard';
import { useNetworkClient } from '../contexts/NetworkContext';

const AdminPage: React.FC = () => {
  const { client } = useNetworkClient();
  
  // Get current user info from your auth context
  const currentUser = {
    role: 'HEAD_ADMIN', // From your auth state
    displayName: 'John Admin'
  };

  return (
    <AdminDashboard 
      config={{ client }} 
      currentUser={currentUser}
    />
  );
};

export default AdminPage;
```

---

## 🎨 Styling Integration

### Tailwind CSS Setup

All components use Tailwind CSS classes. Add to your `tailwind.config.js`:

```javascript
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './network-service/frontend-integration/**/*.{js,ts,jsx,tsx}', // Add this
  ],
  theme: {
    extend: {
      // Add custom colors if needed
      colors: {
        nexus: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb'
        }
      }
    },
  },
  plugins: [],
};
```

### Custom CSS (Optional)

```css
/* styles/globals.css */
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Loading animations */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

---

## 🔒 Role-Based Feature Access

### Role Permissions Matrix

| Feature | STUDENT | FACULTY | DEPT_ADMIN | PLACEMENTS_ADMIN | HEAD_ADMIN |
|---------|---------|---------|------------|------------------|------------|
| View Feed | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create General Posts | ✅ | ✅ | ✅ | ✅ | ✅ |
| Like/Comment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Announcements | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create Job Postings | ❌ | ❌ | ❌ | ✅ | ✅ |
| Moderate Content | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bulk Delete Posts | ❌ | ❌ | ✅ | ✅ | ✅ |
| User Management | ❌ | ❌ | ❌ | ❌ | ✅ |
| View Analytics | ❌ | ❌ | ✅ | ✅ | ✅ |

### Implementing Role Checks

```typescript
// utils/permissions.ts
export const hasPermission = (userRole: string, requiredRole: string): boolean => {
  const hierarchy = {
    STUDENT: 1,
    FACULTY: 2,
    DEPT_ADMIN: 3,
    PLACEMENTS_ADMIN: 4,
    HEAD_ADMIN: 5
  };
  
  return hierarchy[userRole] >= hierarchy[requiredRole];
};

// Component example
const CreateAnnouncementButton: React.FC<{ userRole: string }> = ({ userRole }) => {
  if (!hasPermission(userRole, 'FACULTY')) {
    return null;
  }
  
  return (
    <button className="bg-blue-500 text-white px-4 py-2 rounded">
      Create Announcement
    </button>
  );
};
```

---

## 📱 Responsive Design

All components are built with mobile-first responsive design:

```typescript
// Example responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Content */}
</div>

// Responsive text
<h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
  Nexus Network
</h1>

// Mobile-friendly navigation
<div className="flex overflow-x-auto space-x-2 pb-2">
  {/* Horizontal scroll on mobile */}
</div>
```

---

## 🚦 Testing Your Integration

### 1. Start the Backend Service

```bash
cd nexusbackend/network-service
npm run dev
```

### 2. Test API Endpoints

```bash
# Health check
curl http://localhost:4005/health

# Get feed (no auth required)
curl http://localhost:4005/v1/network/feed

# Create post (requires auth)
curl -X POST http://localhost:4005/v1/posts/specialized \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "GENERAL", "content": "Hello Nexus!"}'
```

### 3. Frontend Integration Test

```typescript
// Test component
const IntegrationTest: React.FC = () => {
  const { client } = useNetworkClient();
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    client.getFeed({ limit: 5 })
      .then(response => setPosts(response.items))
      .catch(console.error);
  }, []);

  return (
    <div>
      <h2>Integration Test</h2>
      <p>Posts loaded: {posts.length}</p>
      {posts.map(post => (
        <div key={post.id}>{post.content}</div>
      ))}
    </div>
  );
};
```

---

## 🔧 Customization Guide

### Adding New Post Types

1. **Backend**: Add to `PostType` enum in `src/types/index.ts`
2. **Database**: Add type-specific data field in schema
3. **Frontend**: Add to components and type definitions
4. **UI**: Create custom renderer component

```typescript
// Example: Adding POLL post type

// 1. Backend enum
export enum PostType {
  // ... existing types
  POLL = 'POLL'
}

// 2. Request interface
export interface CreatePostRequest {
  // ... existing fields
  pollData?: {
    question: string;
    options: string[];
    allowMultiple: boolean;
    expiresAt?: string;
  };
}

// 3. Frontend component
const PollDisplay: React.FC<{ data: any }> = ({ data }) => (
  <div className="mt-3 p-4 bg-green-50 rounded-lg">
    <h4 className="font-semibold mb-3">{data.question}</h4>
    <div className="space-y-2">
      {data.options.map((option, index) => (
        <button
          key={index}
          className="w-full text-left p-2 border rounded hover:bg-green-100"
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

// 4. Add to PostCard renderer
case PostType.POLL:
  return post.pollData && <PollDisplay data={post.pollData} />;
```

---

## 🎯 Next Steps

### Immediate Implementation
1. ✅ **Copy Integration Files**: Move frontend-integration folder to your project
2. ✅ **Setup Context Provider**: Implement NetworkProvider in your app
3. ✅ **Create Home Page**: Use the HomePage example above
4. ✅ **Add Admin Dashboard**: Implement admin routes with role protection
5. ✅ **Configure Tailwind**: Add component paths to config

### Future Enhancements
- 🔄 **Real-time Updates**: WebSocket integration for live updates
- 🔍 **Full-text Search**: Elasticsearch integration for post search
- 📊 **Advanced Analytics**: User engagement metrics and insights
- 🔔 **Notification System**: Push notifications for interactions
- 📱 **Mobile App**: React Native integration
- 🌙 **Dark Mode**: Theme switching support

---

## 📚 API Reference

Complete API documentation is available in [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md).

## 🤝 Support

For integration support:
1. Check the API documentation
2. Review component examples
3. Test with the provided hooks
4. Verify role permissions are correctly set

**🎉 Your network service integration is now complete with full CRUD operations, role-based access control, and a comprehensive frontend interface!**
